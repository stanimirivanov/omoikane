import { computed, inject } from '@angular/core';
import { Either } from 'effect';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import { MessageApplicationService } from '@client/core/message/message-application.service';
import {
  initialWorkspaceMessageSearchState,
  type WorkspaceMessageSearchView,
} from './workspace-message-search.state';

/** Owns request and result state for workspace-scoped message search. */
export const WorkspaceMessageSearchStore = signalStore(
  withState(initialWorkspaceMessageSearchState),
  withComputed((store) => ({
    view: computed<WorkspaceMessageSearchView>(() => {
      const query = store.query();

      switch (store.status()) {
        case 'idle':
          return { kind: 'idle', query };
        case 'searching':
          return { kind: 'searching', query };
        case 'failed':
          return {
            kind: 'error',
            query,
            message:
              store.error() ?? 'Message search is currently unavailable.',
          };
        case 'completed': {
          const results = store.results();
          return results.length === 0
            ? { kind: 'empty', query }
            : { kind: 'results', query, results };
        }
      }
    }),
  })),
  withMethods(
    (store, messageApplication = inject(MessageApplicationService)) => ({
      /** Resets results when the owning workspace selection changes. */
      selectWorkspace(workspaceId: WorkspaceId): void {
        if (store.workspaceId() === workspaceId) {
          return;
        }

        patchState(store, {
          ...initialWorkspaceMessageSearchState,
          workspaceId,
          requestGeneration: store.requestGeneration() + 1,
        });
      },

      async search(rawQuery: string): Promise<void> {
        const workspaceId = store.workspaceId();
        const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';

        if (workspaceId === null) {
          return;
        }

        const generation = store.requestGeneration() + 1;
        patchState(store, {
          query,
          status: 'searching',
          error: null,
          requestGeneration: generation,
        });

        const result = await messageApplication.searchWorkspaceMessages({
          workspaceId,
          query,
        });

        if (
          store.workspaceId() !== workspaceId ||
          store.requestGeneration() !== generation
        ) {
          return;
        }

        Either.match(result, {
          onLeft: (error) => {
            patchState(store, {
              results: [],
              status: 'failed',
              error:
                error._tag === 'InvalidMessageSearchQueryError'
                  ? 'Enter between 2 and 200 characters.'
                  : 'Message search is currently unavailable. Try again.',
            });
          },
          onRight: (results) => {
            patchState(store, {
              results,
              status: 'completed',
              error: null,
            });
          },
        });
      },
    })
  )
);
