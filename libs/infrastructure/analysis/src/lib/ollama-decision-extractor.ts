import { Effect, Layer, Schema } from 'effect';
import {
  DECISION_EXTRACTION_OUTPUT_JSON_SCHEMA,
  DecisionExtractionLimitError,
  DecisionExtractionOutputSchema,
  DecisionExtractionUnavailableError,
  DecisionExtractorTag,
  InvalidDecisionExtractionOutputError,
  UnsupportedDecisionExtractionConfigurationError,
  type DecisionExtractionError,
  type DecisionExtractionRequest,
  type DecisionExtractionResponse,
  type DecisionExtractor,
} from '@omoikane/application/analysis';

/** Provider request shape understood by the runtime-owned HTTP transport. */
export interface OllamaChatRequest {
  readonly model: string;
  readonly messages: ReadonlyArray<{
    readonly role: 'system' | 'user';
    readonly content: string;
  }>;
  readonly format: typeof DECISION_EXTRACTION_OUTPUT_JSON_SCHEMA;
  readonly stream: false;
  readonly think: false;
  readonly options: {
    readonly temperature: 0;
    readonly num_predict: 8192;
  };
}

/** Safe transport category; low-level causes must not cross this seam. */
export interface OllamaChatTransportError {
  readonly reason: 'timeout' | 'unavailable';
}

/** Status and untrusted decoded body returned by the HTTP transport. */
export interface OllamaChatTransportResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Narrow runtime seam for Ollama's HTTP endpoint. The Node worker will own
 * `fetch` and cancellation; this infrastructure adapter owns the provider
 * protocol and translation into application failures.
 */
export interface OllamaChatTransport {
  readonly chat: (
    request: OllamaChatRequest,
    timeoutMilliseconds: number
  ) => Effect.Effect<OllamaChatTransportResponse, OllamaChatTransportError>;
}

/** Validated deployment values and transport required to construct the Layer. */
export interface OllamaDecisionExtractorConfig {
  readonly model: string;
  readonly timeoutMilliseconds: number;
  readonly transport: OllamaChatTransport;
}

const OllamaChatResponseSchema = Schema.Struct({
  model: Schema.String,
  done: Schema.Literal(true),
  done_reason: Schema.optional(Schema.Literal('stop', 'length')),
  message: Schema.Struct({
    role: Schema.Literal('assistant'),
    content: Schema.String.pipe(Schema.maxLength(1_000_000)),
    tool_calls: Schema.optional(Schema.Array(Schema.Unknown)),
  }),
  prompt_eval_count: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.nonNegative())
  ),
  eval_count: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.nonNegative())
  ),
});

const invalidOutput = (): InvalidDecisionExtractionOutputError =>
  new InvalidDecisionExtractionOutputError({ reason: 'schema' });

const mapTransportError = (
  error: OllamaChatTransportError
): DecisionExtractionUnavailableError =>
  new DecisionExtractionUnavailableError({ reason: error.reason });

const mapHttpFailure = (
  status: number
): Exclude<DecisionExtractionError, InvalidDecisionExtractionOutputError> => {
  if (status === 408 || status === 504) {
    return new DecisionExtractionUnavailableError({ reason: 'timeout' });
  }
  if (status === 429) {
    return new DecisionExtractionUnavailableError({ reason: 'rate-limited' });
  }
  if (status === 413) {
    return new DecisionExtractionLimitError({ reason: 'context' });
  }
  if (status === 400 || status === 404 || status === 422) {
    return new UnsupportedDecisionExtractionConfigurationError();
  }
  return new DecisionExtractionUnavailableError({ reason: 'unavailable' });
};

const requestFor = (
  model: string,
  request: DecisionExtractionRequest
): OllamaChatRequest => ({
  model,
  messages: [
    { role: 'system', content: request.prompt.instructions },
    { role: 'user', content: request.prompt.sourceData },
  ],
  format: DECISION_EXTRACTION_OUTPUT_JSON_SCHEMA,
  stream: false,
  think: false,
  options: {
    temperature: request.generationPolicy.temperature,
    num_predict: request.generationPolicy.maxOutputTokens,
  },
});

const decodeSuccessfulResponse = (
  configuredModel: string,
  value: unknown
): Effect.Effect<DecisionExtractionResponse, DecisionExtractionError> =>
  Effect.gen(function* () {
    const response = yield* Schema.decodeUnknown(OllamaChatResponseSchema)(
      value
    ).pipe(Effect.mapError(invalidOutput));
    if (response.model !== configuredModel) {
      return yield* new UnsupportedDecisionExtractionConfigurationError();
    }
    if (response.done_reason === 'length') {
      return yield* new DecisionExtractionLimitError({ reason: 'policy' });
    }
    if ((response.message.tool_calls?.length ?? 0) > 0) {
      return yield* invalidOutput();
    }
    const output = yield* Schema.decodeUnknown(
      Schema.parseJson(DecisionExtractionOutputSchema)
    )(response.message.content, { onExcessProperty: 'error' }).pipe(
      Effect.mapError(invalidOutput)
    );
    return {
      output,
      providerKind: 'ollama',
      model: response.model,
      usage: {
        inputUnits: response.prompt_eval_count ?? null,
        outputUnits: response.eval_count ?? null,
      },
    };
  });

/**
 * Supplies the application `DecisionExtractor` service with an Ollama adapter.
 *
 * The returned Layer sends the immutable application prompt as a system
 * message, sends JSON-escaped source data separately, disables streaming,
 * thinking, and tools, and constrains output with the application's JSON
 * Schema. It maps HTTP/transport failures into content-free application error
 * categories and decodes model output before it crosses the adapter boundary.
 */
export const makeOllamaDecisionExtractorLayer = ({
  model,
  timeoutMilliseconds,
  transport,
}: OllamaDecisionExtractorConfig): Layer.Layer<DecisionExtractor> =>
  Layer.succeed(DecisionExtractorTag, {
    extract: (request) =>
      transport.chat(requestFor(model, request), timeoutMilliseconds).pipe(
        Effect.mapError(mapTransportError),
        Effect.flatMap(({ status, body }) =>
          status >= 200 && status < 300
            ? decodeSuccessfulResponse(model, body)
            : Effect.fail(mapHttpFailure(status))
        ),
        Effect.withSpan('ollama.decision_extraction', {
          kind: 'client',
          attributes: {
            'gen_ai.provider.name': 'ollama',
            'gen_ai.request.model': model,
          },
        })
      ),
  });
