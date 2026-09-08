import { Effect, Layer, Option, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  AnalysisJobExecutionSchema,
  AnalysisRunRepositoryTag,
  DECISION_FORENSICS_PROCESSOR_VERSION,
  WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
  decisionExecutionConfiguration,
  type AnalysisRunRepository,
} from '@omoikane/application/analysis';
import type { OllamaChatTransport } from '@omoikane/infrastructure/analysis';
import type { WorkerConfig } from '../config/worker-config';
import { makeConfiguredAnalysisJobProcessor } from './configured-analysis-job-processor';

const baseConfig: WorkerConfig = {
  environment: 'test',
  host: '127.0.0.1',
  port: 3334,
  version: 'test',
  workerId: 'worker-test',
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseSecretKey: 'test-secret',
  pollIntervalMilliseconds: 10,
  jobLeaseSeconds: 60,
  drainTimeoutMilliseconds: 1000,
  readinessTimeoutMilliseconds: 1000,
  telemetryEndpoint: null,
  telemetryShutdownTimeoutMilliseconds: 1000,
  decisionForensics: null,
};

const repository = (
  overrides: Partial<AnalysisRunRepository>
): AnalysisRunRepository => ({
  start: () => Effect.die('unexpected start'),
  get: () => Effect.die('unexpected get'),
  reviewDecisionCandidate: () => Effect.die('unexpected review'),
  claimNextOutboxEvent: () => Effect.succeed(Option.none()),
  dispatchOutboxEvent: () => Effect.die('unexpected dispatch'),
  checkWorkerReady: () => Effect.succeed(true),
  acquireNextJob: () => Effect.succeed(Option.none()),
  loadJobSources: () => Effect.die('unexpected identity load'),
  loadJobExtractionInput: () => Effect.die('unexpected content load'),
  pinJobExecutionManifest: () => Effect.die('unexpected manifest pin'),
  completeJobSuccess: () => Effect.die('unexpected completion'),
  completeJobFailure: () => Effect.die('unexpected failed completion'),
  ...overrides,
});

describe('makeConfiguredAnalysisJobProcessor', () => {
  it('keeps live extraction disabled when Ollama is not configured', () => {
    const binding = makeConfiguredAnalysisJobProcessor(baseConfig);
    expect(binding.processorVersion).toBe(
      WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION
    );
  });

  it('composes Ollama extraction and a lowercase SHA-256 receipt fingerprint', async () => {
    const model = 'qwen3:8b';
    const config: WorkerConfig = {
      ...baseConfig,
      decisionForensics: {
        providerKind: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        model,
        timeoutMilliseconds: 1000,
      },
    };
    const chat = vi.fn(() =>
      Effect.succeed({
        status: 200,
        body: {
          model,
          done: true,
          done_reason: 'stop',
          message: {
            role: 'assistant',
            content:
              '{"schemaVersion":"decision-forensics.result.v1","candidates":[]}',
          },
          prompt_eval_count: 8,
          eval_count: 4,
        },
      })
    );
    const transportFactory = vi.fn((): OllamaChatTransport => ({ chat }));
    const binding = makeConfiguredAnalysisJobProcessor(
      config,
      transportFactory
    );
    const execution = Schema.decodeUnknownSync(AnalysisJobExecutionSchema)({
      jobId: '60000000-0000-4000-8000-000000000001',
      attemptId: '70000000-0000-4000-8000-000000000001',
      leaseToken: '80000000-0000-4000-8000-000000000001',
      analysisRunId: '30000000-0000-4000-8000-000000000001',
      workspaceId: '20000000-0000-4000-8000-000000000001',
      kind: 'analysis.execute',
      version: 1,
      attemptNumber: 1,
      leaseExpiresAt: new Date('2099-01-01T00:00:00Z'),
      processorVersion: DECISION_FORENSICS_PROCESSOR_VERSION,
      traceContext: { traceparent: '', tracestate: null },
    });
    const provider = { providerKind: 'ollama', model };
    const configuration = decisionExecutionConfiguration(provider);
    const testRepository = repository({
      pinJobExecutionManifest: () =>
        Effect.succeed({
          analysisRunId: execution.analysisRunId,
          configuration,
        }),
      loadJobExtractionInput: () =>
        Effect.succeed({
          analysisRunId: execution.analysisRunId,
          sources: [],
          sourceTruncated: false,
        }),
    });

    const receipt = await Effect.runPromise(
      binding
        .process(execution)
        .pipe(
          Effect.provide(
            Layer.succeed(AnalysisRunRepositoryTag, testRepository)
          )
        )
    );

    expect(binding.processorVersion).toBe(DECISION_FORENSICS_PROCESSOR_VERSION);
    expect(transportFactory).toHaveBeenCalledExactlyOnceWith(
      config.decisionForensics?.baseUrl
    );
    expect(receipt).toMatchObject({
      resultFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      result: {
        kind: 'decision-forensics',
        candidates: [],
        usage: { inputUnits: 8, outputUnits: 4 },
      },
    });
    expect(chat).toHaveBeenCalledOnce();
  });
});
