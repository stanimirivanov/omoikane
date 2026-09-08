# Omoikane AI worker

## Purpose

This Nx application is the asynchronous process boundary for Analysis jobs. It
owns one managed Effect runtime and two bounded, single-concurrency polling
steps: dispatch one requested outbox event, then acquire and execute one
available job.

The current processor is deliberately deterministic. It reads bounded immutable
message/revision/author identities from the run's persisted historical source
snapshot but no message content, performs no network model call, and produces a
stable workspace-message-inventory result. Recovered attempts observe the same
ordered identities and truncation state rather than recomputing current sources.

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
completion persists exact evidence references and one proposed finding before
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

## Extraction preparation

The application now exposes `prepareAnalysisJobExtraction` to load the exact
snapshot revision content through a lease-fenced, reauthorized RPC. It is a
prerequisite for the model processor; the running inventory loop still requests
identities only. `pinAnalysisJobExecutionManifest` is also available for the
future Decision Forensics processor, with immutable configuration and explicit
compatibility checks. Provider selection and model composition are not yet
configured. Content remains in immutable message
versions and is never copied into job payloads, lifecycle facts, or telemetry.
