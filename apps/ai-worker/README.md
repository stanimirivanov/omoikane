# Omoikane AI worker

## Purpose

This Nx application is the asynchronous process boundary for Analysis jobs. It
owns one managed Effect runtime and two bounded, single-concurrency polling
steps: dispatch one requested outbox event, then acquire and execute one
available job.

The worker selects one processor at startup. Without Ollama configuration it
uses the deterministic workspace-message-inventory processor. With both an
Ollama base URL and model configured, it runs Decision Forensics against the
bounded immutable source snapshot and atomically persists validated proposed
candidates. Recovered attempts observe the same source identities and pinned
model/prompt policy rather than recomputing current sources or silently changing
configuration.

## Runtime boundaries

```text
poll loop -> Analysis application use cases -> Analysis repository Tag
          -> Supabase RPCs -> PostgreSQL lease and lifecycle transaction
```

- PostgreSQL owns row locking, leases, opaque fencing tokens, attempts, and
  lifecycle ordering.
- The worker owns polling, concurrency one, process signals, bounded draining,
  trace continuation, health transport, and telemetry disposal.
- Browser and service roles have no direct access to queue tables.
- `/health/live` is dependency-free; `/health/ready` executes the bounded,
  non-mutating worker readiness command.

An expired lease may be recovered by another process. A stale process cannot
commit because completion requires the current job, attempt, and lease-token
identity. Typed retryable failures and unexpected processor defects use the
database-owned deterministic retry schedule; terminal or exhausted work is
dead-lettered atomically with the Analysis Run `failed` fact. Successful
completion persists exact evidence references and the processor result before
appending `succeeded`. Operator replay, hosted model providers, and finding
review are not implemented here.

## Commands

```bash
pnpm worker:dev
pnpm worker:test
pnpm worker:build
```

Local health endpoints default to:

- `http://localhost:3334/health/live`
- `http://localhost:3334/health/ready`

Configuration is documented in `.env.example`. The Supabase secret key (or the
legacy service-role compatibility key) belongs only to trusted server and
worker runtimes, must be supplied explicitly, and must never reach Angular.

Decision Forensics is enabled only when both
`OMOIKANE_OLLAMA_BASE_URL` and `OMOIKANE_DECISION_FORENSICS_MODEL` are
non-empty and valid. `OMOIKANE_OLLAMA_TIMEOUT_MS` bounds a provider call but does
not enable the feature by itself. Its deadline plus a five-second database
completion margin must fit within `OMOIKANE_AI_WORKER_JOB_LEASE_SECONDS`; invalid
startup combinations are rejected before the worker can claim a job. Start and
provision the documented local profile with `pnpm dev:ai-local`, verify it with
`pnpm dev:ai-local:status`, then use these worker values:

```dotenv
OMOIKANE_OLLAMA_BASE_URL=http://127.0.0.1:11434
OMOIKANE_DECISION_FORENSICS_MODEL=qwen3:4b-instruct
OMOIKANE_OLLAMA_TIMEOUT_MS=30000
```

Stop only the optional profile with `pnpm dev:ai-local:down`. Model storage is a
named Docker volume and is preserved. These settings and message content remain
inside the worker; provider response bodies and transport errors are reduced to
safe typed categories before they reach logs, telemetry, or persistence.

## Decision Forensics execution

The application orchestration pins or observes the immutable execution manifest
before loading exact snapshot revision content through a lease-fenced,
reauthorized RPC. It then calls the provider-neutral extractor port, validates
the structured result and every evidence reference, creates a lowercase SHA-256
fingerprint, and hands one receipt to the existing atomic completion command.

The Node runtime owns `fetch`, deadline cancellation, and hashing. The
infrastructure adapter owns the Ollama protocol. The application owns workflow
ordering and failure classification. Content remains in immutable message
versions and is never copied into job payloads, lifecycle facts, or telemetry.
