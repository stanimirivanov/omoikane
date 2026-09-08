import { Context, type Effect, type Option } from 'effect';
import type { DecisionExtractionInput } from './decision-extraction';
import type { AuthenticatedRequestIdentity } from '@omoikane/application/authentication';
import type { ChannelId } from '@omoikane/domain/channel';
import type {
  AnalysisRun,
  AnalysisRunId,
  AnalysisTimeRange,
} from '@omoikane/domain/analysis';
import type { WorkspaceId } from '@omoikane/domain/workspace';
import type {
  AnalysisRunDispatchRepositoryError,
  AnalysisJobExecutionRepositoryError,
  AnalysisRunRepositoryError,
} from './analysis-run-error';
import type {
  AnalysisJob,
  AnalysisJobExecution,
  AnalysisJobSourceSnapshot,
  AnalysisJobFailureCompletion,
  AnalysisProcessorReceipt,
  AnalysisRunOutboxClaim,
} from './analysis-job';

interface ScopedAnalysisRunRequest {
  readonly identity: AuthenticatedRequestIdentity;
  readonly workspaceId: WorkspaceId;
}

export interface StartAnalysisRunCommand extends ScopedAnalysisRunRequest {
  readonly channelId: ChannelId;
  readonly timeRange: AnalysisTimeRange;
  readonly traceContext: AnalysisRunProcessingTraceContext;
}

/** Safe W3C carrier persisted with asynchronous Analysis Run intent. */
export interface AnalysisRunProcessingTraceContext {
  readonly traceparent: string;
  readonly tracestate: string | null;
}

export interface GetAnalysisRunQuery extends ScopedAnalysisRunRequest {
  readonly analysisRunId: AnalysisRunId;
}

export interface ClaimAnalysisRunOutboxCommand {
  readonly dispatcherId: string;
  readonly leaseSeconds: number;
}

export interface AcquireAnalysisJobCommand {
  readonly workerId: string;
  readonly processorVersion: string;
  readonly leaseSeconds: number;
}

export interface CompleteAnalysisJobCommand {
  readonly execution: AnalysisJobExecution;
  readonly resultFingerprint: string;
  readonly result: AnalysisProcessorReceipt['result'];
  readonly durationMilliseconds: number;
}

export interface LoadAnalysisJobSourcesCommand {
  readonly execution: AnalysisJobExecution;
}

export interface FailAnalysisJobCommand {
  readonly execution: AnalysisJobExecution;
  readonly failureCategory: string;
  readonly retryable: boolean;
  readonly durationMilliseconds: number;
}

/** Capability-oriented persistence boundary for runs and durable dispatch. */
export interface AnalysisRunRepository {
  readonly start: (
    command: StartAnalysisRunCommand
  ) => Effect.Effect<AnalysisRun, AnalysisRunRepositoryError>;
  readonly get: (
    query: GetAnalysisRunQuery
  ) => Effect.Effect<AnalysisRun, AnalysisRunRepositoryError>;
  readonly claimNextOutboxEvent: (
    command: ClaimAnalysisRunOutboxCommand
  ) => Effect.Effect<
    Option.Option<AnalysisRunOutboxClaim>,
    AnalysisRunDispatchRepositoryError
  >;
  readonly dispatchOutboxEvent: (
    claim: AnalysisRunOutboxClaim
  ) => Effect.Effect<AnalysisJob, AnalysisRunDispatchRepositoryError>;
  readonly checkWorkerReady: () => Effect.Effect<
    boolean,
    AnalysisJobExecutionRepositoryError
  >;
  readonly acquireNextJob: (
    command: AcquireAnalysisJobCommand
  ) => Effect.Effect<
    Option.Option<AnalysisJobExecution>,
    AnalysisJobExecutionRepositoryError
  >;
  readonly loadJobSources: (
    command: LoadAnalysisJobSourcesCommand
  ) => Effect.Effect<
    AnalysisJobSourceSnapshot,
    AnalysisJobExecutionRepositoryError
  >;
  readonly completeJobSuccess: (
    command: CompleteAnalysisJobCommand
  ) => Effect.Effect<AnalysisJob, AnalysisJobExecutionRepositoryError>;
  /** Rechecks lease and requester access before loading exact snapshot content, including empty snapshots. */
  readonly loadJobExtractionInput: (
    command: LoadAnalysisJobSourcesCommand
  ) => Effect.Effect<
    DecisionExtractionInput,
    AnalysisJobExecutionRepositoryError
  >;
  readonly completeJobFailure: (
    command: FailAnalysisJobCommand
  ) => Effect.Effect<
    AnalysisJobFailureCompletion,
    AnalysisJobExecutionRepositoryError
  >;
}

/** Effect service key supplied by the server's Analysis infrastructure Layer. */
export const AnalysisRunRepositoryTag =
  Context.GenericTag<AnalysisRunRepository>(
    '@omoikane/application/analysis/AnalysisRunRepository'
  );
