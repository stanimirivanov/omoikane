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
  RestoreWorkspaceError,
  WorkspaceRepositoryReadError,
} from '@omoikane/application/workspace';
import type { Workspace, WorkspaceId } from '@omoikane/domain/workspace';
import { WorkspaceApplicationService } from '@client/core/workspace/workspace-application.service';
import {
  initialArchivedWorkspaceListState,
  type ArchivedWorkspaceListContent,
  type ArchivedWorkspaceListView,
} from './archived-workspace-list.state';

/** Owns independent archived-workspace discovery and restoration lifecycles. */
export const ArchivedWorkspaceListStore = signalStore(
  withState(initialArchivedWorkspaceListState),
  withComputed((store) => ({
    view: computed<ArchivedWorkspaceListView>(() => {
      const content: ArchivedWorkspaceListContent = (() => {
        if (store.loadStatus() === 'loading') {
          return { kind: 'loading' };
        }

        const error = store.error();
        if (store.loadStatus() === 'failed' && error !== null) {
          return { kind: 'error', error };
        }

        const workspaces = store.workspaces();
        return workspaces.length === 0
          ? { kind: 'empty' }
          : { kind: 'workspaces', workspaces };
      })();

      return {
        content,
        isRestoring: store.restorationStatus() === 'restoring',
        restorationError: store.restorationError(),
      };
    }),
  })),
  withMethods(
    (store, workspaceApplication = inject(WorkspaceApplicationService)) => {
      let loading: Promise<void> | null = null;

      return {
        clearRestorationError(): void {
          if (store.restorationStatus() === 'failed') {
            patchState(store, {
              restorationStatus: 'idle',
              restorationError: null,
            });
          }
        },

        /**
         * Loads once and coalesces concurrent calls. `force` reconciles a
         * active-navigation identity change without another realtime listener.
         */
        load(force = false): Promise<void> {
          if (!force && store.loadStatus() === 'loaded') {
            return Promise.resolve();
          }

          if (loading !== null) {
            return loading;
          }

          patchState(store, { loadStatus: 'loading', error: null });

          loading = workspaceApplication
            .listArchivedWorkspaces()
            .then((result) => {
              if (Either.isLeft(result)) {
                patchState(store, {
                  workspaces: [],
                  loadStatus: 'failed',
                  error: presentArchivedWorkspaceError(result.left),
                });
                return;
              }

              patchState(store, {
                workspaces: result.right,
                loadStatus: 'loaded',
                error: null,
              });
            })
            .finally(() => {
              loading = null;
            });

          return loading;
        },

        /** Restores one listed identity and removes its archived projection. */
        async restore(workspaceId: WorkspaceId): Promise<Workspace | null> {
          if (
            store.loadStatus() !== 'loaded' ||
            store.restorationStatus() === 'restoring' ||
            !store
              .workspaces()
              .some((workspace) => workspace.id === workspaceId)
          ) {
            return null;
          }

          patchState(store, {
            restorationStatus: 'restoring',
            restoringWorkspaceId: workspaceId,
            restorationError: null,
          });

          const result = await workspaceApplication.restoreWorkspace({
            workspaceId,
          });

          if (Either.isLeft(result)) {
            patchState(store, {
              restorationStatus: 'failed',
              restoringWorkspaceId: null,
              restorationError: presentWorkspaceRestorationError(result.left),
            });
            return null;
          }

          patchState(store, {
            workspaces: store
              .workspaces()
              .filter((workspace) => workspace.id !== workspaceId),
            restorationStatus: 'idle',
            restoringWorkspaceId: null,
            restorationError: null,
          });
          return result.right;
        },
      };
    }
  )
);

const presentArchivedWorkspaceError = (
  error: WorkspaceRepositoryReadError
) => ({
  message:
    error._tag === 'InvalidWorkspaceDataError'
      ? 'Archived workspace data is invalid. Please contact support.'
      : 'Archived workspaces could not be loaded. Please try again.',
});

const presentWorkspaceRestorationError = (error: RestoreWorkspaceError) => ({
  message:
    error._tag === 'WorkspaceRestoreNotAllowedError'
      ? 'This workspace cannot be restored. It may already be active, or your session may not have owner access.'
      : error._tag === 'InvalidWorkspaceDataError'
        ? 'The restored workspace data is invalid. Please contact support.'
        : 'The workspace could not be restored. Please try again.',
});
