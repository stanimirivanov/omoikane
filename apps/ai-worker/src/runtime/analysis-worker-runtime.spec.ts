import { Effect, Layer, Option } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnalysisRunRepositoryTag,
  WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
  RetryableAnalysisProcessorError,
  type AnalysisJob,
  type AnalysisJobExecution,
  type AnalysisRunRepository,
} from '@omoikane/application/analysis';
import type { WorkerConfig } from '../config/worker-config';
import { WorkerTelemetry } from '../telemetry/worker-telemetry';
import { AnalysisWorkerRuntime } from './analysis-worker-runtime';

const config: WorkerConfig = {
  environment: 'test',
  host: '127.0.0.1',
  port: 3334,
  version: '0.1.0-test',
  workerId: 'worker-test',
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseSecretKey: 'test-secret-key',
  pollIntervalMilliseconds: 10,
  jobLeaseSeconds: 60,
  drainTimeoutMilliseconds: 1000,
  readinessTimeoutMilliseconds: 1000,
  telemetryEndpoint: null,
  telemetryShutdownTimeoutMilliseconds: 1000,
  decisionForensics: null,
};

const execution = {
  jobId: '60000000-0000-4000-8000-000000000001',
  attemptId: '70000000-0000-4000-8000-000000000001',
  analysisRunId: '30000000-0000-4000-8000-000000000001',
  workspaceId: '20000000-0000-4000-8000-000000000001',
  kind: 'analysis.execute',
  version: 1,
  attemptNumber: 1,
  leaseToken: '80000000-0000-4000-8000-000000000001',
  leaseExpiresAt: new Date('2099-01-01T00:01:00.000Z'),
  processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
  traceContext: {
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    tracestate: null,
  },
} as AnalysisJobExecution;

const completedJob = {
  id: execution.jobId,
  analysisRunId: execution.analysisRunId,
  workspaceId: execution.workspaceId,
  kind: execution.kind,
  version: execution.version,
  availableAt: new Date('2026-08-10T12:00:00.000Z'),
} as AnalysisJob;

const repository = (
  overrides: Partial<AnalysisRunRepository>
): AnalysisRunRepository => ({
  start: () => Effect.die('unexpected start'),
  get: () => Effect.die('unexpected get'),
  claimNextOutboxEvent: () => Effect.succeed(Option.none()),
  dispatchOutboxEvent: () => Effect.die('unexpected dispatch'),
  checkWorkerReady: () => Effect.succeed(true),
  acquireNextJob: () => Effect.succeed(Option.none()),
  loadJobSources: () => Effect.succeed({ sources: [], sourceTruncated: false }),
  loadJobExtractionInput: () => Effect.die('unexpected content load'),
  pinJobExecutionManifest: () => Effect.die('unexpected manifest pin'),
  completeJobSuccess: () => Effect.die('unexpected completion'),
  completeJobFailure: () => Effect.die('unexpected failed completion'),
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe('AnalysisWorkerRuntime', () => {
  it('executes one leased deterministic job and stops claiming before shutdown', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let acquisitionCount = 0;
    let completed!: () => void;
    const completionSignal = new Promise<void>((resolve) => {
      completed = resolve;
    });
    const completeJobSuccess = vi.fn(() => {
      completed();
      return Effect.succeed(completedJob);
    });
    const acquireNextJob = vi.fn(() =>
      Effect.succeed(
        acquisitionCount++ === 0 ? Option.some(execution) : Option.none()
      )
    );
    const testRepository = repository({
      acquireNextJob,
      completeJobSuccess,
    });
    const telemetry = new WorkerTelemetry(config);
    const runtime = new AnalysisWorkerRuntime(
      config,
      telemetry,
      Layer.succeed(AnalysisRunRepositoryTag, testRepository)
    );

    await runtime.initialize();
    runtime.start();
    await completionSignal;
    await runtime.stop();

    expect(completeJobSuccess).toHaveBeenCalledOnce();
    expect(acquireNextJob).toHaveBeenCalledWith({
      workerId: config.workerId,
      processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
      leaseSeconds: config.jobLeaseSeconds,
    });
    expect(completeJobSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        execution,
        resultFingerprint: expect.stringContaining(execution.analysisRunId),
      })
    );
    expect(runtime.isInitialized()).toBe(false);
  });

  it('allows an active completion to drain during shutdown', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let acquired = false;
    let completionStarted!: () => void;
    let releaseCompletion!: () => void;
    const started = new Promise<void>((resolve) => {
      completionStarted = resolve;
    });
    const gate = new Promise<AnalysisJob>((resolve) => {
      releaseCompletion = () => resolve(completedJob);
    });
    const testRepository = repository({
      acquireNextJob: () => {
        if (acquired) {
          return Effect.succeed(Option.none());
        }
        acquired = true;
        return Effect.succeed(Option.some(execution));
      },
      completeJobSuccess: () => {
        completionStarted();
        return Effect.promise(() => gate);
      },
    });
    const telemetry = new WorkerTelemetry(config);
    const runtime = new AnalysisWorkerRuntime(
      config,
      telemetry,
      Layer.succeed(AnalysisRunRepositoryTag, testRepository)
    );

    await runtime.initialize();
    runtime.start();
    await started;
    let stopped = false;
    const stopping = runtime.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    releaseCompletion();
    await stopping;
    expect(stopped).toBe(true);
  });

  it('schedules a retry for a typed retryable processor failure', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let acquired = false;
    let failed!: () => void;
    const failedSignal = new Promise<void>((resolve) => {
      failed = resolve;
    });
    const completeJobFailure = vi.fn(() => {
      failed();
      return Effect.succeed({
        jobId: execution.jobId,
        analysisRunId: execution.analysisRunId,
        attemptNumber: execution.attemptNumber,
        outcome: 'retry_scheduled' as const,
        failureCategory: 'provider.timeout',
        nextAvailableAt: new Date('2026-08-10T12:00:05.000Z'),
      });
    });
    const testRepository = repository({
      acquireNextJob: () => {
        if (acquired) {
          return Effect.succeed(Option.none());
        }
        acquired = true;
        return Effect.succeed(Option.some(execution));
      },
      completeJobFailure,
    });
    const processor = () =>
      Effect.fail(
        new RetryableAnalysisProcessorError({ category: 'provider.timeout' })
      );
    const telemetry = new WorkerTelemetry(config);
    const runtime = new AnalysisWorkerRuntime(
      config,
      telemetry,
      Layer.succeed(AnalysisRunRepositoryTag, testRepository),
      {
        processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
        process: processor,
      }
    );

    await runtime.initialize();
    runtime.start();
    await failedSignal;
    await runtime.stop();

    expect(completeJobFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        execution,
        failureCategory: 'provider.timeout',
        retryable: true,
      })
    );
  });

  it('treats an unexpected processor defect as retryable and bounded', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let acquired = false;
    let failed!: () => void;
    const failedSignal = new Promise<void>((resolve) => {
      failed = resolve;
    });
    const completeJobFailure = vi.fn(() => {
      failed();
      return Effect.succeed({
        jobId: execution.jobId,
        analysisRunId: execution.analysisRunId,
        attemptNumber: execution.attemptNumber,
        outcome: 'dead_lettered' as const,
        failureCategory: 'processor.defect',
        nextAvailableAt: null,
      });
    });
    const testRepository = repository({
      acquireNextJob: () => {
        if (acquired) {
          return Effect.succeed(Option.none());
        }
        acquired = true;
        return Effect.succeed(Option.some(execution));
      },
      completeJobFailure,
    });
    const telemetry = new WorkerTelemetry(config);
    const runtime = new AnalysisWorkerRuntime(
      config,
      telemetry,
      Layer.succeed(AnalysisRunRepositoryTag, testRepository),
      {
        processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
        process: () => Effect.die('unexpected processor defect'),
      }
    );

    await runtime.initialize();
    runtime.start();
    await failedSignal;
    await runtime.stop();

    expect(completeJobFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        failureCategory: 'processor.defect',
        retryable: true,
      })
    );
  });
});
