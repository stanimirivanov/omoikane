import { Effect, Layer, Option, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisRun } from '@omoikane/domain/analysis';
import {
  AnalysisRunRepositoryTag,
  type AnalysisRunRepository,
} from './analysis-run-repository';
import type {
  AnalysisJob,
  AnalysisJobExecution,
  AnalysisRunOutboxClaim,
} from './analysis-job';
import { AnalysisJobSourceSchema } from './analysis-job';
import {
  acquireNextAnalysisJob,
  completeAnalysisJobFailure,
  completeAnalysisJobSuccess,
  WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
  processAnalysisJob,
} from './analysis-job-execution';
import { getAnalysisRun } from './get-analysis-run';
import { startAnalysisRun } from './start-analysis-run';
import { dispatchNextAnalysisRun } from './dispatch-next-analysis-run';
import { prepareAnalysisJobExtraction } from './prepare-analysis-job-extraction';
import { AnalysisJobExecutionSchema } from './analysis-job';
import { AnalysisSourceAccessRevokedError } from './analysis-run-error';

const run = {
  id: '30000000-0000-4000-8000-000000000001',
  workspaceId: '20000000-0000-4000-8000-000000000001',
  channelId: '40000000-0000-4000-8000-000000000001',
  timeRange: {
    start: new Date('2026-07-01T00:00:00.000Z'),
    end: new Date('2026-07-08T00:00:00.000Z'),
  },
  requestedBy: '10000000-0000-4000-8000-000000000001',
  status: 'created',
  failureCategory: null,
  result: null,
  createdAt: new Date('2026-08-09T12:00:00.000Z'),
} as AnalysisRun;

const traceContext = {
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  tracestate: 'omoikane=test',
};
const timeRangeInput = {
  start: '2026-07-01T00:00:00.000Z',
  end: '2026-07-08T00:00:00.000Z',
};

const layer = (repository: AnalysisRunRepository) =>
  Layer.succeed(AnalysisRunRepositoryTag, repository);

const repository = (
  overrides: Partial<AnalysisRunRepository>
): AnalysisRunRepository => ({
  start: () => Effect.die('unexpected start'),
  get: () => Effect.die('unexpected get'),
  claimNextOutboxEvent: () => Effect.die('unexpected outbox claim'),
  dispatchOutboxEvent: () => Effect.die('unexpected outbox dispatch'),
  checkWorkerReady: () => Effect.die('unexpected worker readiness'),
  acquireNextJob: () => Effect.die('unexpected job acquisition'),
  loadJobSources: () => Effect.die('unexpected source load'),
  loadJobExtractionInput: () => Effect.die('unexpected content load'),
  completeJobSuccess: () => Effect.die('unexpected job completion'),
  completeJobFailure: () => Effect.die('unexpected failed job completion'),
  ...overrides,
});

describe('Analysis Run use cases', () => {
  it('prepares lease-owned extraction content and propagates access revocation', async () => {
    const execution = Schema.decodeUnknownSync(AnalysisJobExecutionSchema)({
      jobId: '60000000-0000-4000-8000-000000000001',
      attemptId: '70000000-0000-4000-8000-000000000001',
      leaseToken: '80000000-0000-4000-8000-000000000001',
      analysisRunId: run.id,
      workspaceId: run.workspaceId,
      kind: 'analysis.execute',
      version: 1,
      attemptNumber: 1,
      leaseExpiresAt: new Date('2026-09-08T12:00:00Z'),
      processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
      traceContext,
    });
    const input = {
      analysisRunId: run.id,
      sourceTruncated: false,
      sources: [],
    };
    const loadJobExtractionInput = vi.fn(() => Effect.succeed(input));
    expect(
      await Effect.runPromise(
        prepareAnalysisJobExtraction(execution).pipe(
          Effect.provide(layer(repository({ loadJobExtractionInput })))
        )
      )
    ).toEqual(input);
    expect(loadJobExtractionInput).toHaveBeenCalledExactlyOnceWith({
      execution,
    });
    const error = new AnalysisSourceAccessRevokedError();
    expect(
      await Effect.runPromise(
        prepareAnalysisJobExtraction(execution).pipe(
          Effect.provide(
            layer(
              repository({ loadJobExtractionInput: () => Effect.fail(error) })
            )
          ),
          Effect.flip
        )
      )
    ).toEqual(error);
  });
  it('starts a run with validated explicit identity and workspace scope', async () => {
    const start = vi.fn(() => Effect.succeed(run));
    const testRepository = repository({ start });

    await expect(
      Effect.runPromise(
        startAnalysisRun({
          identity: { userId: run.requestedBy },
          workspaceId: run.workspaceId,
          channelId: run.channelId,
          timeRange: timeRangeInput,
          traceContext,
        }).pipe(Effect.provide(layer(testRepository)))
      )
    ).resolves.toBe(run);
    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith({
      identity: { userId: run.requestedBy },
      workspaceId: run.workspaceId,
      channelId: run.channelId,
      timeRange: run.timeRange,
      traceContext,
    });
  });

  it('rejects malformed input before repository access', async () => {
    const start = vi.fn(() => Effect.succeed(run));
    const testRepository = repository({ start });
    const result = await Effect.runPromise(
      startAnalysisRun({
        identity: null,
        workspaceId: '',
        channelId: null,
        timeRange: null,
        traceContext: null,
      }).pipe(Effect.provide(layer(testRepository)), Effect.either)
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: { _tag: 'InvalidAnalysisRunInputError' },
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('rejects malformed trace correlation before repository access', async () => {
    const start = vi.fn(() => Effect.succeed(run));
    const testRepository = repository({ start });
    const result = await Effect.runPromise(
      startAnalysisRun({
        identity: { userId: run.requestedBy },
        workspaceId: run.workspaceId,
        channelId: run.channelId,
        timeRange: timeRangeInput,
        traceContext: {
          traceparent: 'not-a-traceparent',
          tracestate: null,
        },
      }).pipe(Effect.provide(layer(testRepository)), Effect.either)
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: {
        _tag: 'InvalidAnalysisRunInputError',
        field: 'traceContext',
      },
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('rejects a missing channel before repository access', async () => {
    const start = vi.fn(() => Effect.succeed(run));
    const result = await Effect.runPromise(
      startAnalysisRun({
        identity: { userId: run.requestedBy },
        workspaceId: run.workspaceId,
        timeRange: timeRangeInput,
        traceContext,
      }).pipe(Effect.provide(layer(repository({ start }))), Effect.either)
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: { _tag: 'InvalidAnalysisRunInputError', field: 'channelId' },
    });
    expect(start).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['malformed', { start: 'invalid', end: '2026-07-08T00:00:00.000Z' }],
    [
      'reversed',
      { start: '2026-07-08T00:00:00.000Z', end: '2026-07-01T00:00:00.000Z' },
    ],
    [
      'oversized',
      { start: '2026-07-01T00:00:00.000Z', end: '2026-08-01T00:00:00.001Z' },
    ],
    [
      'future',
      { start: '2999-01-01T00:00:00.000Z', end: '2999-01-02T00:00:00.000Z' },
    ],
  ])(
    'rejects a %s time range before repository access',
    async (_kind, timeRange) => {
      const start = vi.fn(() => Effect.succeed(run));
      const result = await Effect.runPromise(
        startAnalysisRun({
          identity: { userId: run.requestedBy },
          workspaceId: run.workspaceId,
          channelId: run.channelId,
          timeRange,
          traceContext,
        }).pipe(Effect.provide(layer(repository({ start }))), Effect.either)
      );

      expect(result).toMatchObject({
        _tag: 'Left',
        left: { _tag: 'InvalidAnalysisRunInputError', field: 'timeRange' },
      });
      expect(start).not.toHaveBeenCalled();
    }
  );

  it('gets a run through the same explicit scope', async () => {
    const get = vi.fn(() => Effect.succeed(run));
    const testRepository = repository({ get });

    await Effect.runPromise(
      getAnalysisRun({
        identity: { userId: run.requestedBy },
        workspaceId: run.workspaceId,
        analysisRunId: run.id,
      }).pipe(Effect.provide(layer(testRepository)))
    );
    expect(get).toHaveBeenCalledOnce();
  });

  it('claims and dispatches one available request', async () => {
    const claim = {
      eventId: '40000000-0000-4000-8000-000000000001',
      claimToken: '50000000-0000-4000-8000-000000000001',
    } as AnalysisRunOutboxClaim;
    const job = {
      id: '60000000-0000-4000-8000-000000000001',
      analysisRunId: run.id,
      workspaceId: run.workspaceId,
      kind: 'analysis.execute',
      version: 1,
      availableAt: new Date('2026-08-10T12:00:00.000Z'),
    } as AnalysisJob;
    const claimNextOutboxEvent = vi.fn(() =>
      Effect.succeed(Option.some(claim))
    );
    const dispatchOutboxEvent = vi.fn(() => Effect.succeed(job));

    const result = await Effect.runPromise(
      dispatchNextAnalysisRun({ dispatcherId: 'dispatcher-1' }).pipe(
        Effect.provide(
          layer(repository({ claimNextOutboxEvent, dispatchOutboxEvent }))
        )
      )
    );

    expect(result).toEqual(Option.some(job));
    expect(claimNextOutboxEvent).toHaveBeenCalledExactlyOnceWith({
      dispatcherId: 'dispatcher-1',
      leaseSeconds: 30,
    });
    expect(dispatchOutboxEvent).toHaveBeenCalledExactlyOnceWith(claim);
  });

  it('returns None without dispatching when no request is available', async () => {
    const dispatchOutboxEvent = vi.fn(() => Effect.die('unexpected dispatch'));
    const result = await Effect.runPromise(
      dispatchNextAnalysisRun({ dispatcherId: 'dispatcher-1' }).pipe(
        Effect.provide(
          layer(
            repository({
              claimNextOutboxEvent: () => Effect.succeed(Option.none()),
              dispatchOutboxEvent,
            })
          )
        )
      )
    );

    expect(Option.isNone(result)).toBe(true);
    expect(dispatchOutboxEvent).not.toHaveBeenCalled();
  });

  it('rejects an invalid dispatcher identity before repository access', async () => {
    const claimNextOutboxEvent = vi.fn(() => Effect.succeed(Option.none()));
    const result = await Effect.runPromise(
      dispatchNextAnalysisRun({ dispatcherId: '   ' }).pipe(
        Effect.provide(layer(repository({ claimNextOutboxEvent }))),
        Effect.either
      )
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: { _tag: 'InvalidAnalysisRunInputError', field: 'dispatcherId' },
    });
    expect(claimNextOutboxEvent).not.toHaveBeenCalled();
  });

  it('acquires work with the fixed deterministic processor contract', async () => {
    const execution = {
      jobId: '60000000-0000-4000-8000-000000000001',
      attemptId: '70000000-0000-4000-8000-000000000001',
      analysisRunId: run.id,
      workspaceId: run.workspaceId,
      kind: 'analysis.execute',
      version: 1,
      attemptNumber: 1,
      leaseToken: '80000000-0000-4000-8000-000000000001',
      leaseExpiresAt: new Date('2026-08-10T12:01:00.000Z'),
      processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
      traceContext,
    } as AnalysisJobExecution;
    const acquireNextJob = vi.fn(() => Effect.succeed(Option.some(execution)));

    await expect(
      Effect.runPromise(
        acquireNextAnalysisJob({ workerId: 'worker-1', leaseSeconds: 60 }).pipe(
          Effect.provide(layer(repository({ acquireNextJob })))
        )
      )
    ).resolves.toEqual(Option.some(execution));
    expect(acquireNextJob).toHaveBeenCalledExactlyOnceWith({
      workerId: 'worker-1',
      processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
      leaseSeconds: 60,
    });
  });

  it('produces the same receipt and commits it through the lease boundary', async () => {
    const execution = {
      jobId: '60000000-0000-4000-8000-000000000001',
      attemptId: '70000000-0000-4000-8000-000000000001',
      analysisRunId: run.id,
      workspaceId: run.workspaceId,
      kind: 'analysis.execute',
      version: 1,
      attemptNumber: 1,
      leaseToken: '80000000-0000-4000-8000-000000000001',
      leaseExpiresAt: new Date('2026-08-10T12:01:00.000Z'),
      processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
      traceContext,
    } as AnalysisJobExecution;
    const snapshot = {
      sources: [
        Schema.decodeUnknownSync(AnalysisJobSourceSchema)({
          messageId: '90000000-0000-4000-8000-000000000001',
          messageRevisionId: '91000000-0000-4000-8000-000000000001',
          authorUserId: run.requestedBy,
        }),
      ],
      sourceTruncated: false,
    };
    const processorLayer = layer(
      repository({ loadJobSources: () => Effect.succeed(snapshot) })
    );
    const firstReceipt = await Effect.runPromise(
      processAnalysisJob(execution).pipe(Effect.provide(processorLayer))
    );
    const secondReceipt = await Effect.runPromise(
      processAnalysisJob(execution).pipe(Effect.provide(processorLayer))
    );
    const completeJobSuccess = vi.fn(() =>
      Effect.succeed({
        id: execution.jobId,
        analysisRunId: execution.analysisRunId,
        workspaceId: execution.workspaceId,
        kind: execution.kind,
        version: execution.version,
        availableAt: new Date('2026-08-10T12:00:00.000Z'),
      } as AnalysisJob)
    );

    expect(firstReceipt).toEqual(secondReceipt);
    await Effect.runPromise(
      completeAnalysisJobSuccess({
        execution,
        receipt: firstReceipt,
        durationMilliseconds: 12,
      }).pipe(Effect.provide(layer(repository({ completeJobSuccess }))))
    );
    expect(completeJobSuccess).toHaveBeenCalledExactlyOnceWith({
      execution,
      resultFingerprint: firstReceipt.resultFingerprint,
      result: firstReceipt.result,
      durationMilliseconds: 12,
    });
  });

  it('commits a classified processor failure through the lease boundary', async () => {
    const execution = {
      jobId: '60000000-0000-4000-8000-000000000001',
      attemptId: '70000000-0000-4000-8000-000000000001',
      analysisRunId: run.id,
      workspaceId: run.workspaceId,
      kind: 'analysis.execute',
      version: 1,
      attemptNumber: 1,
      leaseToken: '80000000-0000-4000-8000-000000000001',
      leaseExpiresAt: new Date('2026-08-10T12:01:00.000Z'),
      processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
      traceContext,
    } as AnalysisJobExecution;
    const completeJobFailure = vi.fn(() =>
      Effect.succeed({
        jobId: execution.jobId,
        analysisRunId: execution.analysisRunId,
        attemptNumber: 1,
        outcome: 'retry_scheduled' as const,
        failureCategory: 'provider.timeout',
        nextAvailableAt: new Date('2026-08-10T12:00:05.000Z'),
      })
    );

    await Effect.runPromise(
      completeAnalysisJobFailure({
        execution,
        failureCategory: 'provider.timeout',
        retryable: true,
        durationMilliseconds: 12,
      }).pipe(Effect.provide(layer(repository({ completeJobFailure }))))
    );

    expect(completeJobFailure).toHaveBeenCalledExactlyOnceWith({
      execution,
      failureCategory: 'provider.timeout',
      retryable: true,
      durationMilliseconds: 12,
    });
  });
});
