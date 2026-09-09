import { computed, DestroyRef, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import { WorkspaceApplicationService } from '@client/core/workspace/workspace-application.service';
import {
  initialWorkspacePresenceState,
  type WorkspacePresenceView,
} from './workspace-presence.state';

/** Owns the private Presence subscription for one selected workspace. */
export const WorkspacePresenceStore = signalStore(
  withState(initialWorkspacePresenceState),
  withComputed((store) => ({
    view: computed<WorkspacePresenceView>(() => {
      if (store.status() === 'connecting') {
        return { kind: 'connecting' };
      }

      const error = store.error();
      if (store.status() === 'failed' && error !== null) {
        return { kind: 'error', error };
      }

      return { kind: 'online', count: store.onlineProfileIds().length };
    }),
  })),
  withMethods(
    (
      store,
      workspaceApplication = inject(WorkspaceApplicationService),
      destroyRef = inject(DestroyRef)
    ) => {
      let stopObservation: (() => void) | null = null;
      let observationRevision = 0;

      const stop = (resetState: boolean): void => {
        observationRevision += 1;
        stopObservation?.();
        stopObservation = null;

        if (resetState) {
          patchState(store, initialWorkspacePresenceState);
        }
      };

      const start = (workspaceId: WorkspaceId): void => {
        if (
          store.workspaceId() === workspaceId &&
          stopObservation !== null &&
          (store.status() === 'connecting' || store.status() === 'observing')
        ) {
          return;
        }

        stop(false);
        const revision = observationRevision;
        patchState(store, {
          workspaceId,
          onlineProfileIds: [],
          status: 'connecting',
          error: null,
        });

        const cleanup = workspaceApplication.observeWorkspacePresence(
          workspaceId,
          (profileIds) => {
            if (
              revision !== observationRevision ||
              store.workspaceId() !== workspaceId
            ) {
              return;
            }

            patchState(store, {
              onlineProfileIds: profileIds,
              status: 'observing',
              error: null,
            });
          },
          () => {
            if (
              revision !== observationRevision ||
              store.workspaceId() !== workspaceId
            ) {
              return;
            }

            stopObservation = null;
            patchState(store, {
              onlineProfileIds: [],
              status: 'failed',
              error: {
                message:
                  'Online presence is currently unavailable. Retry to reconnect.',
              },
            });
          }
        );

        if (
          revision === observationRevision &&
          store.workspaceId() === workspaceId &&
          store.status() !== 'failed'
        ) {
          stopObservation = cleanup;
        } else {
          cleanup();
        }
      };

      destroyRef.onDestroy(() => {
        stop(false);
      });

      return {
        /** Starts or changes the selected-workspace Presence subscription. */
        observe(workspaceId: WorkspaceId): void {
          start(workspaceId);
        },

        /** Reconnects the current workspace after an observation failure. */
        retry(): void {
          const workspaceId = store.workspaceId();
          if (workspaceId !== null && store.status() === 'failed') {
            start(workspaceId);
          }
        },
      };
    }
  )
);
