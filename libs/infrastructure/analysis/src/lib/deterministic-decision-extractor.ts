import { Effect, Layer } from 'effect';
import {
  buildDecisionExtractionRequest,
  DecisionExtractorTag,
  UnsupportedDecisionExtractionConfigurationError,
  validateDecisionExtractionResponse,
  type DecisionExtractionInput,
  type DecisionExtractor,
} from '@omoikane/application/analysis';

/**
 * Synthetic conformance case, not a decision inference algorithm. Unknown response
 * deliberately exercises the same decoding boundary as a future model response.
 */
export interface DecisionExtractionConformanceCase {
  readonly input: DecisionExtractionInput;
  readonly response: unknown;
}

/**
 * Supplies a fixture-backed extractor for local conformance evaluation.
 * Exact input, artifact, and policy matching prevent arbitrary production messages
 * from being treated as a known synthetic case. No network or runtime globals.
 */
export const makeDeterministicDecisionExtractorLayer = (
  fixture: DecisionExtractionConformanceCase
): Layer.Layer<DecisionExtractor> => {
  const expectedRequest = JSON.stringify(
    buildDecisionExtractionRequest(fixture.input)
  );
  // Validation is evaluated per call, including deliberately malformed fixture data.
  return Layer.succeed(DecisionExtractorTag, {
    extract: (request) => {
      if (JSON.stringify(request) !== expectedRequest) {
        return Effect.fail(
          new UnsupportedDecisionExtractionConfigurationError()
        );
      }
      return validateDecisionExtractionResponse(
        request.input,
        fixture.response
      ).pipe(
        Effect.flatMap((decoded) =>
          decoded.providerKind === 'deterministic' &&
          decoded.model === 'conformance.v1'
            ? Effect.succeed(decoded)
            : Effect.fail(new UnsupportedDecisionExtractionConfigurationError())
        )
      );
    },
  });
};
