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
  ChangeWorkspaceMemberRoleError,
  RemoveWorkspaceMemberError,
  SuspendWorkspaceMemberError,
  WorkspaceMemberCursor,
} from '@omoikane/application/workspace';
import type { Profile, ProfileId } from '@omoikane/domain/profile';
import type {
  WorkspaceId,
  WorkspaceMember,
  WorkspaceMemberRole,
} from '@omoikane/domain/workspace';
import { ProfileApplicationService } from '@client/core/profile/profile-application.service';
import { WorkspaceApplicationService } from '@client/core/workspace/workspace-application.service';
import {
  initialWorkspaceMemberDirectoryState,
  type WorkspaceMemberDirectoryContent,
  type WorkspaceMemberDirectoryEntry,
  type WorkspaceMemberDirectoryView,
  type WorkspaceMemberMutationView,
} from './workspace-member-directory.state';

/**
 * Owns active-membership loading and best-effort profile enrichment for one
 * selected workspace.
 */
export const WorkspaceMemberDirectoryStore = signalStore(
  withState(initialWorkspaceMemberDirectoryState),

  withComputed((store) => ({
    entries: computed(() =>
      toDirectoryEntries(store.members(), store.profiles())
    ),
    view: computed<WorkspaceMemberDirectoryView>(() => {
      const mutationKind = store.mutationKind();
      const mutatingProfileId = store.mutatingProfileId();
      const mutation: WorkspaceMemberMutationView =
        store.mutationStatus() === 'pending' &&
        mutationKind !== null &&
        mutatingProfileId !== null
          ? { kind: mutationKind, profileId: mutatingProfileId }
          : { kind: 'idle' };

      const entries = toDirectoryEntries(store.members(), store.profiles());
      const content: WorkspaceMemberDirectoryContent = (() => {
        if (store.loadStatus() === 'loading') return { kind: 'loading' };
        const error = store.error();
        if (store.loadStatus() === 'failed' && error !== null) {
          return { kind: 'error', error };
        }
        return entries.length === 0
          ? { kind: 'empty' }
          : {
              kind: 'members',
              entries,
              pagination: {
                hasMore: store.nextCursor() !== null,
                isLoading: store.paginationStatus() === 'loading',
                error: store.paginationError(),
              },
              mutation,
            };
      })();

      return {
        isBusy:
          store.loadStatus() === 'loading' ||
          store.paginationStatus() === 'loading' ||
          store.mutationStatus() === 'pending',
        canRefresh: store.loadStatus() === 'loaded',
        mutationError: store.mutationError(),
        content,
      };
    }),
  })),

  withMethods(
    (
      store,
      workspaceApplication = inject(WorkspaceApplicationService),
      profileApplication = inject(ProfileApplicationService)
    ) => {
      let requestVersion = 0;
      let activeRequest: {
        readonly workspaceId: WorkspaceId;
        readonly promise: Promise<void>;
      } | null = null;
      let activePageRequest: Promise<void> | null = null;

      const deactivateMember = async (
        profileId: ProfileId,
        kind: 'removal' | 'suspension',
        execute: (
          workspaceId: WorkspaceId
        ) => Promise<
          Either.Either<
            void,
            RemoveWorkspaceMemberError | SuspendWorkspaceMemberError
          >
        >
      ): Promise<boolean> => {
        const workspaceId = store.workspaceId();

        if (
          workspaceId === null ||
          store.loadStatus() !== 'loaded' ||
          store.paginationStatus() === 'loading' ||
          store.mutationStatus() === 'pending'
        ) {
          return false;
        }

        const version = requestVersion;
        patchState(store, {
          mutationStatus: 'pending',
          mutationKind: kind,
          mutatingProfileId: profileId,
          mutationError: null,
        });

        const result = await execute(workspaceId);

        if (version !== requestVersion || store.workspaceId() !== workspaceId) {
          return false;
        }

        if (Either.isLeft(result)) {
          patchState(store, {
            mutationStatus: 'failed',
            mutatingProfileId: null,
            mutationError: presentMemberMutationError(result.left, kind),
          });
          return false;
        }

        patchState(store, {
          members: store
            .members()
            .filter((member) => member.profileId !== profileId),
          profiles: store
            .profiles()
            .filter((profile) => profile.id !== profileId),
          mutationStatus: 'idle',
          mutationKind: null,
          mutatingProfileId: null,
          mutationError: null,
        });
        return true;
      };

      return {
        /**
         * Loads active memberships once per workspace and enriches their
         * stable profile identities in one batch. `force` replaces all loaded
         * pages with a new authoritative first-page sequence. Profile lookup
         * is best-effort, so a profile failure retains a usable role directory.
         */
        load(
          workspaceId: WorkspaceId,
          currentProfileId: string | null = null,
          options: { readonly force?: boolean } = {}
        ): Promise<void> {
          if (
            options.force !== true &&
            store.workspaceId() === workspaceId &&
            store.loadStatus() === 'loaded'
          ) {
            return Promise.resolve();
          }

          if (activeRequest?.workspaceId === workspaceId) {
            return activeRequest.promise;
          }

          const version = ++requestVersion;
          activePageRequest = null;

          patchState(store, {
            workspaceId,
            members: [],
            profiles: [],
            loadStatus: 'loading',
            error: null,
            nextCursor: null,
            paginationStatus: 'idle',
            paginationError: null,
            mutationStatus: 'idle',
            mutationKind: null,
            mutatingProfileId: null,
            mutationError: null,
          });

          const promise = (async () => {
            let members: readonly WorkspaceMember[] = [];
            let nextCursor: WorkspaceMemberCursor | null = null;

            do {
              const membershipResult =
                await workspaceApplication.listWorkspaceMembers(
                  workspaceId,
                  nextCursor ?? undefined
                );

              if (version !== requestVersion) {
                return;
              }

              if (Either.isLeft(membershipResult)) {
                patchState(store, {
                  members: [],
                  profiles: [],
                  nextCursor: null,
                  loadStatus: 'failed',
                  error: {
                    message:
                      'Workspace members are currently unavailable. Please try again.',
                  },
                });
                return;
              }

              members = mergeMembers(members, membershipResult.right.members);
              nextCursor = membershipResult.right.nextCursor;

              const currentRoleKnown =
                currentProfileId === null ||
                members.some(
                  (member) => member.profileId === currentProfileId
                ) ||
                membershipResult.right.members.some(
                  (member) => member.role === 'member'
                ) ||
                nextCursor === null;

              if (currentRoleKnown) {
                break;
              }
            } while (nextCursor !== null);

            const profileResult = await profileApplication.listCurrentProfiles(
              members.map((member) => member.profileId)
            );

            if (version !== requestVersion) {
              return;
            }

            patchState(store, {
              members,
              profiles: Either.isRight(profileResult)
                ? profileResult.right
                : [],
              nextCursor,
              loadStatus: 'loaded',
              error: null,
            });
          })().finally(() => {
            if (version === requestVersion) {
              activeRequest = null;
            }
          });

          activeRequest = { workspaceId, promise };
          return promise;
        },

        /** Loads and enriches the next stable member page exactly once. */
        loadMore(): Promise<void> {
          const workspaceId = store.workspaceId();
          const after = store.nextCursor();

          if (
            workspaceId === null ||
            after === null ||
            store.loadStatus() !== 'loaded' ||
            store.paginationStatus() === 'loading' ||
            store.mutationStatus() === 'pending'
          ) {
            return activePageRequest ?? Promise.resolve();
          }

          const version = requestVersion;
          patchState(store, {
            paginationStatus: 'loading',
            paginationError: null,
          });

          const promise = (async () => {
            const membershipResult =
              await workspaceApplication.listWorkspaceMembers(
                workspaceId,
                after
              );

            if (
              version !== requestVersion ||
              store.workspaceId() !== workspaceId
            ) {
              return;
            }

            if (Either.isLeft(membershipResult)) {
              patchState(store, {
                paginationStatus: 'failed',
                paginationError: {
                  message:
                    'More workspace members could not be loaded. Please try again.',
                },
              });
              return;
            }

            const page = membershipResult.right;
            const profileResult = await profileApplication.listCurrentProfiles(
              page.members.map((member) => member.profileId)
            );

            if (
              version !== requestVersion ||
              store.workspaceId() !== workspaceId
            ) {
              return;
            }

            patchState(store, {
              members: mergeMembers(store.members(), page.members),
              profiles: Either.isRight(profileResult)
                ? mergeProfiles(store.profiles(), profileResult.right)
                : store.profiles(),
              nextCursor: page.nextCursor,
              paginationStatus: 'idle',
              paginationError: null,
            });
          })().finally(() => {
            if (version === requestVersion) {
              activePageRequest = null;
            }
          });

          activePageRequest = promise;
          return promise;
        },

        /**
         * Changes one role while keeping mutation state independent from the
         * directory load. The canonical membership returned by the command
         * replaces the local projection only if the workspace is still active.
         */
        async changeMemberRole(
          profileId: ProfileId,
          role: WorkspaceMemberRole
        ): Promise<boolean> {
          const workspaceId = store.workspaceId();

          if (
            workspaceId === null ||
            store.loadStatus() !== 'loaded' ||
            store.paginationStatus() === 'loading' ||
            store.mutationStatus() === 'pending'
          ) {
            return false;
          }

          const version = requestVersion;
          patchState(store, {
            mutationStatus: 'pending',
            mutationKind: 'role-change',
            mutatingProfileId: profileId,
            mutationError: null,
          });

          const result = await workspaceApplication.changeWorkspaceMemberRole({
            workspaceId,
            profileId,
            role,
          });

          if (
            version !== requestVersion ||
            store.workspaceId() !== workspaceId
          ) {
            return false;
          }

          if (Either.isLeft(result)) {
            patchState(store, {
              mutationStatus: 'failed',
              mutatingProfileId: null,
              mutationError: presentMemberMutationError(
                result.left,
                'role-change'
              ),
            });
            return false;
          }

          patchState(store, {
            members: store
              .members()
              .map((member) =>
                member.profileId === profileId ? result.right : member
              ),
            mutationStatus: 'idle',
            mutationKind: null,
            mutatingProfileId: null,
            mutationError: null,
          });
          return true;
        },

        /**
         * Removes one member only after the application command confirms the
         * canonical removed state. Profiles are presentation enrichment and
         * are discarded with the removed membership.
         */
        async removeMember(
          profileId: ProfileId,
          reason: string | null = null
        ): Promise<boolean> {
          return deactivateMember(profileId, 'removal', (workspaceId) =>
            workspaceApplication.removeWorkspaceMember({
              workspaceId,
              profileId,
              reason,
            })
          );
        },

        /**
         * Suspends one member through the same serialized mutation path used
         * by removal, then drops its now-inactive local projections.
         */
        async suspendMember(
          profileId: ProfileId,
          reason: string | null = null
        ): Promise<boolean> {
          return deactivateMember(profileId, 'suspension', (workspaceId) =>
            workspaceApplication.suspendWorkspaceMember({
              workspaceId,
              profileId,
              reason,
            })
          );
        },

        clearMemberMutationError(): void {
          if (store.mutationStatus() !== 'pending') {
            patchState(store, {
              mutationStatus: 'idle',
              mutationKind: null,
              mutatingProfileId: null,
              mutationError: null,
            });
          }
        },
      };
    }
  )
);

const mergeMembers = (
  current: readonly WorkspaceMember[],
  incoming: readonly WorkspaceMember[]
): readonly WorkspaceMember[] => {
  const byProfileId = new Map(
    current.map((member) => [member.profileId, member] as const)
  );

  for (const member of incoming) {
    byProfileId.set(member.profileId, member);
  }

  return [...byProfileId.values()];
};

const mergeProfiles = (
  current: readonly Profile[],
  incoming: readonly Profile[]
): readonly Profile[] => {
  const byProfileId = new Map(
    current.map((profile) => [profile.id, profile] as const)
  );

  for (const profile of incoming) {
    byProfileId.set(profile.id, profile);
  }

  return [...byProfileId.values()];
};

const toDirectoryEntries = (
  members: readonly WorkspaceMember[],
  profiles: readonly Profile[]
): readonly WorkspaceMemberDirectoryEntry[] => {
  const profilesById = new Map(
    profiles.map((profile) => [profile.id, profile] as const)
  );

  return members
    .map((member) => {
      const profile = profilesById.get(member.profileId);

      return {
        profileId: member.profileId,
        displayName: profile?.displayName ?? 'Another member',
        avatarUrl: profile?.avatarUrl ?? null,
        role: member.role,
      };
    })
    .sort(
      (left, right) =>
        roleOrder(left.role) - roleOrder(right.role) ||
        left.displayName.localeCompare(right.displayName) ||
        left.profileId.localeCompare(right.profileId)
    );
};

const roleOrder = (role: WorkspaceMemberDirectoryEntry['role']): number =>
  role === 'owner' ? 0 : 1;

const presentMemberMutationError = (
  error:
    | ChangeWorkspaceMemberRoleError
    | RemoveWorkspaceMemberError
    | SuspendWorkspaceMemberError,
  kind: 'role-change' | 'removal' | 'suspension'
): { readonly message: string } => {
  switch (error._tag) {
    case 'WorkspaceLastOwnerDemotionError':
      return {
        message:
          'Assign another owner before changing the last owner to a member.',
      };
    case 'WorkspaceMemberRoleChangeNotAllowedError':
      return {
        message: 'You no longer have permission to change member roles.',
      };
    case 'WorkspaceLastOwnerRemovalError':
      return {
        message: 'The last active workspace owner cannot be removed.',
      };
    case 'WorkspaceMemberRemovalNotAllowedError':
      return {
        message: 'You no longer have permission to remove workspace members.',
      };
    case 'WorkspaceLastOwnerSuspensionError':
      return {
        message: 'The last active workspace owner cannot be suspended.',
      };
    case 'WorkspaceMemberSuspensionNotAllowedError':
      return {
        message: 'You no longer have permission to suspend workspace members.',
      };
    case 'WorkspaceMemberNotFoundError':
    case 'WorkspaceMemberNotActiveError':
      return {
        message: 'This person is no longer an active workspace member.',
      };
    case 'WorkspaceMemberRoleUnchangedError':
      return { message: 'This member already has the requested role.' };
    case 'InvalidWorkspaceMemberRoleChangeInputError':
    case 'InvalidWorkspaceMemberRemovalInputError':
    case 'InvalidWorkspaceMemberSuspensionInputError':
    case 'InvalidWorkspaceMemberDataError':
    case 'WorkspaceRepositoryUnavailableError':
      return {
        message:
          kind === 'role-change'
            ? 'The member role could not be changed. Please try again.'
            : kind === 'removal'
              ? 'The workspace member could not be removed. Please try again.'
              : 'The workspace member could not be suspended. Please try again.',
      };
  }
};
