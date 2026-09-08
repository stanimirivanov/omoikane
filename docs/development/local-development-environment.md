# Local Development Environment

> **Document ID:** OMO-DEV-001  
> **Version:** 1.0  
> **Status:** Approved target baseline, repository-reconciled 8 September 2026
> **Date:** 2 August 2026  
> **Product:** Omoikane - The Collaborative Intelligence Platform

This document defines the target local development environment. The server,
worker, Supabase paths, trace/metric observability profile, and optional local AI
profile are implemented. Sections that name Redis or Loki remain future
capability guidance until those artifacts have an implemented consumer.

## 1. Baseline workstation

The reference environment is Windows 11 with WSL2 Ubuntu, Docker Desktop using
Linux containers and WSL integration, and Visual Studio Code Remote WSL. The
repository is cloned inside the WSL filesystem. Native Windows execution remains
secondary.

- WSL2 avoids cross-filesystem performance penalties and reduces CRLF and
  executable-bit problems in Docker and Supabase assets.
- Docker Desktop owns the container runtime; commands run from the WSL terminal.
- VS Code opens the repository through Remote WSL so extensions, Node.js, pnpm,
  and Git run in the same Linux environment as project scripts.
- Version-controlled migrations, seed data, Compose files, and example
  configuration make the local environment reproducible.

## 2. Target runtime topology

The target local stack has two infrastructure owners:

- The Supabase CLI owns local Supabase containers. Its generated topology is not
  copied into the Omoikane Compose file.
- The Omoikane Docker Compose project owns Redis, OpenTelemetry, Prometheus,
  Grafana, Tempo, Loki, and optional Ollama.
- Angular, the application server, and the worker run natively through Nx during
  normal development for fast rebuilds and debugging. A full-container profile
  provides deployment parity and integration testing after release images exist.

Ownership must stay explicit: neither Compose nor custom scripts reimplement
the Supabase CLI's container lifecycle.

```mermaid
flowchart LR
  workstation["Developer workstation<br/>WSL2 + VS Code + pnpm"]
  client["Angular client<br/>Nx serve :4200"]
  server["NestJS + Effect server<br/>Nx serve :3333"]
  worker["Effect AI worker<br/>Nx serve :3334"]
  supabase["Supabase CLI stack<br/>API :54321 | DB :54322 | Studio :54323"]
  telemetry["OpenTelemetry stack<br/>Grafana :3000 | Prometheus :9090<br/>Tempo :3200 | Loki :3100"]
  redis["Redis :6379"]
  ollama["Optional Ollama :11434"]

  workstation --> client
  workstation --> server
  workstation --> worker
  client --> supabase
  client --> server
  client -.-> telemetry
  server --> supabase
  server --> telemetry
  server --> redis
  worker --> supabase
  worker --> telemetry
  worker --> redis
  worker -.-> ollama
```

The server process, worker, Supabase access, telemetry, and opt-in Ollama arrows
are operational. Redis remains target topology until a capability justifies it.
The worker continues to use the approved PostgreSQL-backed queue and does not
require Redis.

## 3. Target repository layout

```text
apps/
  client/                  # Angular application
  server/                  # NestJS HTTP/API modular monolith (Phase 3)
  ai-worker/               # asynchronous Effect runtime (Phase 4)

libs/
  domain/
  application/
  infrastructure/
  contracts/               # introduced only when a real cross-runtime contract exists
  platform/                # introduced only when a real platform capability exists

supabase/
  config.toml
  migrations/
  seed.sql
  tests/
  functions/

deploy/
  compose/
  containers/
  kubernetes/
  helm/

docs/
tools/
```

The layout is directional, not scaffolding instructions. Directories are added
with the first implemented capability that owns them.

## 4. Version and tool policy

| Tool                    | Policy                                                                    | Reason                                                                                  |
| ----------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Node.js                 | Pin 24.15.0 in `.node-version`; support `>=24.15.0 <25` through `engines` | Prevent workstation drift while allowing compatible Node 24 security and patch updates. |
| pnpm                    | Pin 11.16.0 through `packageManager` and Corepack                         | Match the current project baseline.                                                     |
| Angular                 | Retain 22.x during the platform work                                      | Avoid combining environment changes with a client upgrade.                              |
| Nx                      | Keep all `nx` and `@nx/*` packages on the same repository-pinned version  | Do not combine the local-platform change with an Nx upgrade.                            |
| Supabase CLI            | Use a pinned project development dependency                               | Give contributors and CI the same CLI version.                                          |
| Docker Desktop          | Use a stable Linux-container release                                      | Required by the Supabase CLI and Omoikane Compose profiles.                             |
| JavaScript installation | Use `pnpm install --frozen-lockfile` in CI                                | Treat the lockfile as authoritative.                                                    |

Target root metadata:

```json
{
  "name": "omoikane",
  "private": true,
  "packageManager": "pnpm@11.16.0",
  "engines": {
    "node": ">=24.15.0 <25"
  }
}
```

The dependency-free preinstall check makes the supported Node range an
installation gate rather than advisory metadata. `.node-version` selects the
reproducible reference version, while the engine range admits later compatible
Node 24 patch releases.

## 5. Environment configuration

| File or source                                          | Git policy       | Purpose                                                                                                          |
| ------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `.env.example`                                          | Committed        | Documents server, worker, Compose, and provider variables with safe placeholders as capabilities are introduced. |
| `.env.local`                                            | Ignored          | Developer-specific secrets and service-role credentials.                                                         |
| Client development environment or runtime public config | Committed        | Public local values only, such as Supabase URL and anonymous key.                                                |
| `supabase/config.toml`                                  | Committed        | Reproducible local Supabase project.                                                                             |
| Cloud secret stores                                     | Not used locally | Production secrets are never copied into repository files.                                                       |

- Standard Supabase variables retain the `SUPABASE_` prefix.
- Omoikane-specific runtime variables use `OMOIKANE_`.
- The Supabase CLI project ID is `omoikane-local`; it distinguishes the local
  containers from other projects on the same host and is not a hosted project
  identifier.
- The service-role key is available only to the server and worker, never to
  Angular.
- External AI provider keys are optional. Ollama provides a no-cloud local
  profile.

Target example, expanded only as the owning runtimes are implemented:

```dotenv
OMOIKANE_ENV=local
OMOIKANE_SERVER_HOST=0.0.0.0
OMOIKANE_SERVER_PORT=3333
OMOIKANE_SERVER_VERSION=development
OMOIKANE_WORKER_HEALTH_PORT=3334
OMOIKANE_REDIS_URL=redis://localhost:6379
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from-supabase-status>
SUPABASE_SECRET_KEY=<SECRET_KEY-from-pnpm-supabase-status>
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

OMOIKANE_OLLAMA_BASE_URL=http://127.0.0.1:11434
OMOIKANE_DECISION_FORENSICS_MODEL=qwen3:4b-instruct
OMOIKANE_OLLAMA_TIMEOUT_MS=30000
OMOIKANE_OLLAMA_MODEL=qwen3:4b-instruct
```

## 6. Target port allocation

| Runtime             |  Port |
| ------------------- | ----: |
| Angular client      |  4200 |
| Omoikane server     |  3333 |
| AI worker health    |  3334 |
| Supabase API        | 54321 |
| Supabase PostgreSQL | 54322 |
| Supabase Studio     | 54323 |
| Redis               |  6379 |
| Grafana             |  3000 |
| Prometheus          |  9090 |
| Loki                |  3100 |
| Tempo               |  3200 |
| OTLP gRPC           |  4317 |
| OTLP HTTP           |  4318 |
| Ollama              | 11434 |

## 7. Target startup scripts

Scripts are added in the phase that implements their dependencies. Until then,
their names document the intended operator contract rather than an available
command.

| Command                         | Contract                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev:bootstrap`            | Validate current tools, install locked dependencies, and start the implemented infrastructure. |
| `pnpm dev:up`                   | Start currently implemented infrastructure; this is Supabase-only until Compose is introduced. |
| `pnpm dev`                      | Reset local Supabase and run the implemented Angular client and NestJS server through Nx.      |
| `pnpm server:dev`               | Run the implemented server on port 3333 without starting or resetting Supabase.                |
| `pnpm server:test`              | Run focused server configuration, HTTP contract, and Effect lifecycle tests.                   |
| `pnpm server:build`             | Build the production server bundle.                                                            |
| `pnpm dev:observability`        | Start the implemented Collector, Prometheus, Grafana, and Tempo trace/metric profile.          |
| `pnpm dev:observability:status` | Inspect only the repository-owned observability profile.                                       |
| `pnpm dev:observability:down`   | Stop that profile while preserving its named local volumes.                                    |
| `pnpm dev:ai-local`             | Start Ollama and provision the documented local Decision Forensics model.                      |
| `pnpm dev:ai-local:status`      | Verify that the optional Ollama profile and configured local model are available.              |
| `pnpm dev:ai-local:down`        | Stop the optional Ollama profile while preserving its model volume.                            |
| `pnpm dev:status`               | Show implemented Node.js, pnpm, Docker, and local Supabase health.                             |
| `pnpm e2e:verify`               | Reset the local platform and run the authenticated Chromium collaboration smoke path.          |
| `pnpm dev:logs`                 | Follow infrastructure and implemented runtime logs.                                            |
| `pnpm dev:down`                 | Stop currently implemented infrastructure without deleting local Supabase data.                |
| `pnpm dev:clean`                | After confirmation, stop the stack and remove disposable local volumes.                        |

`pnpm dev:status` is implemented for the current tool-and-Supabase
infrastructure topology.
It is read-only, suppresses Supabase's credential-bearing status output, and
returns a non-zero exit code when a required tool or service is unavailable.
The server exposes `/health/live` for direct process verification; it joins the
aggregate status command when runtime orchestration needs that contract. Worker,
Compose, and observability checks are added only with their owning slices.

`pnpm dev:up` and `pnpm dev:down` are implemented for the same current scope.
Starting is non-destructive when local data already exists. Stopping uses the
Supabase CLI's default backup-preserving behavior; destructive `--no-backup`
cleanup remains an explicit direct operation rather than part of the aggregate
lifecycle.

`pnpm dev:bootstrap` validates the supported Node.js range, exact pnpm version,
and an available Docker engine before running a frozen-lockfile install and
`dev:up`. The current Angular client uses committed public local configuration,
so bootstrap does not manufacture an unused `.env.local`. The server has safe
local defaults and reads its documented `OMOIKANE_` variables directly from the
process environment. Creation of an environment file belongs to the first
runtime slice that needs secrets or developer-specific configuration.

Bootstrap also reconciles the repository's former local Supabase identity. If
Docker still contains containers whose exact project suffix is `chat-hub-99`,
it stops that legacy stack with Supabase's backup-preserving behavior before
starting `omoikane-local`. It does not stop arbitrary containers or processes
that occupy a configured port; those conflicts require an explicit developer
decision.

## 8. Database workflow

1. Implement database changes as versioned migrations under
   `supabase/migrations`.
2. Keep seed data deterministic and provide documented test users, profiles,
   workspaces, channels, and messages.
3. Cover command functions, RLS policies, triggers, and projections with pgTAP
   tests.
4. Make `pnpm db:verify` reset the database, lint it, and run tests from a clean
   state when that aggregate command is introduced.
5. Check generated database types into the repository only when project policy
   requires it; a check command must prove that they match the schema.
6. Enable the `vector` extension by migration before creating embedding tables.

The current local seed satisfies the deterministic-data contract with stable
Auth user IDs and pgTAP assertions over the resulting profiles, workspace,
memberships, channels, and message authorship. Generated aggregate IDs and
timestamps are deliberately excluded from the fixture contract. See
[`supabase/README.md`](../../supabase/README.md#local-development-users) for the
local identities and scenario.

Individual database commands remain valid building blocks:

```text
pnpm db:migration:new <name>
pnpm db:reset
pnpm db:verify
pnpm db:types
pnpm db:types:check
```

## 9. Observability and local AI target

- Runtimes emit OpenTelemetry traces and metrics with consistent resource
  attributes and correlation IDs once their observability phase is implemented.
- Grafana is the local dashboard entry point. Tempo stores traces, Loki stores
  logs, and Prometheus stores metrics.
- Ollama starts only for local AI development. Hosted-provider adapters remain
  disabled when their keys are absent.
- AI jobs record provider, model, prompt version, token or compute usage,
  latency, and result status as Analysis Run metadata.

The Phase 3 server profile now implements the trace and metric portion of this
target. Run `pnpm dev:observability`, set
`OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` in the server process, and
open Grafana on port 3000. The default Prometheus host port is 9090; set
`OMOIKANE_PROMETHEUS_PORT` before startup when that port is occupied. Server
logs remain structured JSON on stdout, so Loki stays deferred until a log
transport is implemented and consumed.

The local AI profile is deliberately separate from `pnpm dev:up` and the
default verification suite because its pinned container and model are optional
resources. Run `pnpm dev:ai-local`, then configure the worker with
`OMOIKANE_OLLAMA_BASE_URL=http://127.0.0.1:11434` and
`OMOIKANE_DECISION_FORENSICS_MODEL=qwen3:4b-instruct`. The startup command waits
for Ollama and provisions that model; `OMOIKANE_OLLAMA_MODEL` may select another
model for provisioning, but it must match the worker model configuration.

## 10. Staged verification

### Phase 1 exit gate

The GitHub Actions workflow exercises `pnpm dev:bootstrap` from a clean
checkout, verifies the running stack with `pnpm dev:status`, and then runs
`pnpm verify`, `pnpm db:verify`, and the authenticated Chromium smoke path. It
uses the same commands as local development and requires no hosted Supabase
credentials. Failed browser runs retain Playwright traces and screenshots.
Deployment, image publication, and checks for future runtimes remain outside
this workflow.

- A contributor can clone the repository, run the documented bootstrap
  sequence, and open the existing Angular application without editing source.
- The client authenticates against local Supabase and executes the collaboration
  capabilities implemented at that point.
- The current database, lint, test, typecheck, and build commands pass from the
  reference environment and in CI.
- Supabase and any Phase 1 Compose services report useful status.

### Deferred runtime gates

- **Phase 3:** server readiness verifies the dependencies required by active
  routes, and a client request produces a server trace, following
  [OMO-ARC-003](../architecture/modular-server-architecture.md).
- **Phase 4:** the worker acquires and completes a deterministic test job, and
  server-to-worker trace correlation is visible.
- **Observability increment:** Collector, Grafana, Tempo, and Prometheus are
  implemented for server traces and metrics. Loki remains gated by a future
  log-transport increment.

This staging removes the circular requirement to verify runtimes before they
exist while preserving the final target environment.

### Troubleshooting

| Symptom                                                   | Resolution                                                                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Supabase containers fail with entrypoint or format errors | Confirm Docker uses Linux containers, clone in WSL, preserve LF line endings, remove the affected image, and restart. |
| Ports are occupied                                        | Use the available status command. Stop conflicting processes rather than silently changing team defaults.             |
| Studio starts but the schema is missing                   | Run the database reset command and inspect migration output before starting the client.                               |
| Server cannot connect through a pooler                    | Use the direct local PostgreSQL connection. Test pooler-specific behavior in hosted environments.                     |
| Ollama consumes excessive resources                       | Stop the local-AI profile. Keep hosted-provider tests opt-in and mocked in the default test suite.                    |

## 11. Official references

- [Supabase CLI getting started](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase testing and linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Supabase pgvector](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Angular version compatibility](https://angular.dev/reference/versions)
- [Nx and Angular compatibility](https://nx.dev/docs/technologies/angular/guides/angular-nx-version-matrix)
