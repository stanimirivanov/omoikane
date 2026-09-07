import { Effect, Option, Schema } from 'effect';
import {
  AnalysisRunNotAccessibleError,
  AnalysisRunOutboxClaimLostError,
  AnalysisRunRepositoryUnavailableError,
  AnalysisJobSchema,
  AnalysisJobExecutionSchema,
  AnalysisJobSourceSchema,
  AnalysisJobFailureCompletionSchema,
  AnalysisJobLeaseLostError,
  AnalysisSourceAccessRevokedError,
  AnalysisRunOutboxClaimSchema,
  InvalidAnalysisRunDataError,
  type AnalysisJob,
  type AnalysisJobExecution,
  type AnalysisJobSource,
  type AnalysisJobFailureCompletion,
  type AnalysisJobExecutionRepositoryError,
  type AnalysisRunOutboxClaim,
  type AnalysisRunRepository,
  type AnalysisRunRepositoryError,
  type AnalysisRunDispatchRepositoryError,
} from '@omoikane/application/analysis';
import { AnalysisRunSchema, type AnalysisRun } from '@omoikane/domain/analysis';
import type {
  SupabaseAnalysisClient,
  SupabaseAnalysisJobResult,
  SupabaseAnalysisJobAcquisitionResult,
  SupabaseAnalysisJobFailureResult,
  SupabaseAnalysisJobSourcesResult,
  SupabaseAnalysisOutboxResult,
  SupabaseAnalysisRunResult,
  SupabaseAnalysisRunProjectionResult,
  SupabaseAnalysisWorkerReadyResult,
} from './supabase-analysis-client';

const mapAnalysisResult = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  return {
    ...value,
    createdAt: new Date(String(Reflect.get(value, 'createdAt'))),
  };
};

const mapTimeRange = (start: string | null, end: string | null): unknown =>
  start === null && end === null
    ? null
    : {
        start: new Date(start ?? ''),
        end: new Date(end ?? ''),
      };

const mapResult = (
  result: SupabaseAnalysisRunResult | SupabaseAnalysisRunProjectionResult,
  operation: 'start' | 'get'
): Effect.Effect<AnalysisRun, AnalysisRunRepositoryError> => {
  if (result.error !== null) {
    return result.error.code === 'P0002'
      ? Effect.fail(new AnalysisRunNotAccessibleError())
      : Effect.fail(
          new AnalysisRunRepositoryUnavailableError({
            operation,
            cause: result.error,
          })
        );
  }

  const row = result.data?.[0];
  if (row === undefined) {
    return Effect.fail(
      new InvalidAnalysisRunDataError({
        cause: `The ${operation} command returned no Analysis Run.`,
      })
    );
  }

  if (
    operation === 'start' &&
    (row.channel_id === null ||
      row.time_range_start === null ||
      row.time_range_end === null)
  ) {
    return Effect.fail(
      new InvalidAnalysisRunDataError({
        cause:
          'A newly started Analysis Run must include its channel and time-range scope.',
      })
    );
  }

  return Schema.decodeUnknown(AnalysisRunSchema)({
    id: row.analysis_run_id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    timeRange: mapTimeRange(row.time_range_start, row.time_range_end),
    requestedBy: row.requested_by,
    status: row.status,
    failureCategory:
      'failure_category' in row
        ? (row.failure_category as string | null)
        : null,
    result: 'result' in row ? mapAnalysisResult(row.result) : null,
    createdAt: new Date(row.created_at),
  }).pipe(
    Effect.mapError((cause) => new InvalidAnalysisRunDataError({ cause }))
  );
};

const execute = (
  operation: 'start' | 'get',
  request: () => PromiseLike<
    SupabaseAnalysisRunResult | SupabaseAnalysisRunProjectionResult
  >
): Effect.Effect<AnalysisRun, AnalysisRunRepositoryError> =>
  Effect.tryPromise({
    try: () => request(),
    catch: (cause) =>
      new AnalysisRunRepositoryUnavailableError({ operation, cause }),
  }).pipe(
    Effect.flatMap((result) => mapResult(result, operation)),
    Effect.withSpan(`supabase.analysis_run.${operation}`, { kind: 'client' })
  );

const mapOutboxClaim = (
  result: SupabaseAnalysisOutboxResult
): Effect.Effect<
  Option.Option<AnalysisRunOutboxClaim>,
  AnalysisRunDispatchRepositoryError
> => {
  if (result.error !== null) {
    return Effect.fail(
      new AnalysisRunRepositoryUnavailableError({
        operation: 'claimOutbox',
        cause: result.error,
      })
    );
  }

  const row = result.data?.[0];
  if (row === undefined) {
    return Effect.succeed(Option.none());
  }

  return Schema.decodeUnknown(AnalysisRunOutboxClaimSchema)({
    eventId: row.analysis_run_outbox_event_id,
    claimToken: row.claim_token,
    traceContext: {
      traceparent: row.traceparent,
      tracestate: row.tracestate,
    },
  }).pipe(
    Effect.map(Option.some),
    Effect.mapError((cause) => new InvalidAnalysisRunDataError({ cause }))
  );
};

const mapJob = (
  result: SupabaseAnalysisJobResult
): Effect.Effect<AnalysisJob, AnalysisRunDispatchRepositoryError> => {
  if (result.error !== null) {
    return result.error.code === 'P0003'
      ? Effect.fail(new AnalysisRunOutboxClaimLostError())
      : Effect.fail(
          new AnalysisRunRepositoryUnavailableError({
            operation: 'dispatchOutbox',
            cause: result.error,
          })
        );
  }

  const row = result.data?.[0];
  if (row === undefined) {
    return Effect.fail(
      new InvalidAnalysisRunDataError({
        cause: 'The dispatch command returned no Analysis job.',
      })
    );
  }

  return Schema.decodeUnknown(AnalysisJobSchema)({
    id: row.analysis_job_id,
    analysisRunId: row.analysis_run_id,
    workspaceId: row.workspace_id,
    kind: row.job_kind,
    version: row.job_version,
    availableAt: new Date(row.available_at),
  }).pipe(
    Effect.mapError((cause) => new InvalidAnalysisRunDataError({ cause }))
  );
};

const mapJobExecution = (
  result: SupabaseAnalysisJobAcquisitionResult
): Effect.Effect<
  Option.Option<AnalysisJobExecution>,
  AnalysisJobExecutionRepositoryError
> => {
  if (result.error !== null) {
    return Effect.fail(
      new AnalysisRunRepositoryUnavailableError({
        operation: 'acquireJob',
        cause: result.error,
      })
    );
  }

  const row = result.data?.[0];
  if (row === undefined) {
    return Effect.succeed(Option.none());
  }

  return Schema.decodeUnknown(AnalysisJobExecutionSchema)({
    jobId: row.analysis_job_id,
    attemptId: row.analysis_job_attempt_id,
    analysisRunId: row.analysis_run_id,
    workspaceId: row.workspace_id,
    kind: row.job_kind,
    version: row.job_version,
    attemptNumber: row.attempt_number,
    leaseToken: row.lease_token,
    leaseExpiresAt: new Date(row.lease_expires_at),
    processorVersion: row.processor_version,
    traceContext: {
      traceparent: row.traceparent,
      tracestate: row.tracestate,
    },
  }).pipe(
    Effect.map(Option.some),
    Effect.mapError((cause) => new InvalidAnalysisRunDataError({ cause }))
  );
};

const mapWorkerReady = (
  result: SupabaseAnalysisWorkerReadyResult
): Effect.Effect<boolean, AnalysisJobExecutionRepositoryError> => {
  if (result.error !== null) {
    return Effect.fail(
      new AnalysisRunRepositoryUnavailableError({
        operation: 'healthWorker',
        cause: result.error,
      })
    );
  }

  return result.data === true
    ? Effect.succeed(true)
    : Effect.fail(
        new InvalidAnalysisRunDataError({
          cause: 'The Analysis worker readiness command returned false.',
        })
      );
};

const mapJobSources = (
  result: SupabaseAnalysisJobSourcesResult
): Effect.Effect<
  ReadonlyArray<AnalysisJobSource>,
  AnalysisJobExecutionRepositoryError
> => {
  if (result.error?.code === 'P0003') {
    return Effect.fail(new AnalysisJobLeaseLostError());
  }
  if (result.error?.code === 'P0004') {
    return Effect.fail(new AnalysisSourceAccessRevokedError());
  }
  if (result.error !== null) {
    return Effect.fail(
      new AnalysisRunRepositoryUnavailableError({
        operation: 'loadSources',
        cause: result.error,
      })
    );
  }

  return Effect.forEach(result.data ?? [], (row) =>
    Schema.decodeUnknown(AnalysisJobSourceSchema)({
      messageId: row.message_id,
      messageRevisionId: row.message_version_id,
      authorUserId: row.author_user_id,
    }).pipe(
      Effect.mapError((cause) => new InvalidAnalysisRunDataError({ cause }))
    )
  );
};

const mapCompletedJob = (
  result: SupabaseAnalysisJobResult
): Effect.Effect<AnalysisJob, AnalysisJobExecutionRepositoryError> => {
  if (result.error?.code === 'P0003') {
    return Effect.fail(new AnalysisJobLeaseLostError());
  }
  if (result.error !== null) {
    return Effect.fail(
      new AnalysisRunRepositoryUnavailableError({
        operation: 'completeJob',
        cause: result.error,
      })
    );
  }

  const row = result.data?.[0];
  if (row === undefined) {
    return Effect.fail(
      new InvalidAnalysisRunDataError({
        cause: 'The completion command returned no Analysis job.',
      })
    );
  }

  return Schema.decodeUnknown(AnalysisJobSchema)({
    id: row.analysis_job_id,
    analysisRunId: row.analysis_run_id,
    workspaceId: row.workspace_id,
    kind: row.job_kind,
    version: row.job_version,
    availableAt: new Date(row.available_at),
  }).pipe(
    Effect.mapError((cause) => new InvalidAnalysisRunDataError({ cause }))
  );
};

const mapFailedJob = (
  result: SupabaseAnalysisJobFailureResult
): Effect.Effect<
  AnalysisJobFailureCompletion,
  AnalysisJobExecutionRepositoryError
> => {
  if (result.error?.code === 'P0003') {
    return Effect.fail(new AnalysisJobLeaseLostError());
  }
  if (result.error !== null) {
    return Effect.fail(
      new AnalysisRunRepositoryUnavailableError({
        operation: 'failJob',
        cause: result.error,
      })
    );
  }

  const row = result.data?.[0];
  if (row === undefined) {
    return Effect.fail(
      new InvalidAnalysisRunDataError({
        cause: 'The failed-completion command returned no Analysis job.',
      })
    );
  }

  const nextAvailableAt = row.next_available_at as string | null;
  return Schema.decodeUnknown(AnalysisJobFailureCompletionSchema)({
    jobId: row.analysis_job_id,
    analysisRunId: row.analysis_run_id,
    attemptNumber: row.attempt_number,
    outcome: row.completion_outcome,
    failureCategory: row.failure_category,
    nextAvailableAt:
      nextAvailableAt === null ? null : new Date(nextAvailableAt),
  }).pipe(
    Effect.mapError((cause) => new InvalidAnalysisRunDataError({ cause }))
  );
};

/** Constructs the Supabase implementation of the Analysis Run repository. */
export const makeSupabaseAnalysisRunRepository = (
  client: SupabaseAnalysisClient
): AnalysisRunRepository => ({
  start: ({ identity, workspaceId, channelId, timeRange, traceContext }) =>
    execute('start', () =>
      client.start({
        p_workspace_id: workspaceId,
        p_channel_id: channelId,
        p_time_range_start: timeRange.start.toISOString(),
        p_time_range_end: timeRange.end.toISOString(),
        p_requested_by: identity.userId,
        p_traceparent: traceContext.traceparent,
        ...(traceContext.tracestate === null
          ? {}
          : { p_tracestate: traceContext.tracestate }),
      })
    ),
  get: ({ identity, workspaceId, analysisRunId }) =>
    execute('get', () =>
      client.get({
        p_workspace_id: workspaceId,
        p_analysis_run_id: analysisRunId,
        p_requested_by: identity.userId,
      })
    ),
  claimNextOutboxEvent: ({ dispatcherId, leaseSeconds }) =>
    Effect.tryPromise({
      try: () =>
        client.claimNextOutboxEvent({
          p_claimed_by: dispatcherId,
          p_lease_seconds: leaseSeconds,
        }),
      catch: (cause) =>
        new AnalysisRunRepositoryUnavailableError({
          operation: 'claimOutbox',
          cause,
        }),
    }).pipe(
      Effect.flatMap(mapOutboxClaim),
      Effect.withSpan('supabase.analysis_run_outbox.claim', { kind: 'client' })
    ),
  dispatchOutboxEvent: ({ eventId, claimToken }) =>
    Effect.tryPromise({
      try: () =>
        client.dispatchOutboxEvent({
          p_event_id: eventId,
          p_claim_token: claimToken,
        }),
      catch: (cause) =>
        new AnalysisRunRepositoryUnavailableError({
          operation: 'dispatchOutbox',
          cause,
        }),
    }).pipe(
      Effect.flatMap(mapJob),
      Effect.withSpan('supabase.analysis_run_outbox.dispatch', {
        kind: 'client',
      })
    ),
  checkWorkerReady: () =>
    Effect.tryPromise({
      try: () => client.checkWorkerReady(),
      catch: (cause) =>
        new AnalysisRunRepositoryUnavailableError({
          operation: 'healthWorker',
          cause,
        }),
    }).pipe(
      Effect.flatMap(mapWorkerReady),
      Effect.withSpan('supabase.analysis_worker.ready', { kind: 'client' })
    ),
  acquireNextJob: ({ workerId, processorVersion, leaseSeconds }) =>
    Effect.tryPromise({
      try: () =>
        client.acquireNextJob({
          p_lease_owner: workerId,
          p_processor_version: processorVersion,
          p_lease_seconds: leaseSeconds,
        }),
      catch: (cause) =>
        new AnalysisRunRepositoryUnavailableError({
          operation: 'acquireJob',
          cause,
        }),
    }).pipe(
      Effect.flatMap(mapJobExecution),
      Effect.withSpan('supabase.analysis_job.acquire', { kind: 'client' })
    ),
  loadJobSources: ({ execution }) =>
    Effect.tryPromise({
      try: () =>
        client.loadJobSources({
          p_job_id: execution.jobId,
          p_attempt_id: execution.attemptId,
          p_lease_token: execution.leaseToken,
        }),
      catch: (cause) =>
        new AnalysisRunRepositoryUnavailableError({
          operation: 'loadSources',
          cause,
        }),
    }).pipe(
      Effect.flatMap(mapJobSources),
      Effect.withSpan('supabase.analysis_job.load_sources', { kind: 'client' })
    ),
  completeJobSuccess: ({
    execution,
    resultFingerprint,
    result,
    durationMilliseconds,
  }) =>
    Effect.tryPromise({
      try: () =>
        client.completeJobSuccess({
          p_job_id: execution.jobId,
          p_attempt_id: execution.attemptId,
          p_lease_token: execution.leaseToken,
          p_result_fingerprint: resultFingerprint,
          p_duration_milliseconds: durationMilliseconds,
          p_result: {
            kind: result.kind,
            processorVersion: result.processorVersion,
            providerKind: result.providerKind,
            model: result.model,
            evaluationVersion: result.evaluationVersion,
            sourceCount: result.sourceCount,
            sourceTruncated: result.sourceTruncated,
            sources: result.sources.map((source) => ({
              messageId: source.messageId,
              messageRevisionId: source.messageRevisionId,
            })),
            summary: result.summary,
            finding: { ...result.finding },
          },
        }),
      catch: (cause) =>
        new AnalysisRunRepositoryUnavailableError({
          operation: 'completeJob',
          cause,
        }),
    }).pipe(
      Effect.flatMap(mapCompletedJob),
      Effect.withSpan('supabase.analysis_job.complete', { kind: 'client' })
    ),
  completeJobFailure: ({
    execution,
    failureCategory,
    retryable,
    durationMilliseconds,
  }) =>
    Effect.tryPromise({
      try: () =>
        client.completeJobFailure({
          p_job_id: execution.jobId,
          p_attempt_id: execution.attemptId,
          p_lease_token: execution.leaseToken,
          p_failure_category: failureCategory,
          p_retryable: retryable,
          p_duration_milliseconds: durationMilliseconds,
        }),
      catch: (cause) =>
        new AnalysisRunRepositoryUnavailableError({
          operation: 'failJob',
          cause,
        }),
    }).pipe(
      Effect.flatMap(mapFailedJob),
      Effect.withSpan('supabase.analysis_job.fail', { kind: 'client' })
    ),
});
