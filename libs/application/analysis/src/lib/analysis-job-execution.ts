import { Data, Effect, Option } from 'effect';
import type {
  AnalysisFailureCategory,
  AnalysisJob,
  AnalysisJobExecution,
  AnalysisJobFailureCompletion,
  AnalysisJobSource,
  AnalysisProcessorReceipt,
} from './analysis-job';
import type { AnalysisJobExecutionRepositoryError } from './analysis-run-error';
import {
  AnalysisRunRepositoryTag,
  type AnalysisRunRepository,
} from './analysis-run-repository';

export const WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION =
  'analysis.workspace-message-inventory.v1';

export class RetryableAnalysisProcessorError extends Data.TaggedError(
  'RetryableAnalysisProcessorError'
)<{ readonly category: AnalysisFailureCategory }> {}

export class TerminalAnalysisProcessorError extends Data.TaggedError(
  'TerminalAnalysisProcessorError'
)<{ readonly category: AnalysisFailureCategory }> {}

export type AnalysisProcessorError =
  | RetryableAnalysisProcessorError
  | TerminalAnalysisProcessorError;

export type AnalysisJobProcessor = (
  execution: AnalysisJobExecution
) => Effect.Effect<
  AnalysisProcessorReceipt,
  AnalysisProcessorError,
  AnalysisRunRepository
>;

export interface AcquireNextAnalysisJobInput {
  readonly workerId: string;
  readonly leaseSeconds: number;
}

/** Acquires at most one job; absence is ordinary idle-loop behavior. */
export const acquireNextAnalysisJob = (
  input: AcquireNextAnalysisJobInput
): Effect.Effect<
  Option.Option<AnalysisJobExecution>,
  AnalysisJobExecutionRepositoryError,
  AnalysisRunRepository
> =>
  Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
    repository.acquireNextJob({
      workerId: input.workerId,
      processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
      leaseSeconds: input.leaseSeconds,
    })
  );

const fingerprintSources = (
  execution: AnalysisJobExecution,
  sources: ReadonlyArray<AnalysisJobSource>
): string => {
  let hash = 0x811c9dc5;
  for (const source of sources) {
    for (const character of source.messageRevisionId) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return [
    WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
    execution.analysisRunId,
    sources.length,
    (hash >>> 0).toString(16).padStart(8, '0'),
  ].join('/');
};

/** Builds the bounded inventory for the channel authorized by the run. */
export const buildWorkspaceMessageInventory = (
  execution: AnalysisJobExecution,
  availableSources: ReadonlyArray<AnalysisJobSource>
): AnalysisProcessorReceipt => {
  const sources = availableSources.slice(0, 100);
  const participantCount = new Set(sources.map((source) => source.authorUserId))
    .size;
  const summary = `Analyzed ${sources.length} active message${sources.length === 1 ? '' : 's'} from ${participantCount} participant${participantCount === 1 ? '' : 's'}.`;

  return {
    processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
    resultFingerprint: fingerprintSources(execution, sources),
    result: {
      kind: 'workspace-message-inventory',
      processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
      providerKind: 'deterministic',
      model: null,
      evaluationVersion: 'workspace-message-inventory.v1',
      sourceCount: sources.length,
      sourceTruncated: availableSources.length > sources.length,
      sources: sources.map(({ messageId, messageRevisionId }) => ({
        messageId,
        messageRevisionId,
      })),
      summary,
      finding: {
        kind: 'workspace-message-inventory',
        status: 'proposed',
        title: 'Channel message inventory',
        summary,
        confidence: 1,
      },
    },
  };
};

/** Loads authorized immutable sources and produces the deterministic inventory. */
export const processAnalysisJob = (
  execution: AnalysisJobExecution
): Effect.Effect<
  AnalysisProcessorReceipt,
  AnalysisProcessorError,
  AnalysisRunRepository
> =>
  Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
    repository.loadJobSources({ execution })
  ).pipe(
    Effect.map((sources) => buildWorkspaceMessageInventory(execution, sources)),
    Effect.mapError(
      (error): AnalysisProcessorError =>
        error._tag === 'AnalysisSourceAccessRevokedError'
          ? new TerminalAnalysisProcessorError({
              category: 'authorization.revoked',
            })
          : new RetryableAnalysisProcessorError({
              category: 'source.unavailable',
            })
    )
  );

export interface CompleteAnalysisJobSuccessInput {
  readonly execution: AnalysisJobExecution;
  readonly receipt: AnalysisProcessorReceipt;
  readonly durationMilliseconds: number;
}

/** Commits deterministic success only while the execution still owns its lease. */
export const completeAnalysisJobSuccess = (
  input: CompleteAnalysisJobSuccessInput
): Effect.Effect<
  AnalysisJob,
  AnalysisJobExecutionRepositoryError,
  AnalysisRunRepository
> =>
  Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
    repository.completeJobSuccess({
      execution: input.execution,
      resultFingerprint: input.receipt.resultFingerprint,
      result: input.receipt.result,
      durationMilliseconds: input.durationMilliseconds,
    })
  );

export interface CompleteAnalysisJobFailureInput {
  readonly execution: AnalysisJobExecution;
  readonly failureCategory: AnalysisFailureCategory;
  readonly retryable: boolean;
  readonly durationMilliseconds: number;
}

/** Commits one classified processor failure while its lease remains current. */
export const completeAnalysisJobFailure = (
  input: CompleteAnalysisJobFailureInput
): Effect.Effect<
  AnalysisJobFailureCompletion,
  AnalysisJobExecutionRepositoryError,
  AnalysisRunRepository
> =>
  Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
    repository.completeJobFailure({
      execution: input.execution,
      failureCategory: input.failureCategory,
      retryable: input.retryable,
      durationMilliseconds: input.durationMilliseconds,
    })
  );

/** Non-mutating database readiness proof for the worker runtime. */
export const checkAnalysisWorkerReady: Effect.Effect<
  boolean,
  AnalysisJobExecutionRepositoryError,
  AnalysisRunRepository
> = Effect.flatMap(AnalysisRunRepositoryTag, (repository) =>
  repository.checkWorkerReady()
);
