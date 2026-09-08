import { DestroyRef, inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { Either, Schema } from 'effect';
import {
  AnalysisTimeRangeSchema,
  type AnalysisDecisionCandidate,
  type AnalysisDecisionCandidateId,
  type AnalysisDecisionReviewAction,
  type AnalysisRunStatus,
  type AnalysisTimeRange,
} from '@omoikane/domain/analysis';
import type { ChannelId } from '@omoikane/domain/channel';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import { AnalysisRunApiService } from '@client/core/analysis-run/analysis-run-api.service';
import { createInitialAnalysisRunsState } from './analysis-runs.state';

export const ANALYSIS_RUN_POLL_INTERVAL_MS = 1_000;

const isTerminal = (status: AnalysisRunStatus): boolean =>
  status === 'succeeded' || status === 'failed';

/** Feature-scoped state for starting and observing one current run. */
export const AnalysisRunsStore = signalStore(
  withState(() => createInitialAnalysisRunsState()),
  withMethods(
    (
      store,
      api = inject(AnalysisRunApiService),
      destroyRef = inject(DestroyRef)
    ) => {
      let revision = 0;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      let observationSequence = 0;
      let activeObservation: number | null = null;
      let destroyed = false;

      const stopPolling = (): void => {
        if (pollTimer !== null) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
      };

      const message = (kind: string): string =>
        kind === 'not-found'
          ? 'This channel is no longer available for analysis.'
          : kind === 'authentication'
            ? 'Your session can no longer access the analysis server.'
            : kind === 'invalid-request'
              ? 'Choose a valid past time range of no more than 31 days.'
              : kind === 'conflict'
                ? 'This candidate was already reviewed. Its current state has been reloaded.'
                : 'The Analysis Run service is currently unavailable.';

      const decodeTimeRange = (): Either.Either<AnalysisTimeRange, unknown> =>
        Schema.decodeUnknownEither(AnalysisTimeRangeSchema)({
          start: store.timeRangeStart(),
          end: store.timeRangeEnd(),
        });

      const hasActiveRun = (): boolean => {
        const currentRun = store.run();
        return (
          store.status() === 'starting' ||
          store.reviewingCandidateId() !== null ||
          (currentRun !== null && !isTerminal(currentRun.status))
        );
      };

      const observe = async (
        expectedRevision: number,
        includeTerminal = false
      ): Promise<boolean> => {
        const workspaceId = store.workspaceId();
        const channelId = store.channelId();
        const run = store.run();
        if (
          destroyed ||
          activeObservation !== null ||
          workspaceId === null ||
          channelId === null ||
          run === null ||
          (!includeTerminal && isTerminal(run.status))
        ) {
          return false;
        }

        const observationId = ++observationSequence;
        activeObservation = observationId;
        const observedRunId = run.id;
        const result = await api.get(workspaceId, observedRunId);
        if (activeObservation === observationId) {
          activeObservation = null;
        }
        if (
          destroyed ||
          expectedRevision !== revision ||
          store.workspaceId() !== workspaceId ||
          store.channelId() !== channelId ||
          store.run()?.id !== observedRunId
        ) {
          return false;
        }

        return Either.match(result, {
          onLeft: (error) => {
            stopPolling();
            patchState(store, {
              status: 'failed',
              error: { message: message(error.kind) },
              reviewingCandidateId: null,
            });
            return false;
          },
          onRight: (observed) => {
            const terminal = isTerminal(observed.status);
            patchState(store, {
              run: observed,
              status: terminal ? 'idle' : 'observing',
              error: null,
              reviewingCandidateId: null,
            });
            if (!terminal) {
              pollTimer = setTimeout(() => {
                pollTimer = null;
                void observe(expectedRevision);
              }, ANALYSIS_RUN_POLL_INTERVAL_MS);
            }
            return true;
          },
        });
      };

      const scheduleObservation = (): void => {
        stopPolling();
        const expectedRevision = revision;
        pollTimer = setTimeout(() => {
          pollTimer = null;
          void observe(expectedRevision);
        }, ANALYSIS_RUN_POLL_INTERVAL_MS);
      };

      destroyRef.onDestroy(() => {
        destroyed = true;
        revision += 1;
        activeObservation = null;
        stopPolling();
      });

      return {
        canEditTimeRange(): boolean {
          return !hasActiveRun();
        },

        canStart(): boolean {
          const timeRange = decodeTimeRange();
          return (
            store.workspaceId() !== null &&
            store.channelId() !== null &&
            !hasActiveRun() &&
            Either.isRight(timeRange) &&
            timeRange.right.end.getTime() <= Date.now()
          );
        },

        setTimeRangeStart(start: Date): boolean {
          if (hasActiveRun() || Number.isNaN(start.getTime())) {
            return false;
          }
          patchState(store, { timeRangeStart: start, error: null });
          return true;
        },

        setTimeRangeEnd(end: Date): boolean {
          if (hasActiveRun() || Number.isNaN(end.getTime())) {
            return false;
          }
          patchState(store, { timeRangeEnd: end, error: null });
          return true;
        },

        selectScope(workspaceId: WorkspaceId, channelId: ChannelId): void {
          if (
            store.workspaceId() !== workspaceId ||
            store.channelId() !== channelId
          ) {
            revision += 1;
            activeObservation = null;
            stopPolling();
            patchState(store, {
              workspaceId,
              channelId,
              run: null,
              status: 'idle',
              error: null,
              reviewingCandidateId: null,
            });
          }
        },

        async start(): Promise<boolean> {
          const workspaceId = store.workspaceId();
          const channelId = store.channelId();
          const timeRange = decodeTimeRange();
          const currentRun = store.run();
          if (
            workspaceId === null ||
            channelId === null ||
            Either.isLeft(timeRange) ||
            timeRange.right.end.getTime() > Date.now() ||
            store.status() === 'starting' ||
            (currentRun !== null && !isTerminal(currentRun.status))
          ) {
            if (workspaceId !== null && channelId !== null && !hasActiveRun()) {
              patchState(store, {
                error: {
                  message:
                    'Choose a valid past time range of no more than 31 days.',
                },
              });
            }
            return false;
          }

          const startedAt = revision;
          patchState(store, { status: 'starting', error: null });
          const result = await api.start(
            workspaceId,
            channelId,
            timeRange.right
          );
          if (startedAt !== revision) {
            return false;
          }

          return Either.match(result, {
            onLeft: (error) => {
              patchState(store, {
                status: 'failed',
                error: { message: message(error.kind) },
              });
              return false;
            },
            onRight: (run) => {
              const terminal = isTerminal(run.status);
              patchState(store, {
                run,
                status: terminal ? 'idle' : 'observing',
                error: null,
              });
              if (!terminal) {
                scheduleObservation();
              }
              return true;
            },
          });
        },

        async refresh(): Promise<boolean> {
          const workspaceId = store.workspaceId();
          const channelId = store.channelId();
          if (
            workspaceId === null ||
            channelId === null ||
            store.status() === 'starting'
          ) {
            return false;
          }
          stopPolling();
          return observe(revision, true);
        },

        canReview(candidate: AnalysisDecisionCandidate): boolean {
          return (
            candidate.status === 'proposed' &&
            store.reviewingCandidateId() === null
          );
        },

        async reviewCandidate(
          candidateId: AnalysisDecisionCandidateId,
          action: AnalysisDecisionReviewAction,
          reason: string
        ): Promise<boolean> {
          const workspaceId = store.workspaceId();
          const run = store.run();
          const candidate =
            run?.result?.kind === 'decision-forensics'
              ? run.result.candidates.find((item) => item.id === candidateId)
              : undefined;
          if (
            workspaceId === null ||
            run === null ||
            candidate?.status !== 'proposed' ||
            store.reviewingCandidateId() !== null
          ) {
            return false;
          }

          const expectedRevision = revision;
          patchState(store, { reviewingCandidateId: candidateId, error: null });
          const result = await api.reviewCandidate(
            workspaceId,
            run.id,
            candidateId,
            action,
            reason.trim() || null
          );
          if (
            expectedRevision !== revision ||
            store.workspaceId() !== workspaceId ||
            store.run()?.id !== run.id
          ) {
            return false;
          }

          if (Either.isLeft(result)) {
            if (result.left.kind === 'conflict') {
              const refreshed = await observe(expectedRevision, true);
              if (refreshed) {
                patchState(store, {
                  error: { message: message('conflict') },
                });
              }
            } else {
              patchState(store, {
                reviewingCandidateId: null,
                error: { message: message(result.left.kind) },
              });
            }
            return false;
          }

          const review = result.right;
          const currentRun = store.run();
          if (currentRun?.result?.kind !== 'decision-forensics') {
            patchState(store, { reviewingCandidateId: null });
            return false;
          }
          patchState(store, {
            reviewingCandidateId: null,
            error: null,
            run: {
              ...currentRun,
              result: {
                ...currentRun.result,
                candidates: currentRun.result.candidates.map((item) =>
                  item.id === candidateId
                    ? {
                        ...item,
                        status:
                          review.action === 'confirm'
                            ? ('confirmed' as const)
                            : ('rejected' as const),
                        review,
                      }
                    : item
                ),
              },
            },
          });
          return true;
        },
      };
    }
  )
);
