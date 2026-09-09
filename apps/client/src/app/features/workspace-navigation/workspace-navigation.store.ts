import { computed, DestroyRef, inject } from '@angular/core';
import { Either } from 'effect';
import type {
  ArchiveWorkspaceError,
  CreateWorkspaceError,
  CreateWorkspaceInput,
  LeaveWorkspaceError,
  UpdateWorkspaceError,
  UpdateWorkspaceInput,
} from '@omoikane/application/workspace';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { Workspace, WorkspaceId } from '@omoikane/domain/workspace';
import { WorkspaceApplicationService } from '@client/core/workspace/workspace-application.service';
import {
  initialWorkspaceNavigationState,
  type WorkspaceNavigationContent,
  type WorkspaceNavigationView,
} from './workspace-navigation.state';

/**
 * Owns accessible workspace discovery, realtime reconciliation, and the
 * current navigation selection.
 */
export const WorkspaceNavigationStore = signalStore(
  withState(initialWorkspaceNavigationState),

  withComputed((store) => ({
    selectedWorkspace: computed(() => {
      const selectedWorkspaceId = store.selectedWorkspaceId();

      return (
        store
          .workspaces()
          .find((workspace) => workspace.id === selectedWorkspaceId) ?? null
      );
    }),
  })),

  withComputed((store) => ({
    view: computed<WorkspaceNavigationView>(() => {
      const error = store.error();
      const content: WorkspaceNavigationContent =
        store.loadStatus() === 'loading'
          ? { kind: 'loading' }
          : store.loadStatus() === 'failed' && error !== null
            ? { kind: 'error', error }
            : {
                kind: 'ready',
                workspaces: store.workspaces(),
                selectedWorkspace: store.selectedWorkspace(),
              };

      const isCreating = store.creationStatus() === 'creating';
      const isUpdating = store.updateStatus() === 'updating';
      const isArchiving = store.archiveStatus() === 'archiving';
      const isLeaving = store.departureStatus() === 'leaving';

      return {
        content,
        operations: {
          isBusy:
            content.kind === 'loading' ||
            isCreating ||
            isUpdating ||
            isArchiving ||
            isLeaving,
          isCreating,
          isUpdating,
          isArchiving,
          isLeaving,
        },
        realtimeError: store.realtimeError(),
        creationError: store.creationError(),
        updateError: store.updateError(),
        archiveError: store.archiveError(),
        departureError: store.departureError(),
      };
    }),
  })),

  withMethods(
    (
      store,
      workspaceApplication = inject(WorkspaceApplicationService),
      destroyRef = inject(DestroyRef)
    ) => {
      let loading: Promise<void> | null = null;
      let selectionVersion = 0;
      let stopAccessObservation: (() => void) | null = null;
      let observationRevision = 0;
      const locallyIncludedWorkspaces = new Map<WorkspaceId, Workspace>();
      const locallyExcludedWorkspaceIds = new Set<WorkspaceId>();

      /**
       * Merges access granted during an initial request and applies local
       * removal tombstones until an authoritative snapshot confirms absence.
       * This prevents an older query from undoing a completed leave/archive.
       */
      const reconcileAccessibleWorkspaces = (
        workspaces: readonly Workspace[]
      ): readonly Workspace[] => {
        for (const workspaceId of locallyExcludedWorkspaceIds) {
          if (!workspaces.some((workspace) => workspace.id === workspaceId)) {
            locallyExcludedWorkspaceIds.delete(workspaceId);
          }
        }

        const included: readonly Workspace[] = [
          ...locallyIncludedWorkspaces.values(),
        ];
        locallyIncludedWorkspaces.clear();

        return workspaces
          .filter((workspace) => !locallyExcludedWorkspaceIds.has(workspace.id))
          .reduce(
            (result, workspace) => upsertWorkspace(result, workspace),
            included
          );
      };

      const selectionIsObsolete = (
        workspaceId: WorkspaceId,
        version: number
      ): boolean =>
        version !== selectionVersion ||
        store.selectedWorkspaceId() !== workspaceId;

      const removeAccessibleWorkspace = (workspaceId: WorkspaceId): void => {
        locallyIncludedWorkspaces.delete(workspaceId);
        locallyExcludedWorkspaceIds.add(workspaceId);
        const targetStillSelected = store.selectedWorkspaceId() === workspaceId;

        if (targetStillSelected) {
          selectionVersion += 1;
        }

        patchState(store, {
          workspaces: store
            .workspaces()
            .filter((workspace) => workspace.id !== workspaceId),
          ...(targetStillSelected ? { selectedWorkspaceId: null } : {}),
        });
      };

      const stopRealtime = (updateState: boolean): void => {
        observationRevision += 1;
        stopAccessObservation?.();
        stopAccessObservation = null;

        if (updateState) {
          patchState(store, {
            realtimeStatus: 'idle',
            realtimeError: null,
          });
        }
      };

      const applyAccessibleWorkspaces = (
        revision: number,
        workspaces: readonly Workspace[]
      ): void => {
        if (revision !== observationRevision) {
          return;
        }

        const reconciled = reconcileAccessibleWorkspaces(workspaces);
        const selectedWorkspaceId = store.selectedWorkspaceId();
        const selectionLost =
          selectedWorkspaceId !== null &&
          !reconciled.some((workspace) => workspace.id === selectedWorkspaceId);

        if (selectionLost) {
          selectionVersion += 1;
        }

        patchState(store, {
          workspaces: reconciled,
          ...(selectionLost
            ? {
                selectedWorkspaceId: null,
                updateStatus: 'idle' as const,
                updateError: null,
                archiveStatus: 'idle' as const,
                archivingWorkspaceId: null,
                archiveError: null,
                departureStatus: 'idle' as const,
                departingWorkspaceId: null,
                departureError: null,
              }
            : {}),
          realtimeStatus: 'observing',
          realtimeError: null,
        });
      };

      const applyRealtimeError = (revision: number): void => {
        if (revision !== observationRevision) {
          return;
        }

        stopAccessObservation = null;
        patchState(store, {
          realtimeStatus: 'failed',
          realtimeError: {
            message:
              'Live workspace access updates are unavailable. Retry to reconnect.',
          },
        });
      };

      const startRealtime = (): void => {
        if (store.loadStatus() !== 'loaded') {
          return;
        }

        if (
          stopAccessObservation !== null &&
          store.realtimeStatus() === 'observing'
        ) {
          return;
        }

        stopRealtime(false);
        const revision = observationRevision;

        patchState(store, {
          realtimeStatus: 'observing',
          realtimeError: null,
        });

        const cleanup = workspaceApplication.observeAccessibleWorkspaces(
          (workspaces) => {
            applyAccessibleWorkspaces(revision, workspaces);
          },
          () => {
            applyRealtimeError(revision);
          }
        );

        if (
          revision === observationRevision &&
          store.realtimeStatus() === 'observing'
        ) {
          stopAccessObservation = cleanup;
        } else {
          cleanup();
        }
      };

      destroyRef.onDestroy(() => {
        stopRealtime(false);
      });

      return {
        /**
         * Reconciles access granted by invitation acceptance, including while
         * the initial workspace query is still in flight.
         */
        includeAccessibleWorkspace(workspace: Workspace): void {
          locallyExcludedWorkspaceIds.delete(workspace.id);

          if (store.loadStatus() === 'loaded') {
            patchState(store, {
              workspaces: upsertWorkspace(store.workspaces(), workspace),
            });
          } else {
            locallyIncludedWorkspaces.set(workspace.id, workspace);
          }
        },

        /**
         * Loads accessible workspaces once. Concurrent calls share the active
         * request, while failed loads may be retried.
         */
        load(): Promise<void> {
          if (store.loadStatus() === 'loaded') {
            return Promise.resolve();
          }

          if (loading !== null) {
            return loading;
          }

          patchState(store, {
            loadStatus: 'loading',
            error: null,
            creationStatus: 'idle',
            creationError: null,
            updateStatus: 'idle',
            updateError: null,
            archiveStatus: 'idle',
            archivingWorkspaceId: null,
            archiveError: null,
            departureStatus: 'idle',
            departingWorkspaceId: null,
            departureError: null,
          });

          loading = workspaceApplication
            .listAccessibleWorkspaces()
            .then((result) => {
              Either.match(result, {
                onLeft: () => {
                  selectionVersion += 1;
                  locallyIncludedWorkspaces.clear();
                  patchState(store, {
                    workspaces: [],
                    selectedWorkspaceId: null,
                    loadStatus: 'failed',
                    error: {
                      message:
                        'Workspaces are currently unavailable. Please try again.',
                    },
                  });
                },
                onRight: (workspaces) => {
                  selectionVersion += 1;
                  patchState(store, {
                    workspaces: reconcileAccessibleWorkspaces(workspaces),
                    selectedWorkspaceId: null,
                    loadStatus: 'loaded',
                    error: null,
                  });
                  startRealtime();
                },
              });
            })
            .finally(() => {
              loading = null;
            });

          return loading;
        },

        /** Restarts workspace-access observation after a visible failure. */
        retryRealtime(): void {
          startRealtime();
        },

        /**
         * Selects a workspace from the currently loaded accessible collection.
         */
        select(workspaceId: WorkspaceId): boolean {
          if (
            !store
              .workspaces()
              .some((workspace) => workspace.id === workspaceId)
          ) {
            return false;
          }

          const selectionChanged = store.selectedWorkspaceId() !== workspaceId;

          if (selectionChanged) {
            selectionVersion += 1;
          }

          patchState(store, {
            selectedWorkspaceId: workspaceId,
            ...(selectionChanged
              ? { updateStatus: 'idle' as const, updateError: null }
              : {}),
            ...(selectionChanged && store.archiveStatus() !== 'archiving'
              ? {
                  archiveStatus: 'idle' as const,
                  archivingWorkspaceId: null,
                  archiveError: null,
                }
              : {}),
            ...(selectionChanged && store.departureStatus() !== 'leaving'
              ? {
                  departureStatus: 'idle' as const,
                  departingWorkspaceId: null,
                  departureError: null,
                }
              : {}),
          });

          return true;
        },

        /**
         * Clears presentation selection without reloading the collection.
         */
        clearSelection(): void {
          if (store.selectedWorkspaceId() !== null) {
            selectionVersion += 1;
          }

          patchState(store, {
            selectedWorkspaceId: null,
            updateStatus: 'idle',
            updateError: null,
            ...(store.archiveStatus() === 'archiving'
              ? {}
              : {
                  archiveStatus: 'idle' as const,
                  archivingWorkspaceId: null,
                  archiveError: null,
                }),
            ...(store.departureStatus() === 'leaving'
              ? {}
              : {
                  departureStatus: 'idle' as const,
                  departingWorkspaceId: null,
                  departureError: null,
                }),
          });
        },

        /**
         * Creates a workspace and inserts the canonical result into navigation.
         */
        async createWorkspace(
          input: CreateWorkspaceInput
        ): Promise<Workspace | null> {
          if (
            store.loadStatus() !== 'loaded' ||
            store.creationStatus() === 'creating' ||
            store.updateStatus() === 'updating' ||
            store.archiveStatus() === 'archiving' ||
            store.departureStatus() === 'leaving'
          ) {
            return null;
          }

          patchState(store, {
            creationStatus: 'creating',
            creationError: null,
          });

          const result = await workspaceApplication.createWorkspace(input);

          return Either.match(result, {
            onLeft: (error) => {
              patchState(store, {
                creationStatus: 'failed',
                creationError: toWorkspaceCreationError(error),
              });

              return null;
            },
            onRight: (workspace) => {
              patchState(store, {
                workspaces: upsertWorkspace(store.workspaces(), workspace),
                creationStatus: 'idle',
                creationError: null,
              });

              return workspace;
            },
          });
        },

        clearCreationError(): void {
          patchState(store, {
            creationStatus: 'idle',
            creationError: null,
          });
        },

        /**
         * Replaces the selected workspace with the canonical application
         * result. A selection generation prevents a late response from
         * updating a workspace after navigation moved elsewhere and back.
         */
        async updateSelectedWorkspace(
          details: Omit<UpdateWorkspaceInput, 'workspaceId'>
        ): Promise<Workspace | null> {
          const workspaceId = store.selectedWorkspaceId();

          if (
            workspaceId === null ||
            store.loadStatus() !== 'loaded' ||
            store.updateStatus() === 'updating' ||
            store.creationStatus() === 'creating' ||
            store.archiveStatus() === 'archiving' ||
            store.departureStatus() === 'leaving'
          ) {
            return null;
          }

          const version = selectionVersion;
          patchState(store, {
            updateStatus: 'updating',
            updateError: null,
          });

          const result = await workspaceApplication.updateWorkspace({
            workspaceId,
            ...details,
          });

          if (selectionIsObsolete(workspaceId, version)) {
            return null;
          }

          return Either.match(result, {
            onLeft: (error) => {
              patchState(store, {
                updateStatus: 'failed',
                updateError: toWorkspaceUpdateError(error),
              });

              return null;
            },
            onRight: (workspace) => {
              patchState(store, {
                workspaces: upsertWorkspace(store.workspaces(), workspace),
                updateStatus: 'idle',
                updateError: null,
              });

              return workspace;
            },
          });
        },

        clearUpdateError(): void {
          if (store.updateStatus() !== 'updating') {
            patchState(store, {
              updateStatus: 'idle',
              updateError: null,
            });
          }
        },

        /**
         * Archives the selected workspace through one serialized command.
         *
         * A successful provider mutation is reconciled by stable identity even
         * after navigation changes. Selection is cleared only when the target
         * is still selected; failures from an obsolete selection are hidden.
         */
        async archiveSelectedWorkspace(): Promise<WorkspaceId | null> {
          const workspaceId = store.selectedWorkspaceId();

          if (
            workspaceId === null ||
            store.loadStatus() !== 'loaded' ||
            store.creationStatus() === 'creating' ||
            store.updateStatus() === 'updating' ||
            store.archiveStatus() === 'archiving' ||
            store.departureStatus() === 'leaving'
          ) {
            return null;
          }

          const version = selectionVersion;
          patchState(store, {
            archiveStatus: 'archiving',
            archivingWorkspaceId: workspaceId,
            archiveError: null,
          });

          const result = await workspaceApplication.archiveWorkspace({
            workspaceId,
          });

          if (Either.isLeft(result)) {
            if (selectionIsObsolete(workspaceId, version)) {
              patchState(store, {
                archiveStatus: 'idle',
                archivingWorkspaceId: null,
                archiveError: null,
              });
              return null;
            }

            patchState(store, {
              archiveStatus: 'failed',
              archivingWorkspaceId: null,
              archiveError: toWorkspaceArchiveError(result.left),
            });
            return null;
          }

          removeAccessibleWorkspace(workspaceId);
          patchState(store, {
            archiveStatus: 'idle',
            archivingWorkspaceId: null,
            archiveError: null,
          });

          return workspaceId;
        },

        clearArchiveError(): void {
          if (store.archiveStatus() !== 'archiving') {
            patchState(store, {
              archiveStatus: 'idle',
              archivingWorkspaceId: null,
              archiveError: null,
            });
          }
        },

        /**
         * Removes the authenticated user's membership through one serialized
         * command and reconciles the accessible collection by stable identity.
         * A late success is retained, while an obsolete failure is hidden.
         */
        async leaveSelectedWorkspace(): Promise<WorkspaceId | null> {
          const workspaceId = store.selectedWorkspaceId();

          if (
            workspaceId === null ||
            store.loadStatus() !== 'loaded' ||
            store.creationStatus() === 'creating' ||
            store.updateStatus() === 'updating' ||
            store.archiveStatus() === 'archiving' ||
            store.departureStatus() === 'leaving'
          ) {
            return null;
          }

          const version = selectionVersion;
          patchState(store, {
            departureStatus: 'leaving',
            departingWorkspaceId: workspaceId,
            departureError: null,
          });

          const result = await workspaceApplication.leaveWorkspace({
            workspaceId,
          });

          if (Either.isLeft(result)) {
            if (selectionIsObsolete(workspaceId, version)) {
              patchState(store, {
                departureStatus: 'idle',
                departingWorkspaceId: null,
                departureError: null,
              });
              return null;
            }

            patchState(store, {
              departureStatus: 'failed',
              departingWorkspaceId: null,
              departureError: toWorkspaceDepartureError(result.left),
            });
            return null;
          }

          removeAccessibleWorkspace(workspaceId);
          patchState(store, {
            departureStatus: 'idle',
            departingWorkspaceId: null,
            departureError: null,
          });

          return workspaceId;
        },

        clearDepartureError(): void {
          if (store.departureStatus() !== 'leaving') {
            patchState(store, {
              departureStatus: 'idle',
              departingWorkspaceId: null,
              departureError: null,
            });
          }
        },
      };
    }
  )
);

const upsertWorkspace = (
  workspaces: readonly Workspace[],
  created: Workspace
): readonly Workspace[] =>
  [
    ...workspaces.filter((workspace) => workspace.id !== created.id),
    created,
  ].sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  );

const toWorkspaceCreationError = (
  error: CreateWorkspaceError
): { readonly message: string } => {
  switch (error._tag) {
    case 'InvalidWorkspaceCreationInputError':
      return {
        message:
          error.field === 'name'
            ? 'Enter a workspace name.'
            : error.field === 'slug'
              ? 'Use lowercase letters, numbers, and single hyphens for the workspace URL.'
              : 'Check the workspace description and try again.',
      };

    case 'WorkspaceSlugUnavailableError':
      return {
        message: 'That workspace URL is already in use.',
      };

    default:
      return {
        message: 'The workspace could not be created. Please try again.',
      };
  }
};

const toWorkspaceUpdateError = (
  error: UpdateWorkspaceError
): { readonly message: string } => {
  switch (error._tag) {
    case 'InvalidWorkspaceUpdateInputError':
      return {
        message:
          error.field === 'name'
            ? 'Enter a workspace name.'
            : error.field === 'slug'
              ? 'Use lowercase letters, numbers, and single hyphens for the workspace URL.'
              : error.field === 'description'
                ? 'Check the workspace description and try again.'
                : 'The selected workspace is invalid.',
      };
    case 'WorkspaceSlugUnavailableError':
      return { message: 'That workspace URL is already in use.' };
    case 'WorkspaceUpdateNotAllowedError':
      return {
        message: 'You no longer have permission to edit this workspace.',
      };
    case 'InvalidWorkspaceDataError':
    case 'WorkspaceRepositoryUnavailableError':
      return {
        message: 'The workspace could not be updated. Please try again.',
      };
  }
};

const toWorkspaceArchiveError = (
  error: ArchiveWorkspaceError
): { readonly message: string } => {
  switch (error._tag) {
    case 'WorkspaceArchiveNotAllowedError':
      return {
        message: 'You no longer have permission to archive this workspace.',
      };
    case 'InvalidWorkspaceArchiveInputError':
    case 'InvalidWorkspaceDataError':
    case 'WorkspaceRepositoryUnavailableError':
      return {
        message: 'The workspace could not be archived. Please try again.',
      };
  }
};

const toWorkspaceDepartureError = (
  error: LeaveWorkspaceError
): { readonly message: string } => {
  switch (error._tag) {
    case 'WorkspaceLastOwnerDepartureError':
      return {
        message: 'Assign another active owner before leaving this workspace.',
      };
    case 'WorkspaceDepartureNotAllowedError':
      return {
        message: 'You can no longer leave this workspace.',
      };
    case 'InvalidWorkspaceDepartureInputError':
    case 'InvalidWorkspaceMemberDataError':
    case 'WorkspaceRepositoryUnavailableError':
      return {
        message: 'The workspace could not be left. Please try again.',
      };
  }
};
