import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import {
  DECISION_FORENSICS_PROCESSOR_VERSION,
  WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
  processAnalysisJob,
  processDecisionForensicsJob,
  type AnalysisJobProcessor,
  type SupportedAnalysisProcessorVersion,
} from '@omoikane/application/analysis';
import {
  makeOllamaDecisionExtractorLayer,
  type OllamaChatTransport,
} from '@omoikane/infrastructure/analysis';
import type { WorkerConfig } from '../config/worker-config';
import { makeNodeOllamaChatTransport } from './ollama-chat-transport';

/** Processor identity and implementation kept together for safe job acquisition. */
export interface ConfiguredAnalysisJobProcessor {
  readonly processorVersion: SupportedAnalysisProcessorVersion;
  readonly process: AnalysisJobProcessor;
}

type OllamaTransportFactory = (baseUrl: string) => OllamaChatTransport;

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

/** Selects the deterministic fallback or the explicitly configured live processor. */
export const makeConfiguredAnalysisJobProcessor = (
  config: WorkerConfig,
  transportFactory: OllamaTransportFactory = makeNodeOllamaChatTransport
): ConfiguredAnalysisJobProcessor => {
  const decisionForensics = config.decisionForensics;
  if (decisionForensics === null) {
    return {
      processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
      process: processAnalysisJob,
    };
  }

  const extractorLayer = makeOllamaDecisionExtractorLayer({
    model: decisionForensics.model,
    timeoutMilliseconds: decisionForensics.timeoutMilliseconds,
    transport: transportFactory(decisionForensics.baseUrl),
  });

  return {
    processorVersion: DECISION_FORENSICS_PROCESSOR_VERSION,
    process: (execution) =>
      processDecisionForensicsJob({
        execution,
        provider: {
          providerKind: decisionForensics.providerKind,
          model: decisionForensics.model,
        },
        fingerprint: sha256,
      }).pipe(Effect.provide(extractorLayer)),
  };
};
