# Omoikane server

## Purpose

This Nx application is the NestJS composition and HTTP boundary for trusted
Omoikane capabilities. It uses Fastify for HTTP and owns one long-lived Effect
runtime. The current runtime exposes liveness, dependency-aware readiness,
OpenAPI, authenticated entry, and OpenTelemetry boundaries for trusted capabilities.
The first product capability starts and observes a workspace-authorized,
channel-scoped Analysis Run, including its completed immutable inventory or
Decision Forensics result projection, bounded source-message time range, and
immutable human confirmation or rejection.

## Responsibilities

- decode server-owned process configuration before listening;
- own Fastify and NestJS process startup and graceful shutdown;
- construct, initialize, execute, and dispose the server Effect runtime;
- expose `/health/live` without consulting downstream dependencies;
- expose `/health/ready` after a bounded Supabase Auth health check;
- validate bearer tokens without taking ownership of browser sessions;
- attach only an immutable, provider-independent user identity to requests;
- deny access by default and render safe problem-details responses;
- atomically authorize workspace/channel scope and persist immutable Analysis
  Run acceptance records with an inclusive-start, exclusive-end UTC interval,
  initial lifecycle facts, and requested outbox events;
- expose authorized lifecycle and completed-result projections without direct
  browser access to worker-owned tables;
- serialize inventory and Decision Forensics results as an explicit OpenAPI
  union, including reproducibility metadata and ordered evidence identities;
- expose a candidate review command that maps competing reviews to a safe HTTP
  conflict while keeping authorization and first-write-wins policy in PostgreSQL;
- publish the implemented HTTP contract at `/openapi.json`.
- propagate W3C trace context and stable request IDs;
- emit safe structured request logs, traces, and bounded-cardinality metrics;
- flush optional OTLP/HTTP exporters during bounded shutdown.

It does not run models or workers, create jobs or findings, own refresh tokens,
or proxy existing Angular-to-Supabase collaboration operations.

## Dependency rule

`apps/server` is an outer runtime and may compose infrastructure, application,
and domain libraries. Those libraries must never depend on `apps/server`,
NestJS, Fastify, or its transport DTOs. Controllers translate HTTP only; use
cases retain business orchestration and typed failures.

## Structure

```text
src/
  main.ts                         process entry point and network listener
  create-server.ts                testable Nest/Fastify construction
  app/
    server.module.ts              composition root
    analysis-runs/                Analysis Run HTTP transport
    platform/
      authentication/             global guard and request identity
      configuration/              environment decoding
      effect-runtime/             Effect execution and lifecycle bridge
      health/                     liveness and readiness transport
      http/                       public-route and problem contracts
      observability/              request correlation and telemetry lifecycle
```

## Runtime flow

```text
process environment -> runtime schema -> ServerConfig
                                      -> Nest + Fastify
                                      -> Effect runtime initialization
GET /health/live -> HealthController -> validated build version -> JSON
GET /health/ready -> Effect runtime -> Supabase Auth health -> JSON/problem
protected request -> global guard -> token validator -> immutable identity
POST Analysis Run -> request trace carrier -> application use case
                  -> atomic run + lifecycle + outbox RPC -> created run
HTTP hook -> server span -> explicitly parented Effect and Supabase spans
application shutdown -> Nest lifecycle -> Effect runtime disposal
                                     -> bounded telemetry flush
```

A Managed Runtime is Effect's long-lived executor built from a Layer. The
server composes authentication and Analysis Run repository Layers once, then
supplies those application capabilities to guards, health checks, and routes.
Controllers do not construct Layers or call `Effect.runPromise` themselves.

For readers new to Effect: a Layer is a recipe for constructing dependencies,
while a Managed Runtime owns the constructed dependency graph and executes
Effect programs against it. Keeping both in the server composition root lets
application code describe typed work without knowing how Supabase or Nest is
configured.

## Configuration

| Variable                                 | Default               | Meaning                            |
| ---------------------------------------- | --------------------- | ---------------------------------- |
| `OMOIKANE_ENV`                           | `local`               | Deployment environment label.      |
| `OMOIKANE_SERVER_HOST`                   | `0.0.0.0`             | Network interface to bind.         |
| `OMOIKANE_SERVER_PORT`                   | `3333`                | TCP port from 1 through 65535.     |
| `OMOIKANE_SERVER_VERSION`                | `development`         | Build version shown by health.     |
| `OMOIKANE_READINESS_TIMEOUT_MS`          | `2000`                | Supabase Auth probe deadline.      |
| `SUPABASE_URL`                           | local CLI URL         | Supabase project API URL.          |
| `SUPABASE_ANON_KEY`                      | local publishable key | Public key for Auth requests.      |
| `SUPABASE_SECRET_KEY`                    | required              | Server-only Analysis RPC key.      |
| `SUPABASE_SERVICE_ROLE_KEY`              | empty                 | Legacy-key compatibility fallback. |
| `OMOIKANE_ALLOWED_ORIGINS`               | Angular local origin  | Comma-separated browser origins.   |
| `OTEL_EXPORTER_OTLP_ENDPOINT`            | unset                 | Optional OTLP/HTTP base URL.       |
| `OMOIKANE_TELEMETRY_SHUTDOWN_TIMEOUT_MS` | `3000`                | Bounded exporter shutdown.         |

Empty values use local defaults. A malformed non-empty value fails startup
before the server accepts traffic.

When the OTLP endpoint is absent, request IDs, trace IDs, metrics, and JSON logs
are still produced in process, but traces and metrics are not exported.
Telemetry export is optional and never participates in readiness.

## Local observability

Start the repository-owned Collector, Tempo, Prometheus, and Grafana profile:

```bash
pnpm dev:observability
```

Then configure the server process before starting it:

```powershell
$env:OTEL_EXPORTER_OTLP_ENDPOINT='http://127.0.0.1:4318'
pnpm server:dev
```

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 pnpm server:dev
```

Grafana is available at `http://localhost:3000`, Tempo at
`http://localhost:3200`, and Prometheus at `http://localhost:9090`. If port
9090 is already owned, set `OMOIKANE_PROMETHEUS_PORT` before starting the
profile. The server sends traces and metrics through OTLP/HTTP on port 4318.

```powershell
$env:OMOIKANE_PROMETHEUS_PORT='9091'
pnpm dev:observability
```

Inspect or stop only this profile with:

```bash
pnpm dev:observability:status
pnpm dev:observability:down
```

Application logs remain JSON lines on server stdout. Loki is intentionally not
started until an implemented log-transport slice can feed it without scraping
unrelated host or Docker output.

## Extension guidance

- Add public routes only by applying `@PublicRoute()` deliberately; ordinary
  Nest routes inherit the global authentication guard.
- Add transport DTOs inside the owning server capability folder.
- Add business rules and ports to domain and application libraries.
- Add provider queries, mappings, and Layers to infrastructure libraries.
- Merge a capability Layer into the shared runtime only when its first use case
  is implemented.

## Verification

```bash
pnpm server:test
pnpm db:prepare
pnpm server:integration:verify
pnpm server:build
pnpm nx run server:typecheck
pnpm nx run server:typecheck:test
pnpm nx run server:lint
```

`pnpm server:integration:verify` reads the running local Supabase server key
from `supabase status` and passes it only to the integration-test process. The
credential is neither hard-coded nor printed. Run `pnpm db:prepare` first so
the local schema, seed data, and PostgREST schema cache are current.

Run `pnpm server:dev`, then inspect:

```text
http://localhost:3333/health/live
http://localhost:3333/health/ready
http://localhost:3333/openapi.json
```

The local-Supabase verification signs in deterministic seeded users, proves
that a token crosses the boundary as only its canonical user ID, starts and
reads a member-authorized run, and verifies the outsider-safe `404` response.
It remains separate from unit tests because it requires the local CLI stack.
