import { Context, Data, Effect, JSONSchema, Schema } from 'effect';
import {
  AnalysisRunIdSchema,
  DecisionCandidateSchema,
} from '@omoikane/domain/analysis';
import { AnalysisJobSourceSchema } from './analysis-job';

/** Explicit bounds are versioned extraction policy, independent of a provider SDK. */
export const DecisionExtractionInputSchema = Schema.Struct({
  analysisRunId: AnalysisRunIdSchema,
  sources: Schema.Array(
    Schema.Struct({
      ...AnalysisJobSourceSchema.fields,
      content: Schema.String.pipe(
        Schema.maxLength(10000),
        Schema.filter((value) => value.trim().length > 0)
      ),
    })
  ).pipe(
    Schema.maxItems(100),
    Schema.filter(
      (sources) =>
        new Set(sources.map((source) => source.messageId)).size ===
          sources.length &&
        new Set(sources.map((source) => source.messageRevisionId)).size ===
          sources.length &&
        sources.reduce((total, source) => total + source.content.length, 0) <=
          100000
    )
  ),
  sourceTruncated: Schema.Boolean,
}).pipe(
  Schema.filter(
    (input) => !input.sourceTruncated || input.sources.length === 100
  )
);

/** No database IDs or mutable review state may be supplied by an extractor. */
export const DecisionExtractionOutputSchema = Schema.Struct({
  schemaVersion: Schema.Literal('decision-forensics.result.v1'),
  candidates: Schema.Array(DecisionCandidateSchema).pipe(Schema.maxItems(20)),
});

/**
 * Provider-neutral JSON Schema generated from the authoritative output
 * contract. Model adapters may use it to constrain generation, but application
 * validation remains authoritative because JSON Schema cannot express every
 * cross-field and evidence invariant enforced below.
 */
export const DECISION_EXTRACTION_OUTPUT_JSON_SCHEMA = JSONSchema.make(
  DecisionExtractionOutputSchema,
  { target: 'jsonSchema7' }
);

const metadataLabel = Schema.String.pipe(
  Schema.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u)
);
/** Provider usage is nullable when unreported, never guessed to be zero. */
export const DecisionExtractionResponseSchema = Schema.Struct({
  output: DecisionExtractionOutputSchema,
  providerKind: metadataLabel,
  model: metadataLabel,
  usage: Schema.Struct({
    inputUnits: Schema.NullOr(
      Schema.Number.pipe(Schema.int(), Schema.between(0, 1000000000))
    ),
    outputUnits: Schema.NullOr(
      Schema.Number.pipe(Schema.int(), Schema.between(0, 1000000000))
    ),
  }),
});

export type DecisionExtractionInput = typeof DecisionExtractionInputSchema.Type;
export type DecisionExtractionResponse =
  typeof DecisionExtractionResponseSchema.Type;

/** Safe categories deliberately omit provider bodies, message content, and schema parse errors. */
export class DecisionExtractionUnavailableError extends Data.TaggedError(
  'DecisionExtractionUnavailableError'
)<{
  readonly reason: 'unavailable' | 'rate-limited' | 'timeout';
}> {}
export class InvalidDecisionExtractionOutputError extends Data.TaggedError(
  'InvalidDecisionExtractionOutputError'
)<{
  readonly reason: 'schema' | 'evidence' | 'participant';
}> {}
export class DecisionExtractionLimitError extends Data.TaggedError(
  'DecisionExtractionLimitError'
)<{
  readonly reason: 'input' | 'context' | 'policy';
}> {}
export class UnsupportedDecisionExtractionConfigurationError extends Data.TaggedError(
  'UnsupportedDecisionExtractionConfigurationError'
)<Record<never, never>> {}
export type DecisionExtractionError =
  | DecisionExtractionUnavailableError
  | InvalidDecisionExtractionOutputError
  | DecisionExtractionLimitError
  | UnsupportedDecisionExtractionConfigurationError;

export interface DecisionExtractionRequest {
  readonly input: DecisionExtractionInput;
  readonly schemaVersion: 'decision-forensics.result.v1';
  readonly prompt: {
    readonly version: 'decision-forensics.extract.v1';
    readonly digest: string;
    readonly instructions: string;
    readonly sourceData: string;
  };
  readonly generationPolicy: {
    readonly temperature: 0;
    readonly maxOutputTokens: 8192;
    readonly tools: false;
    readonly repairAttempts: 0;
  };
}

/** One capability for decoded structured extraction. Adapters translate all expected transport failures. */
export interface DecisionExtractor {
  readonly extract: (
    request: DecisionExtractionRequest
  ) => Effect.Effect<DecisionExtractionResponse, DecisionExtractionError>;
}
/** Typed service key; an outer runtime supplies the chosen adapter using a Layer. */
export const DecisionExtractorTag = Context.GenericTag<DecisionExtractor>(
  '@omoikane/application/analysis/DecisionExtractor'
);

/** Decode unknown output and enforce exact revision membership before it can reach persistence. */
export const validateDecisionExtractionResponse = (
  input: DecisionExtractionInput,
  response: unknown
): Effect.Effect<
  DecisionExtractionResponse,
  InvalidDecisionExtractionOutputError
> =>
  Schema.decodeUnknown(DecisionExtractionResponseSchema)(response, {
    onExcessProperty: 'error',
  }).pipe(
    Effect.mapError(
      () => new InvalidDecisionExtractionOutputError({ reason: 'schema' })
    ),
    Effect.flatMap((decoded) => {
      const sources = new Map(
        input.sources.map((source) => [source.messageId, source])
      );
      for (const candidate of decoded.output.candidates) {
        for (const assertion of [
          ...candidate.claims,
          ...candidate.assumptions,
          ...candidate.participants,
        ]) {
          if (
            assertion.evidence.some(
              (ref) =>
                sources.get(ref.messageId)?.messageRevisionId !==
                ref.messageRevisionId
            )
          ) {
            return Effect.fail(
              new InvalidDecisionExtractionOutputError({ reason: 'evidence' })
            );
          }
        }
        // In v1 an asserted participant must author at least one cited message.
        // This prevents fabricating profile IDs; semantic role accuracy remains an evaluation concern.
        if (
          candidate.participants.some(
            (participant) =>
              !participant.evidence.some(
                (ref) =>
                  sources.get(ref.messageId)?.authorUserId ===
                  participant.profileId
              )
          )
        ) {
          return Effect.fail(
            new InvalidDecisionExtractionOutputError({ reason: 'participant' })
          );
        }
      }
      return Effect.succeed(decoded);
    })
  );
