import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  DECISION_EXTRACTION_OUTPUT_JSON_SCHEMA,
  DecisionExtractionInputSchema,
  buildDecisionExtractionRequest,
  extractDecisions,
} from '@omoikane/application/analysis';
import {
  makeOllamaDecisionExtractorLayer,
  type OllamaChatTransport,
  type OllamaChatTransportResponse,
} from './ollama-decision-extractor';

const model = 'qwen3:8b';
const input = Schema.decodeUnknownSync(DecisionExtractionInputSchema)({
  analysisRunId: '40000000-0000-4000-8000-000000000001',
  sources: [
    {
      messageId: '10000000-0000-4000-8000-000000000001',
      messageRevisionId: '20000000-0000-4000-8000-000000000001',
      authorUserId: '30000000-0000-4000-8000-000000000001',
      content: 'We agreed to release on Friday.',
    },
  ],
  sourceTruncated: false,
});
const output = {
  schemaVersion: 'decision-forensics.result.v1',
  candidates: [],
} as const;
const successfulBody = (overrides: Record<string, unknown> = {}) => ({
  model,
  done: true,
  done_reason: 'stop',
  message: { role: 'assistant', content: JSON.stringify(output) },
  prompt_eval_count: 42,
  eval_count: 7,
  ...overrides,
});
const response = (
  body: unknown,
  status = 200
): OllamaChatTransportResponse => ({ status, body });
const successfulTransport = (body: unknown = successfulBody()) => {
  const chat = vi.fn(() => Effect.succeed(response(body)));
  return { transport: { chat } satisfies OllamaChatTransport, chat };
};
const run = (transport: OllamaChatTransport) =>
  extractDecisions(input).pipe(
    Effect.provide(
      makeOllamaDecisionExtractorLayer({
        model,
        timeoutMilliseconds: 15_000,
        transport,
      })
    )
  );

describe('makeOllamaDecisionExtractorLayer', () => {
  it('maps the immutable extraction contract to one structured, non-streaming request', async () => {
    const { transport, chat } = successfulTransport();

    await expect(Effect.runPromise(run(transport))).resolves.toEqual({
      output,
      providerKind: 'ollama',
      model,
      usage: { inputUnits: 42, outputUnits: 7 },
    });

    const extractionRequest = buildDecisionExtractionRequest(input);
    expect(chat).toHaveBeenCalledExactlyOnceWith(
      {
        model,
        messages: [
          {
            role: 'system',
            content: extractionRequest.prompt.instructions,
          },
          { role: 'user', content: extractionRequest.prompt.sourceData },
        ],
        format: DECISION_EXTRACTION_OUTPUT_JSON_SCHEMA,
        stream: false,
        think: false,
        options: { temperature: 0, num_predict: 8192 },
      },
      15_000
    );
  });

  it('reports null usage when Ollama omits token counts', async () => {
    const { transport } = successfulTransport(
      successfulBody({
        prompt_eval_count: undefined,
        eval_count: undefined,
      })
    );
    await expect(Effect.runPromise(run(transport))).resolves.toMatchObject({
      usage: { inputUnits: null, outputUnits: null },
    });
  });

  it.each([
    [408, 'DecisionExtractionUnavailableError', 'timeout'],
    [413, 'DecisionExtractionLimitError', 'context'],
    [429, 'DecisionExtractionUnavailableError', 'rate-limited'],
    [404, 'UnsupportedDecisionExtractionConfigurationError', undefined],
    [503, 'DecisionExtractionUnavailableError', 'unavailable'],
  ])(
    'maps HTTP %s without retaining provider bodies',
    async (status, tag, reason) => {
      const chat = vi.fn(() =>
        Effect.succeed(response({ error: 'PRIVATE_PROVIDER_BODY' }, status))
      );
      const error = await Effect.runPromise(Effect.flip(run({ chat })));
      expect(error).toMatchObject({ _tag: tag, ...(reason ? { reason } : {}) });
      expect(JSON.stringify(error)).not.toContain('PRIVATE_PROVIDER_BODY');
    }
  );

  it.each([
    [
      'non-JSON content',
      successfulBody({
        message: { role: 'assistant', content: 'not-json' },
      }),
      'InvalidDecisionExtractionOutputError',
    ],
    [
      'model substitution',
      successfulBody({ model: 'another-model' }),
      'UnsupportedDecisionExtractionConfigurationError',
    ],
    [
      'tool call',
      successfulBody({
        message: {
          role: 'assistant',
          content: JSON.stringify(output),
          tool_calls: [{ function: { name: 'unsafe' } }],
        },
      }),
      'InvalidDecisionExtractionOutputError',
    ],
    [
      'output limit',
      successfulBody({ done_reason: 'length' }),
      'DecisionExtractionLimitError',
    ],
  ])(
    'rejects an unsafe or incompatible successful response: %s',
    async (_name, body, tag) => {
      const { transport } = successfulTransport(body);
      const error = await Effect.runPromise(Effect.flip(run(transport)));
      expect(error._tag).toBe(tag);
      expect(JSON.stringify(error)).not.toContain('not-json');
    }
  );

  it('maps runtime transport failures without leaking their causes', async () => {
    const chat = vi.fn(() =>
      Effect.fail({ reason: 'timeout' as const, cause: 'PRIVATE_SENTINEL' })
    );
    const error = await Effect.runPromise(Effect.flip(run({ chat })));
    expect(error).toEqual({
      _tag: 'DecisionExtractionUnavailableError',
      reason: 'timeout',
    });
    expect(JSON.stringify(error)).not.toContain('PRIVATE_SENTINEL');
  });
});
