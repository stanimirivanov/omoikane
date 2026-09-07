import { Effect, Option } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  AnalysisJobExecution,
  AnalysisRunOutboxClaim,
} from '@omoikane/application/analysis';
import type { SupabaseAnalysisClient } from './supabase-analysis-client';
import { makeSupabaseAnalysisRunRepository } from './supabase-analysis-run-repository';

const row = {
  analysis_run_id: '30000000-0000-4000-8000-000000000001',
  workspace_id: '20000000-0000-4000-8000-000000000001',
  channel_id: '40000000-0000-4000-8000-000000000001',
  time_range_start: '2026-07-01T00:00:00.000Z',
  time_range_end: '2026-07-08T00:00:00.000Z',
  requested_by: '10000000-0000-4000-8000-000000000001',
  status: 'created',
  created_at: '2026-08-09T12:00:00.000Z',
};

const projectionRow = {
  ...row,
  failure_category: null,
  result: null,
};

const resultDraft = {
  kind: 'workspace-message-inventory' as const,
  processorVersion: 'analysis.workspace-message-inventory.v1',
  providerKind: 'deterministic' as const,
  model: null,
  evaluationVersion: 'workspace-message-inventory.v1' as const,
  sourceCount: 0,
  sourceTruncated: false,
  sources: [],
  summary: 'Analyzed 0 active messages from 0 participants.',
  finding: {
    kind: 'workspace-message-inventory' as const,
    status: 'proposed' as const,
    title: 'Workspace message inventory',
    summary: 'Analyzed 0 active messages from 0 participants.',
    confidence: 1,
  },
};

const client = (
  overrides: Partial<SupabaseAnalysisClient> = {}
): SupabaseAnalysisClient => ({
  start: vi.fn().mockResolvedValue({ data: [row], error: null }),
  get: vi.fn().mockResolvedValue({ data: [projectionRow], error: null }),
  claimNextOutboxEvent: vi.fn().mockResolvedValue({ data: [], error: null }),
  dispatchOutboxEvent: vi.fn().mockResolvedValue({ data: [], error: null }),
  checkWorkerReady: vi.fn().mockResolvedValue({ data: true, error: null }),
  acquireNextJob: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadJobSources: vi.fn().mockResolvedValue({ data: [], error: null }),
  completeJobSuccess: vi.fn().mockResolvedValue({ data: [], error: null }),
  completeJobFailure: vi.fn().mockResolvedValue({ data: [], error: null }),
  ...overrides,
});

const command = {
  identity: { userId: row.requested_by },
  workspaceId: row.workspace_id,
  channelId: row.channel_id,
  timeRange: {
    start: new Date(row.time_range_start),
    end: new Date(row.time_range_end),
  },
  traceContext: {
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    tracestate: 'omoikane=test',
  },
} as Parameters<
  ReturnType<typeof makeSupabaseAnalysisRunRepository>['start']
>[0];

describe('makeSupabaseAnalysisRunRepository', () => {
  it('maps the canonical start result', async () => {
    const start = vi.fn().mockResolvedValue({ data: [row], error: null });
    const repository = makeSupabaseAnalysisRunRepository(client({ start }));

    await expect(
      Effect.runPromise(repository.start(command))
    ).resolves.toMatchObject({
      id: row.analysis_run_id,
      status: 'created',
    });
    expect(start).toHaveBeenCalledExactlyOnceWith({
      p_workspace_id: row.workspace_id,
      p_channel_id: row.channel_id,
      p_time_range_start: row.time_range_start,
      p_time_range_end: row.time_range_end,
      p_requested_by: row.requested_by,
      p_traceparent: command.traceContext.traceparent,
      p_tracestate: command.traceContext.tracestate,
    });
  });

  it('omits absent tracestate so the RPC applies its null default', async () => {
    const start = vi.fn().mockResolvedValue({ data: [row], error: null });
    const repository = makeSupabaseAnalysisRunRepository(client({ start }));

    await Effect.runPromise(
      repository.start({
        ...command,
        traceContext: { ...command.traceContext, tracestate: null },
      })
    );

    expect(start).toHaveBeenCalledExactlyOnceWith({
      p_workspace_id: row.workspace_id,
      p_channel_id: row.channel_id,
      p_time_range_start: row.time_range_start,
      p_time_range_end: row.time_range_end,
      p_requested_by: row.requested_by,
      p_traceparent: command.traceContext.traceparent,
    });
  });

  it('maps the deliberately indistinguishable inaccessible signal', async () => {
    const error = { code: 'P0002' } as PostgrestError;
    const repository = makeSupabaseAnalysisRunRepository(
      client({ start: vi.fn().mockResolvedValue({ data: null, error }) })
    );
    const result = await Effect.runPromise(
      repository.start(command).pipe(Effect.either)
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: { _tag: 'AnalysisRunNotAccessibleError' },
    });
  });

  it('maps the current lifecycle projection returned by the read command', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        {
          ...projectionRow,
          status: 'failed',
          failure_category: 'provider.timeout',
        },
      ],
      error: null,
    });
    const repository = makeSupabaseAnalysisRunRepository(client({ get }));
    const query = {
      identity: command.identity,
      workspaceId: command.workspaceId,
      analysisRunId: row.analysis_run_id,
    } as Parameters<typeof repository.get>[0];

    await expect(
      Effect.runPromise(repository.get(query))
    ).resolves.toMatchObject({
      status: 'failed',
      failureCategory: 'provider.timeout',
    });
  });

  it('maps lease-owned immutable message sources', async () => {
    const loadJobSources = vi.fn().mockResolvedValue({
      data: [
        {
          message_id: '90000000-0000-4000-8000-000000000001',
          message_version_id: '91000000-0000-4000-8000-000000000001',
          author_user_id: row.requested_by,
        },
      ],
      error: null,
    });
    const repository = makeSupabaseAnalysisRunRepository(
      client({ loadJobSources })
    );
    const execution = {
      jobId: '60000000-0000-4000-8000-000000000001',
      attemptId: '70000000-0000-4000-8000-000000000001',
      leaseToken: '80000000-0000-4000-8000-000000000001',
    } as AnalysisJobExecution;

    await expect(
      Effect.runPromise(repository.loadJobSources({ execution }))
    ).resolves.toMatchObject([
      {
        messageId: '90000000-0000-4000-8000-000000000001',
        messageRevisionId: '91000000-0000-4000-8000-000000000001',
        authorUserId: row.requested_by,
      },
    ]);
    expect(loadJobSources).toHaveBeenCalledExactlyOnceWith({
      p_job_id: execution.jobId,
      p_attempt_id: execution.attemptId,
      p_lease_token: execution.leaseToken,
    });
  });

  it('maps revoked source access to its typed worker failure', async () => {
    const error = { code: 'P0004' } as PostgrestError;
    const repository = makeSupabaseAnalysisRunRepository(
      client({
        loadJobSources: vi.fn().mockResolvedValue({ data: null, error }),
      })
    );

    await expect(
      Effect.runPromise(
        repository
          .loadJobSources({
            execution: {
              jobId: '60000000-0000-4000-8000-000000000001',
              attemptId: '70000000-0000-4000-8000-000000000001',
              leaseToken: '80000000-0000-4000-8000-000000000001',
            } as AnalysisJobExecution,
          })
          .pipe(Effect.flip)
      )
    ).resolves.toMatchObject({ _tag: 'AnalysisSourceAccessRevokedError' });
  });

  it('rejects malformed provider rows', async () => {
    const repository = makeSupabaseAnalysisRunRepository(
      client({
        start: vi.fn().mockResolvedValue({
          data: [{ ...row, status: 'completed' }],
          error: null,
        }),
      })
    );
    const result = await Effect.runPromise(
      repository.start(command).pipe(Effect.either)
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: { _tag: 'InvalidAnalysisRunDataError' },
    });
  });

  it('rejects a newly started run without its required channel scope', async () => {
    const repository = makeSupabaseAnalysisRunRepository(
      client({
        start: vi.fn().mockResolvedValue({
          data: [{ ...row, channel_id: null }],
          error: null,
        }),
      })
    );

    await expect(
      Effect.runPromise(repository.start(command).pipe(Effect.flip))
    ).resolves.toMatchObject({ _tag: 'InvalidAnalysisRunDataError' });
  });

  it('rejects a newly started run without its required time-range scope', async () => {
    const repository = makeSupabaseAnalysisRunRepository(
      client({
        start: vi.fn().mockResolvedValue({
          data: [{ ...row, time_range_start: null, time_range_end: null }],
          error: null,
        }),
      })
    );

    await expect(
      Effect.runPromise(repository.start(command).pipe(Effect.flip))
    ).resolves.toMatchObject({ _tag: 'InvalidAnalysisRunDataError' });
  });

  it('maps an outbox claim and dispatches it with its fencing token', async () => {
    const outboxRow = {
      analysis_run_outbox_event_id: '40000000-0000-4000-8000-000000000001',
      claim_token: '50000000-0000-4000-8000-000000000001',
      traceparent: command.traceContext.traceparent,
      tracestate: command.traceContext.tracestate,
    };
    const jobRow = {
      analysis_job_id: '60000000-0000-4000-8000-000000000001',
      analysis_run_id: row.analysis_run_id,
      workspace_id: row.workspace_id,
      job_kind: 'analysis.execute',
      job_version: 1,
      available_at: '2026-08-10T12:00:00.000Z',
    };
    const claimNextOutboxEvent = vi
      .fn()
      .mockResolvedValue({ data: [outboxRow], error: null });
    const dispatchOutboxEvent = vi
      .fn()
      .mockResolvedValue({ data: [jobRow], error: null });
    const repository = makeSupabaseAnalysisRunRepository(
      client({ claimNextOutboxEvent, dispatchOutboxEvent })
    );

    const claim = await Effect.runPromise(
      repository.claimNextOutboxEvent({
        dispatcherId: 'dispatcher-1',
        leaseSeconds: 30,
      })
    );
    expect(Option.isSome(claim)).toBe(true);
    if (Option.isNone(claim)) {
      throw new Error('Expected an outbox claim.');
    }

    await expect(
      Effect.runPromise(repository.dispatchOutboxEvent(claim.value))
    ).resolves.toMatchObject({
      id: jobRow.analysis_job_id,
      kind: 'analysis.execute',
      version: 1,
    });
    expect(claimNextOutboxEvent).toHaveBeenCalledExactlyOnceWith({
      p_claimed_by: 'dispatcher-1',
      p_lease_seconds: 30,
    });
    expect(dispatchOutboxEvent).toHaveBeenCalledExactlyOnceWith({
      p_event_id: outboxRow.analysis_run_outbox_event_id,
      p_claim_token: outboxRow.claim_token,
    });
  });

  it('treats an empty claim result as normal unavailable work', async () => {
    const repository = makeSupabaseAnalysisRunRepository(client());
    const result = await Effect.runPromise(
      repository.claimNextOutboxEvent({
        dispatcherId: 'dispatcher-1',
        leaseSeconds: 30,
      })
    );

    expect(Option.isNone(result)).toBe(true);
  });

  it('maps a stale dispatch lease to a typed claim-lost failure', async () => {
    const error = { code: 'P0003' } as PostgrestError;
    const repository = makeSupabaseAnalysisRunRepository(
      client({
        dispatchOutboxEvent: vi.fn().mockResolvedValue({ data: null, error }),
      })
    );
    const result = await Effect.runPromise(
      repository
        .dispatchOutboxEvent({
          eventId: '40000000-0000-4000-8000-000000000001',
          claimToken: '50000000-0000-4000-8000-000000000001',
        } as AnalysisRunOutboxClaim)
        .pipe(Effect.either)
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: { _tag: 'AnalysisRunOutboxClaimLostError' },
    });
  });

  it('maps a leased job execution and preserves its trace carrier', async () => {
    const acquisitionRow = {
      analysis_job_id: '60000000-0000-4000-8000-000000000001',
      analysis_job_attempt_id: '70000000-0000-4000-8000-000000000001',
      analysis_run_id: row.analysis_run_id,
      workspace_id: row.workspace_id,
      job_kind: 'analysis.execute',
      job_version: 1,
      attempt_number: 1,
      lease_token: '80000000-0000-4000-8000-000000000001',
      lease_expires_at: '2026-08-10T12:01:00.000Z',
      processor_version: 'analysis.deterministic.v1',
      traceparent: command.traceContext.traceparent,
      tracestate: command.traceContext.tracestate,
    };
    const acquireNextJob = vi
      .fn()
      .mockResolvedValue({ data: [acquisitionRow], error: null });
    const repository = makeSupabaseAnalysisRunRepository(
      client({ acquireNextJob })
    );

    await expect(
      Effect.runPromise(
        repository.acquireNextJob({
          workerId: 'worker-1',
          processorVersion: 'analysis.deterministic.v1',
          leaseSeconds: 60,
        })
      )
    ).resolves.toMatchObject({
      value: {
        jobId: acquisitionRow.analysis_job_id,
        attemptId: acquisitionRow.analysis_job_attempt_id,
        traceContext: command.traceContext,
      },
    });
    expect(acquireNextJob).toHaveBeenCalledExactlyOnceWith({
      p_lease_owner: 'worker-1',
      p_processor_version: 'analysis.deterministic.v1',
      p_lease_seconds: 60,
    });
  });

  it('maps a stale job completion token to a typed lease-lost failure', async () => {
    const error = { code: 'P0003' } as PostgrestError;
    const repository = makeSupabaseAnalysisRunRepository(
      client({
        completeJobSuccess: vi.fn().mockResolvedValue({ data: null, error }),
      })
    );
    const result = await Effect.runPromise(
      repository
        .completeJobSuccess({
          execution: {
            jobId: '60000000-0000-4000-8000-000000000001',
            attemptId: '70000000-0000-4000-8000-000000000001',
            analysisRunId: row.analysis_run_id,
            workspaceId: row.workspace_id,
            kind: 'analysis.execute',
            version: 1,
            attemptNumber: 1,
            leaseToken: '80000000-0000-4000-8000-000000000001',
            leaseExpiresAt: new Date('2026-08-10T12:01:00.000Z'),
            processorVersion: 'analysis.deterministic.v1',
            traceContext: command.traceContext,
          } as AnalysisJobExecution,
          resultFingerprint: 'analysis.deterministic.v1/run/job',
          result: resultDraft,
          durationMilliseconds: 1,
        })
        .pipe(Effect.either)
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: { _tag: 'AnalysisJobLeaseLostError' },
    });
  });

  it('maps a retry scheduling receipt through the failed-completion command', async () => {
    const completeJobFailure = vi.fn().mockResolvedValue({
      data: [
        {
          analysis_job_id: '60000000-0000-4000-8000-000000000001',
          analysis_run_id: row.analysis_run_id,
          attempt_number: 1,
          completion_outcome: 'retry_scheduled',
          failure_category: 'provider.timeout',
          next_available_at: '2026-08-10T12:00:05.000Z',
        },
      ],
      error: null,
    });
    const repository = makeSupabaseAnalysisRunRepository(
      client({ completeJobFailure })
    );
    const execution = {
      jobId: '60000000-0000-4000-8000-000000000001',
      attemptId: '70000000-0000-4000-8000-000000000001',
      analysisRunId: row.analysis_run_id,
      workspaceId: row.workspace_id,
      kind: 'analysis.execute',
      version: 1,
      attemptNumber: 1,
      leaseToken: '80000000-0000-4000-8000-000000000001',
      leaseExpiresAt: new Date('2026-08-10T12:01:00.000Z'),
      processorVersion: 'analysis.deterministic.v1',
      traceContext: command.traceContext,
    } as AnalysisJobExecution;

    await expect(
      Effect.runPromise(
        repository.completeJobFailure({
          execution,
          failureCategory: 'provider.timeout',
          retryable: true,
          durationMilliseconds: 12,
        })
      )
    ).resolves.toMatchObject({
      jobId: execution.jobId,
      outcome: 'retry_scheduled',
      failureCategory: 'provider.timeout',
      nextAvailableAt: new Date('2026-08-10T12:00:05.000Z'),
    });
    expect(completeJobFailure).toHaveBeenCalledExactlyOnceWith({
      p_job_id: execution.jobId,
      p_attempt_id: execution.attemptId,
      p_lease_token: execution.leaseToken,
      p_failure_category: 'provider.timeout',
      p_retryable: true,
      p_duration_milliseconds: 12,
    });
  });

  it('uses the bounded worker readiness command', async () => {
    const checkWorkerReady = vi
      .fn()
      .mockResolvedValue({ data: true, error: null });
    const repository = makeSupabaseAnalysisRunRepository(
      client({ checkWorkerReady })
    );

    await expect(
      Effect.runPromise(repository.checkWorkerReady())
    ).resolves.toBe(true);
    expect(checkWorkerReady).toHaveBeenCalledOnce();
  });
});
