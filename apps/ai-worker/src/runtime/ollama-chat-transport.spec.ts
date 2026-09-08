import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { DECISION_EXTRACTION_OUTPUT_JSON_SCHEMA } from '@omoikane/application/analysis';
import type { OllamaChatRequest } from '@omoikane/infrastructure/analysis';
import { makeNodeOllamaChatTransport } from './ollama-chat-transport';

const request: OllamaChatRequest = {
  model: 'qwen3:8b',
  messages: [{ role: 'system', content: 'policy' }],
  format: DECISION_EXTRACTION_OUTPUT_JSON_SCHEMA,
  stream: false,
  think: false,
  options: { temperature: 0, num_predict: 8192 },
};

describe('makeNodeOllamaChatTransport', () => {
  it('posts JSON to the configured chat endpoint and decodes unknown JSON', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response('{"done":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const transport = makeNodeOllamaChatTransport(
      'http://127.0.0.1:11434/ollama',
      fetchImplementation
    );

    await expect(
      Effect.runPromise(transport.chat(request, 1000))
    ).resolves.toEqual({ status: 200, body: { done: true } });
    expect(fetchImplementation).toHaveBeenCalledExactlyOnceWith(
      'http://127.0.0.1:11434/ollama/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('does not read provider error bodies', async () => {
    const text = vi.fn();
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text,
    });
    const transport = makeNodeOllamaChatTransport(
      'http://127.0.0.1:11434',
      fetchImplementation
    );

    await expect(
      Effect.runPromise(transport.chat(request, 1000))
    ).resolves.toEqual({ status: 429, body: null });
    expect(text).not.toHaveBeenCalled();
  });

  it('classifies its own abort deadline without exposing the thrown cause', async () => {
    const fetchImplementation = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('PRIVATE_TIMEOUT_SENTINEL'))
          );
        })
    );
    const transport = makeNodeOllamaChatTransport(
      'http://127.0.0.1:11434',
      fetchImplementation
    );

    const failure = await Effect.runPromise(
      Effect.flip(transport.chat(request, 10))
    );
    expect(failure).toEqual({ reason: 'timeout' });
    expect(JSON.stringify(failure)).not.toContain('PRIVATE_TIMEOUT_SENTINEL');
  });
});
