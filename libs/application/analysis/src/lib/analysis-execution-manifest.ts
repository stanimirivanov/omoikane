import { Effect, Schema } from 'effect';
import { AnalysisRunIdSchema } from '@omoikane/domain/analysis';
import type { AnalysisJobExecution } from './analysis-job';
import type { AnalysisJobExecutionRepositoryError } from './analysis-run-error';
import {
  AnalysisRunRepositoryTag,
  type AnalysisRunRepository,
} from './analysis-run-repository';
import { UnsupportedDecisionExtractionConfigurationError } from './decision-extraction';
import { DECISION_EXTRACTION_PROMPT_DIGEST } from './extract-decisions';

const label = Schema.String.pipe(
  Schema.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u)
);

/** Durable metadata only: no endpoints, credentials, prompt text, or source content. */
export const AnalysisExecutionConfigurationSchema = Schema.Struct({
  providerKind: label,
  model: label,
  processorVersion: label,
  resultSchemaVersion: label,
  promptVersion: label,
  promptDigest: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{64}$/u)),
  evaluationVersion: label,
  generationPolicy: Schema.Struct({
    temperature: Schema.Literal(0),
    maxOutputTokens: Schema.Literal(8192),
    tools: Schema.Literal(false),
    repairAttempts: Schema.Literal(0),
  }),
});
export type AnalysisExecutionConfiguration =
  typeof AnalysisExecutionConfigurationSchema.Type;

/** One immutable configuration receipt per run, shared by all attempts. */
export const AnalysisExecutionManifestSchema = Schema.Struct({
  analysisRunId: AnalysisRunIdSchema,
  configuration: AnalysisExecutionConfigurationSchema,
});
export type AnalysisExecutionManifest =
  typeof AnalysisExecutionManifestSchema.Type;
export type AnalysisExecutionManifestError =
  | AnalysisJobExecutionRepositoryError
  | UnsupportedDecisionExtractionConfigurationError;

/** Constructs the one artifact/policy combination supported by this deployment. */
export const decisionExecutionConfiguration = (provider: {
  readonly providerKind: string;
  readonly model: string;
}): AnalysisExecutionConfiguration => ({
  ...provider,
  processorVersion: 'analysis.decision-forensics.v1',
  resultSchemaVersion: 'decision-forensics.result.v1',
  promptVersion: 'decision-forensics.extract.v1',
  promptDigest: DECISION_EXTRACTION_PROMPT_DIGEST,
  evaluationVersion: 'decision-forensics.evaluation.v1',
  generationPolicy: {
    temperature: 0,
    maxOutputTokens: 8192,
    tools: false,
    repairAttempts: 0,
  },
});

/**
 * Pins or observes the run configuration under its lease. A different pinned
 * provider/model or artifact is explicitly unsupported by this single-adapter
 * deployment; callers must never substitute the newly proposed configuration.
 * No provider is called and no content is loaded by this use case.
 */
export const pinAnalysisJobExecutionManifest = (
  execution: AnalysisJobExecution,
  provider: { readonly providerKind: string; readonly model: string }
): Effect.Effect<
  AnalysisExecutionManifest,
  AnalysisExecutionManifestError,
  AnalysisRunRepository
> =>
  Effect.gen(function* () {
    const desired = yield* Schema.decodeUnknown(
      AnalysisExecutionConfigurationSchema
    )(decisionExecutionConfiguration(provider), {
      onExcessProperty: 'error',
    }).pipe(
      Effect.mapError(
        () => new UnsupportedDecisionExtractionConfigurationError()
      )
    );
    if (execution.processorVersion !== desired.processorVersion) {
      return yield* new UnsupportedDecisionExtractionConfigurationError();
    }
    const repository = yield* AnalysisRunRepositoryTag;
    const manifest = yield* repository.pinJobExecutionManifest({
      execution,
      configuration: desired,
    });
    const pinned = manifest.configuration;
    if (
      manifest.analysisRunId !== execution.analysisRunId ||
      pinned.providerKind !== desired.providerKind ||
      pinned.model !== desired.model ||
      pinned.processorVersion !== desired.processorVersion ||
      pinned.resultSchemaVersion !== desired.resultSchemaVersion ||
      pinned.promptVersion !== desired.promptVersion ||
      pinned.promptDigest !== desired.promptDigest ||
      pinned.evaluationVersion !== desired.evaluationVersion ||
      pinned.generationPolicy.temperature !==
        desired.generationPolicy.temperature ||
      pinned.generationPolicy.maxOutputTokens !==
        desired.generationPolicy.maxOutputTokens ||
      pinned.generationPolicy.tools !== desired.generationPolicy.tools ||
      pinned.generationPolicy.repairAttempts !==
        desired.generationPolicy.repairAttempts
    ) {
      return yield* new UnsupportedDecisionExtractionConfigurationError();
    }
    return manifest;
  });
