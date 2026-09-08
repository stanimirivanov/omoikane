import { describe, expect, it } from 'vitest';
import { InvalidWorkerConfigError, readWorkerConfig } from './worker-config';

describe('readWorkerConfig', () => {
  it('provides deterministic local runtime defaults', () => {
    expect(
      readWorkerConfig({ SUPABASE_SECRET_KEY: 'local-test-secret' })
    ).toMatchObject({
      environment: 'local',
      host: '0.0.0.0',
      port: 3334,
      pollIntervalMilliseconds: 1000,
      jobLeaseSeconds: 60,
      decisionForensics: null,
    });
  });

  it('enables Decision Forensics only from a complete Ollama configuration', () => {
    expect(
      readWorkerConfig({
        SUPABASE_SECRET_KEY: 'local-test-secret',
        OMOIKANE_OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
        OMOIKANE_DECISION_FORENSICS_MODEL: 'qwen3:8b',
      }).decisionForensics
    ).toEqual({
      providerKind: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'qwen3:8b',
      timeoutMilliseconds: 30000,
    });
  });

  it('does not enable Ollama when only its optional timeout is configured', () => {
    expect(
      readWorkerConfig({
        SUPABASE_SECRET_KEY: 'local-test-secret',
        OMOIKANE_OLLAMA_TIMEOUT_MS: '10000',
      }).decisionForensics
    ).toBeNull();
  });

  it('rejects partial or credential-bearing Ollama configuration', () => {
    expect(() =>
      readWorkerConfig({
        SUPABASE_SECRET_KEY: 'local-test-secret',
        OMOIKANE_DECISION_FORENSICS_MODEL: 'qwen3:8b',
      })
    ).toThrow(InvalidWorkerConfigError);
    expect(() =>
      readWorkerConfig({
        SUPABASE_SECRET_KEY: 'local-test-secret',
        OMOIKANE_OLLAMA_BASE_URL: 'http://user:password@localhost:11434',
        OMOIKANE_DECISION_FORENSICS_MODEL: 'qwen3:8b',
      })
    ).toThrow(InvalidWorkerConfigError);
  });

  it('requires an explicit trusted Supabase key', () => {
    expect(() => readWorkerConfig({})).toThrow(InvalidWorkerConfigError);
  });

  it('rejects malformed bounded configuration', () => {
    expect(() =>
      readWorkerConfig({
        SUPABASE_SECRET_KEY: 'local-test-secret',
        OMOIKANE_AI_WORKER_JOB_LEASE_SECONDS: '301',
      })
    ).toThrow(InvalidWorkerConfigError);
  });

  it('requires the Ollama deadline and completion margin to fit inside the lease', () => {
    expect(() =>
      readWorkerConfig({
        SUPABASE_SECRET_KEY: 'local-test-secret',
        OMOIKANE_OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
        OMOIKANE_DECISION_FORENSICS_MODEL: 'qwen3:8b',
        OMOIKANE_OLLAMA_TIMEOUT_MS: '30000',
        OMOIKANE_AI_WORKER_JOB_LEASE_SECONDS: '30',
      })
    ).toThrow(InvalidWorkerConfigError);
  });
});
