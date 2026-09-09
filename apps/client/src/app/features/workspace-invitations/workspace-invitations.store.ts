import { computed, inject } from '@angular/core';
import { Either } from 'effect';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type {
  AcceptWorkspaceInvitationError,
  CancelWorkspaceInvitationError,
  DeclineWorkspaceInvitationError,
  InviteWorkspaceMemberByUsernameError,
  ListPendingWorkspaceInvitationsForOwnerError,
  PendingWorkspaceInvitation,
} from '@omoikane/application/workspace';
import type {
  Workspace,
  WorkspaceId,
  WorkspaceInvitationId,
} from '@omoikane/domain/workspace';
import { WorkspaceApplicationService } from '@client/core/workspace/workspace-application.service';
import {
  initialWorkspaceInvitationsState,
  type WorkspaceInvitationCreationFeedback,
  type WorkspaceInvitationOwnerView,
  type WorkspaceInvitationRecipientView,
  type WorkspaceInvitationResponseKind,
  type WorkspaceInvitationResponseView,
  type WorkspaceInvitationsView,
} from './workspace-invitations.state';

/** Owns recipient consent and selected-workspace owner invitation management. */
export const WorkspaceInvitationsStore = signalStore(
  withState(initialWorkspaceInvitationsState),

  withComputed((store) => ({
    view: computed<WorkspaceInvitationsView>(() => {
      const responseKind = store.responseKind();
      const respondingInvitationId = store.respondingInvitationId();
      const response: WorkspaceInvitationResponseView =
        store.responseStatus() === 'pending' &&
        responseKind !== null &&
        respondingInvitationId !== null
          ? {
              kind: responseKind,
              invitationId: respondingInvitationId,
            }
          : { kind: 'idle' };

      const invitations = store.invitations();
      const recipient: WorkspaceInvitationRecipientView = (() => {
        if (store.loadStatus() === 'loading') return { kind: 'loading' };
        const error = store.error();
        if (store.loadStatus() === 'failed' && error !== null) {
          return { kind: 'error', error };
        }
        return invitations.length === 0
          ? { kind: 'empty' }
          : {
              kind: 'invitations',
              invitations,
              response,
              responseError: store.responseError(),
            };
      })();

      const owner: WorkspaceInvitationOwnerView = (() => {
        if (store.ownerLoadStatus() === 'idle') return { kind: 'idle' };
        if (store.ownerLoadStatus() === 'loading') return { kind: 'loading' };
        const error = store.ownerError();
        if (store.ownerLoadStatus() === 'failed' && error !== null) {
          return { kind: 'error', error };
        }
        return {
          kind: 'ready',
          invitations: store.managedInvitations(),
          isMutating:
            store.creationStatus() === 'pending' ||
            store.cancellationStatus() === 'pending',
          isCreating: store.creationStatus() === 'pending',
          cancellationError: store.cancellationError(),
        };
      })();

      const creationError = store.creationError();
      const creationFeedback: WorkspaceInvitationCreationFeedback =
        store.creationStatus() === 'succeeded'
          ? { kind: 'succeeded' }
          : store.creationStatus() === 'failed' && creationError !== null
            ? { kind: 'error', error: creationError }
            : { kind: 'none' };

      return {
        isBusy:
          store.loadStatus() === 'loading' ||
          store.creationStatus() === 'pending' ||
          store.responseStatus() === 'pending' ||
          store.ownerLoadStatus() === 'loading' ||
          store.cancellationStatus() === 'pending',
        recipient,
        owner,
        creationFeedback,
      };
    }),
  })),

  withMethods(
    (store, workspaceApplication = inject(WorkspaceApplicationService)) => {
      let loading: Promise<void> | null = null;
      let ownerRequestVersion = 0;
      let ownerLoading: {
        readonly workspaceId: WorkspaceId;
        readonly promise: Promise<void>;
      } | null = null;

      const loadManagedInvitations = (
        workspaceId: WorkspaceId | null,
        force = false
      ): Promise<void> => {
        if (workspaceId === null) {
          ownerRequestVersion++;
          ownerLoading = null;
          patchState(store, {
            ownerWorkspaceId: null,
            managedInvitations: [],
            ownerLoadStatus: 'idle',
            ownerError: null,
            creationStatus: 'idle',
            creationError: null,
            cancellationStatus: 'idle',
            cancellingInvitationId: null,
            cancellationError: null,
          });
          return Promise.resolve();
        }

        if (
          !force &&
          store.ownerWorkspaceId() === workspaceId &&
          store.ownerLoadStatus() === 'loaded'
        ) {
          return Promise.resolve();
        }

        if (!force && ownerLoading?.workspaceId === workspaceId) {
          return ownerLoading.promise;
        }

        const workspaceChanged = store.ownerWorkspaceId() !== workspaceId;
        const version = ++ownerRequestVersion;

        patchState(store, {
          ownerWorkspaceId: workspaceId,
          ...(workspaceChanged ? { managedInvitations: [] } : {}),
          ownerLoadStatus: 'loading',
          ownerError: null,
          ...(workspaceChanged
            ? {
                creationStatus: 'idle' as const,
                creationError: null,
                cancellationStatus: 'idle' as const,
                cancellingInvitationId: null,
                cancellationError: null,
              }
            : {}),
        });

        const promise = workspaceApplication
          .listPendingWorkspaceInvitationsForOwner({ workspaceId })
          .then((result) => {
            if (
              version !== ownerRequestVersion ||
              store.ownerWorkspaceId() !== workspaceId
            ) {
              return;
            }

            if (Either.isLeft(result)) {
              patchState(store, {
                managedInvitations: [],
                ownerLoadStatus: 'failed',
                ownerError: presentOwnerListError(result.left),
              });
              return;
            }

            patchState(store, {
              managedInvitations: result.right,
              ownerLoadStatus: 'loaded',
              ownerError: null,
            });
          })
          .finally(() => {
            if (version === ownerRequestVersion) {
              ownerLoading = null;
            }
          });

        ownerLoading = { workspaceId, promise };
        return promise;
      };

      const respondToInvitation = async (
        invitationId: WorkspaceInvitationId,
        kind: WorkspaceInvitationResponseKind,
        execute: () => Promise<
          Either.Either<
            unknown,
            AcceptWorkspaceInvitationError | DeclineWorkspaceInvitationError
          >
        >
      ): Promise<PendingWorkspaceInvitation | null> => {
        if (
          store.loadStatus() !== 'loaded' ||
          store.responseStatus() === 'pending'
        ) {
          return null;
        }

        const invitation = store
          .invitations()
          .find((candidate) => candidate.invitation.id === invitationId);

        if (invitation === undefined) {
          return null;
        }

        patchState(store, {
          responseStatus: 'pending',
          responseKind: kind,
          respondingInvitationId: invitationId,
          responseError: null,
        });

        const result = await execute();

        if (Either.isLeft(result)) {
          const responseNoLongerAvailable =
            result.left._tag === 'WorkspaceInvitationResponseNotAllowedError';

          patchState(store, {
            ...(responseNoLongerAvailable
              ? {
                  invitations: store
                    .invitations()
                    .filter(
                      (candidate) => candidate.invitation.id !== invitationId
                    ),
                }
              : {}),
            responseStatus: 'failed',
            responseKind: kind,
            respondingInvitationId: null,
            responseError: presentResponseError(result.left),
          });
          return null;
        }

        patchState(store, {
          invitations: store
            .invitations()
            .filter((candidate) => candidate.invitation.id !== invitationId),
          responseStatus: 'idle',
          responseKind: null,
          respondingInvitationId: null,
          responseError: null,
        });
        return invitation;
      };

      return {
        /** Loads pending invitations once; failed requests may be retried. */
        load(): Promise<void> {
          if (store.loadStatus() === 'loaded') {
            return Promise.resolve();
          }

          if (loading !== null) {
            return loading;
          }

          patchState(store, { loadStatus: 'loading', error: null });

          loading = workspaceApplication
            .listPendingWorkspaceInvitations()
            .then((result) => {
              if (Either.isLeft(result)) {
                patchState(store, {
                  invitations: [],
                  loadStatus: 'failed',
                  error: {
                    message:
                      'Workspace invitations are currently unavailable. Please try again.',
                  },
                });
                return;
              }

              patchState(store, {
                invitations: result.right,
                loadStatus: 'loaded',
                error: null,
              });
            })
            .finally(() => {
              loading = null;
            });

          return loading;
        },

        /** Loads owner-managed invitations for the current selected workspace. */
        loadManagedInvitations,

        /** Creates a pending invitation for an exact active username. */
        async invite(
          workspaceId: WorkspaceId,
          username: string
        ): Promise<boolean> {
          if (
            store.ownerWorkspaceId() !== workspaceId ||
            store.creationStatus() === 'pending' ||
            store.cancellationStatus() === 'pending'
          ) {
            return false;
          }

          const version = ownerRequestVersion;

          patchState(store, {
            creationStatus: 'pending',
            creationError: null,
          });

          const result =
            await workspaceApplication.inviteWorkspaceMemberByUsername({
              workspaceId,
              username,
            });

          if (
            version !== ownerRequestVersion ||
            store.ownerWorkspaceId() !== workspaceId
          ) {
            return false;
          }

          if (Either.isLeft(result)) {
            patchState(store, {
              creationStatus: 'failed',
              creationError: presentCreationError(result.left),
            });
            return false;
          }

          patchState(store, {
            creationStatus: 'succeeded',
            creationError: null,
          });
          await loadManagedInvitations(workspaceId, true);
          return true;
        },

        /** Cancels and removes one selected-workspace pending invitation. */
        async cancel(invitationId: WorkspaceInvitationId): Promise<boolean> {
          const workspaceId = store.ownerWorkspaceId();

          if (
            workspaceId === null ||
            store.ownerLoadStatus() !== 'loaded' ||
            store.creationStatus() === 'pending' ||
            store.cancellationStatus() === 'pending' ||
            !store
              .managedInvitations()
              .some((entry) => entry.invitation.id === invitationId)
          ) {
            return false;
          }

          const version = ownerRequestVersion;
          patchState(store, {
            cancellationStatus: 'pending',
            cancellingInvitationId: invitationId,
            cancellationError: null,
          });

          const result = await workspaceApplication.cancelWorkspaceInvitation({
            invitationId,
          });

          if (
            version !== ownerRequestVersion ||
            store.ownerWorkspaceId() !== workspaceId
          ) {
            return false;
          }

          if (Either.isLeft(result)) {
            const noLongerAvailable =
              result.left._tag ===
              'WorkspaceInvitationCancellationNotAllowedError';

            patchState(store, {
              ...(noLongerAvailable
                ? {
                    managedInvitations: store
                      .managedInvitations()
                      .filter((entry) => entry.invitation.id !== invitationId),
                  }
                : {}),
              cancellationStatus: 'failed',
              cancellingInvitationId: null,
              cancellationError: presentCancellationError(result.left),
            });
            return false;
          }

          patchState(store, {
            managedInvitations: store
              .managedInvitations()
              .filter((entry) => entry.invitation.id !== invitationId),
            cancellationStatus: 'idle',
            cancellingInvitationId: null,
            cancellationError: null,
          });
          return true;
        },

        /** Accepts and removes one pending invitation from local presentation. */
        async accept(
          invitationId: WorkspaceInvitationId
        ): Promise<Workspace | null> {
          const invitation = await respondToInvitation(
            invitationId,
            'accept',
            () =>
              workspaceApplication.acceptWorkspaceInvitation({ invitationId })
          );

          return invitation?.workspace ?? null;
        },

        /** Declines and removes one pending invitation from local presentation. */
        async decline(invitationId: WorkspaceInvitationId): Promise<boolean> {
          return (
            (await respondToInvitation(invitationId, 'decline', () =>
              workspaceApplication.declineWorkspaceInvitation({ invitationId })
            )) !== null
          );
        },

        clearCreationFeedback(): void {
          if (store.creationStatus() !== 'pending') {
            patchState(store, {
              creationStatus: 'idle',
              creationError: null,
            });
          }
        },

        clearResponseError(): void {
          if (store.responseStatus() !== 'pending') {
            patchState(store, {
              responseStatus: 'idle',
              responseKind: null,
              respondingInvitationId: null,
              responseError: null,
            });
          }
        },

        clearCancellationError(): void {
          if (store.cancellationStatus() !== 'pending') {
            patchState(store, {
              cancellationStatus: 'idle',
              cancellingInvitationId: null,
              cancellationError: null,
            });
          }
        },
      };
    }
  )
);

const presentCreationError = (
  error: InviteWorkspaceMemberByUsernameError
): { readonly message: string } => {
  switch (error._tag) {
    case 'InvalidWorkspaceInvitationCreationInputError':
      return {
        message:
          error.field === 'username'
            ? 'Enter an exact username.'
            : 'The selected workspace is invalid.',
      };
    case 'WorkspaceInvitationCandidateNotFoundError':
      return { message: 'No active profile was found for that username.' };
    case 'WorkspaceInvitationCreationNotAllowedError':
      return { message: 'You no longer have permission to invite members.' };
    case 'WorkspaceInvitationProfileNotActiveError':
      return { message: 'That profile is no longer active.' };
    case 'WorkspaceInvitationMemberAlreadyActiveError':
      return { message: 'That user is already an active workspace member.' };
    case 'WorkspaceInvitationAlreadyPendingError':
      return { message: 'That user already has a pending invitation.' };
    case 'InvalidProfileDataError':
    case 'ProfileRepositoryUnavailableError':
    case 'InvalidWorkspaceInvitationDataError':
    case 'WorkspaceRepositoryUnavailableError':
      return {
        message:
          'The workspace invitation could not be sent. Please try again.',
      };
  }
};

const presentResponseError = (
  error: AcceptWorkspaceInvitationError | DeclineWorkspaceInvitationError
): { readonly message: string } => {
  switch (error._tag) {
    case 'WorkspaceInvitationResponseNotAllowedError':
      return {
        message:
          'This invitation is no longer pending or cannot be answered by this account.',
      };
    case 'InvalidWorkspaceInvitationAcceptanceInputError':
    case 'InvalidWorkspaceInvitationDeclineInputError':
    case 'InvalidWorkspaceInvitationDataError':
    case 'InvalidWorkspaceMemberDataError':
    case 'WorkspaceRepositoryUnavailableError':
      return {
        message:
          'The invitation response could not be saved. Please try again.',
      };
  }
};

const presentOwnerListError = (
  error: ListPendingWorkspaceInvitationsForOwnerError
): { readonly message: string } => {
  switch (error._tag) {
    case 'WorkspaceInvitationManagementNotAllowedError':
      return {
        message: 'You no longer have permission to manage invitations here.',
      };
    case 'InvalidWorkspaceInvitationOwnerListInputError':
    case 'InvalidWorkspaceInvitationDataError':
    case 'WorkspaceRepositoryUnavailableError':
      return {
        message:
          'Pending workspace invitations are currently unavailable. Please try again.',
      };
  }
};

const presentCancellationError = (
  error: CancelWorkspaceInvitationError
): { readonly message: string } => {
  switch (error._tag) {
    case 'WorkspaceInvitationCancellationNotAllowedError':
      return {
        message:
          'This invitation is no longer pending or you can no longer cancel it.',
      };
    case 'InvalidWorkspaceInvitationCancellationInputError':
    case 'InvalidWorkspaceInvitationDataError':
    case 'WorkspaceRepositoryUnavailableError':
      return {
        message: 'The invitation could not be cancelled. Please try again.',
      };
  }
};
