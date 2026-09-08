import { Effect } from 'effect';
import type {
  OllamaChatRequest,
  OllamaChatTransport,
  OllamaChatTransportError,
} from '@omoikane/infrastructure/analysis';

const MAX_RESPONSE_CHARACTERS = 1_000_000;

const chatEndpoint = (baseUrl: string): string => {
  const normalized = new URL(baseUrl);
  if (!normalized.pathname.endsWith('/')) {
    normalized.pathname += '/';
  }
  return new URL('api/chat', normalized).toString();
};

/**
 * Implements the runtime-owned HTTP and cancellation boundary for Ollama.
 * Response text and thrown transport details never cross the safe adapter seam.
 */
export const makeNodeOllamaChatTransport = (
  baseUrl: string,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch
): OllamaChatTransport => ({
  chat: (
    request: OllamaChatRequest,
    timeoutMilliseconds: number
  ): Effect.Effect<
    { readonly status: number; readonly body: unknown },
    OllamaChatTransportError
  > => {
    let timedOut = false;
    return Effect.tryPromise({
      try: async (effectSignal) => {
        const controller = new AbortController();
        const interrupt = (): void => controller.abort();
        effectSignal.addEventListener('abort', interrupt, { once: true });
        const timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMilliseconds);
        try {
          const response = await fetchImplementation(chatEndpoint(baseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: controller.signal,
          });
          if (!response.ok) {
            return { status: response.status, body: null };
          }
          const text = await response.text();
          if (text.length > MAX_RESPONSE_CHARACTERS) {
            return { status: response.status, body: null };
          }
          let body: unknown;
          try {
            body = JSON.parse(text) as unknown;
          } catch {
            body = null;
          }
          return { status: response.status, body };
        } finally {
          clearTimeout(timeout);
          effectSignal.removeEventListener('abort', interrupt);
        }
      },
      catch: (): OllamaChatTransportError => ({
        reason: timedOut ? 'timeout' : 'unavailable',
      }),
    });
  },
});
