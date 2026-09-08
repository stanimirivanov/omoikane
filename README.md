# Omoikane

Omoikane is Izanagi's **Collaborative Intelligence Platform**. Channels and
messaging are its first collaboration capability; the longer-term product
direction combines collaboration, organizational knowledge, and auditable
intelligence workflows.

This repository also demonstrates how Angular, Effect, NgRx Signal Store, and
Supabase can support strict domain boundaries without becoming unnecessary
framework layers. The approved product and architecture direction is indexed in
the [Omoikane documentation](docs/README.md).

## Technology

- Angular 22 for the browser application and dependency-injection boundary
- Angular Material and Lucide as the approved presentation foundation; package
  installation begins with UI-1
- NgRx Signal Store for feature-local presentation state
- Effect for typed application workflows, dependency injection, and failures
- Supabase for authentication, PostgreSQL, row-level security, realtime, and
  storage
- NestJS with Fastify for the trusted server HTTP and composition boundary
- OpenTelemetry, Tempo, Prometheus, and Grafana for optional local server
  observability
- Nx for project boundaries, task orchestration, and dependency visualization
- Vitest for TypeScript unit tests and pgTAP for database tests

## Architectural direction

The codebase follows a layered dependency rule:

```text
Angular presentation
        ↓
Application use cases and ports
        ↓
Domain model

Infrastructure ──implements──> Application ports
Shared database types ───────> Infrastructure only
```

Dependencies point toward policy:

- **Domain** defines validated business values and entities. It has no Angular,
  Supabase, or database dependency.
- **Application** coordinates use cases and declares ports such as
  `MessageRepository`. It depends on the domain, not on Supabase.
- **Infrastructure** implements application ports with Supabase and maps
  database data into domain values.
- **Presentation** adapts Angular events to application calls and stores UI
  state in feature-local Signal Stores.
- **Shared database** contains generated Supabase types and database-specific
  aliases. It is not a domain model.

The project is developed as small vertical slices. New abstractions are
introduced only after concrete duplication or coupling appears in implemented
features.

The presentation-only modernization track is specified in the
[UI/UX Redesign Plan](docs/product/ui-ux-redesign-plan.md). It applies a dense,
Omoikane-specific collaboration workspace without changing the architecture or
adding product behavior.

## Repository layout

```text
apps/client/                    Angular application and presentation features
apps/server/                    NestJS, Fastify, OpenAPI, and Effect runtime boundary
apps/ai-worker/                 Asynchronous Analysis dispatch and execution runtime
libs/domain/channel/            Channel identity, navigation projection, and invariants
libs/domain/analysis/           Analysis Run identity and accepted-state invariants
libs/domain/message/            Message projections, revisions, and invariants
libs/domain/profile/            Profile identity, current projection, and invariants
libs/domain/workspace/          Workspace, membership, and invitation invariants
libs/application/authentication/ Provider-independent authentication workflows
libs/application/analysis/      Workspace-authorized Analysis Run workflows and port
libs/application/channel/       Workspace-scoped channel lifecycle workflows
libs/application/message/       Message lifecycle, history queries, and repository port
libs/application/profile/       Current-profile discovery/update port and use cases
libs/application/workspace/     Workspace lifecycle, paginated membership, and invitation workflows
libs/infrastructure/authentication/ Supabase authentication adapter
libs/infrastructure/analysis/   Trusted Supabase Analysis Run adapter
libs/infrastructure/channel/    Supabase channel query, command, and realtime adapter
libs/infrastructure/message/    Supabase implementation of the message repository
libs/infrastructure/profile/    Supabase current-profile query and command adapter
libs/infrastructure/workspace/  Supabase workspace/member/invitation and access-realtime adapter
libs/shared/database/           Generated and derived database types
supabase/                       Migrations, seed data, configuration, and pgTAP tests
tools/database/                 Database type-generation tooling
```

Each library README documents its responsibilities, dependency rules, internal
package structure, and extension guidelines.

## Getting started

### Requirements

- Node.js 24.15.0 for the reference environment; supported installations must
  satisfy `>=24.15.0 <25`
- pnpm 11.16.0, as pinned by `packageManager` (Corepack is the recommended
  installer, but does not need to be re-enabled when this pnpm version already
  works)
- Docker Desktop using Linux containers for local Supabase

The `.node-version` file is the authoritative reference-runtime pin. The
`engines.node` range allows later Node 24 patch releases while rejecting older
or next-major runtimes during package installation.

### Bootstrap a fresh clone

```bash
pnpm --version
pnpm dev:bootstrap
```

The version command must print `11.16.0`. If `pnpm` is unavailable, run
`corepack enable` once and retry. A system-wide Windows Node installation may
require an elevated PowerShell session to create Corepack shims. If pnpm already
prints the pinned version, skip `corepack enable`; running it through pnpm does
not avoid Windows permissions on the Node installation directory.

The bootstrap command validates Node.js, pnpm, and the Docker engine before
installing the exact dependency graph from `pnpm-lock.yaml` and starting the
local Supabase stack. It is safe to run again: dependency installation remains
lockfile-controlled and existing local Supabase data is preserved. When an
updated clone still has containers from the former `chat-hub-99` Supabase
project identity, bootstrap stops that exact legacy stack before starting
`omoikane-local`. Its Docker volumes are preserved. Bootstrap never stops an
unrelated process that happens to use a configured port; the Supabase error
identifies that conflict for the developer to resolve explicitly.

The Angular client currently keeps its public local Supabase configuration in
the committed development environment. Bootstrap therefore does not create an
unused `.env.local`; that file will be introduced when an implemented runtime
first requires developer-specific configuration.

### Check the local platform

```bash
pnpm dev:status
```

This read-only command verifies Node.js, pnpm, the Docker engine, and the local
Supabase stack. It exits unsuccessfully when a required service is unavailable
and does not print Supabase's credential-bearing status output.

### Run the client

```bash
pnpm start
```

## Development Workflow

The workspace provides four levels of verification.

### Fast checks

```bash
pnpm check
```

Runs:

- formatting verification
- Nx workspace synchronization verification
- lint
- type checking
- type contract checks

Use this while actively developing.

### Full source verification

```bash
pnpm verify
```

Runs:

- `pnpm check`
- unit tests
- production builds

Run this before committing.

### Database verification

```bash
pnpm db:verify
```

Runs:

- database reset
- migration validation
- pgTAP tests
- generated database type verification

Run this whenever migrations or generated database types change.

Database setup, migrations, seed data, pgTAP tests, and local Supabase
troubleshooting are documented in [`supabase/README.md`](supabase/README.md).

### Authenticated browser smoke verification

Install Chromium once and run the smoke path against a newly reset local
platform:

```bash
pnpm e2e:verify
```

The command starts local Supabase if needed, resets it to the deterministic
seed, installs the Playwright Chromium binary, launches the Angular development
server, signs in as the seeded owner, opens the seeded workspace and channel,
creates a message, and signs out. The reset is destructive to local database
changes.

After the platform and browser are already prepared, rerun only the browser test
with `pnpm e2e`.

### Complete verification

```bash
pnpm verify:all
```

Runs source verification, clean-database verification, and the authenticated
Chromium smoke path. Local Supabase must already be running.

This is the recommended command before opening a pull request or merging a major
refactoring.

### Observe the trusted server locally

The optional observability profile is independent of Supabase readiness:

```bash
pnpm dev:observability
```

Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` for the server process,
then open Grafana at `http://localhost:3000`. See
[`apps/server/README.md`](apps/server/README.md#local-observability) for
PowerShell, port-conflict, status, and shutdown instructions.

### Run local Decision Forensics

Start Ollama and provision the documented local model only when working on the
AI slice:

```bash
pnpm dev:ai-local
pnpm dev:ai-local:status
```

Copy the Ollama URL and Decision Forensics model values from `.env.example`
into the worker environment, then run `pnpm worker:dev`. Without both values the
worker deliberately retains the deterministic inventory processor. Stop the
optional profile with `pnpm dev:ai-local:down`; its model volume is preserved.
See [`apps/ai-worker/README.md`](apps/ai-worker/README.md) for the execution and
security boundaries.

### Continuous integration

GitHub Actions runs the same `pnpm verify`, `pnpm db:verify`, and `pnpm e2e`
contracts for pull requests, pushes to `main`, and manual workflow dispatches.
The workflow exercises `pnpm dev:bootstrap` from a clean checkout, asserts the
resulting platform with `pnpm dev:status`, installs Chromium with its Linux
dependencies, and never connects to or mutates a hosted Supabase project.
Playwright traces and screenshots are retained for failed browser runs.

The workflow is defined in [
`.github/workflows/ci.yml`](.github/workflows/ci.yml).

Checks are intentionally ordered from cheapest to most expensive:

1. format
2. workspace synchronization
3. lint
4. type checking
5. unit tests
6. production build
7. authenticated browser smoke test

This allows failures to be detected as early as possible.

## Local Supabase workflow

Start, safely inspect, and stop the currently implemented local infrastructure:

```bash
pnpm dev:up
pnpm dev:status
pnpm dev:down
```

The current lifecycle owns only the local Supabase stack. `dev:up` preserves an
existing local database, and `dev:down` stops the containers without deleting
their data volumes. Use `pnpm db:reset` only when a destructive rebuild from
migrations and seed data is intended.

The lower-level `pnpm supabase:*` commands remain available for direct Supabase
operations. Unlike the safe aggregate status command, `pnpm supabase:status`
prints local API keys and should not be copied into logs or issues.

Create a migration and rebuild the database:

```bash
pnpm db:migration:new <migration-name>
pnpm db:reset
```

Regenerate checked-in TypeScript database types:

```bash
pnpm db:types
```

Run the complete database verification pipeline:

```bash
pnpm db:verify
```

`db:verify` resets the database, lints SQL, runs pgTAP tests, regenerates
database types, and checks that generated types are committed.

Database schema changes must be represented by files in `supabase/migrations`.
Avoid manual schema changes that cannot be reproduced from a clean reset.

## Local development data

Prepare a clean local database and start the Angular application and server:

```bash
pnpm dev
```

This command starts Supabase, resets the local database, applies all migrations,
loads supabase/seed.sql, and starts Angular, the NestJS server, and the AI
worker.

The reset is destructive to local database data.

The server can also run independently:

```bash
pnpm server:dev
```

Its runtime exposes dependency-free liveness at
`http://localhost:3333/health/live`, readiness at
`http://localhost:3333/health/ready`, and OpenAPI JSON at
`http://localhost:3333/openapi.json`. Its first trusted capability accepts and
observes workspace-authorized Analysis Runs through Supabase, including
validated inventory and proposed Decision Forensics result projections, without
moving existing collaboration operations behind the server. See
[`apps/server/README.md`](apps/server/README.md) for its boundary and commands.

Seeded users

| Role               | Email                     | Password       |
| :----------------- | :------------------------ | :------------- |
| Workspace owner    | `owner@omoikane.local`    | `Password123!` |
| Workspace member   | `member@omoikane.local`   | `Password123!` |
| Workspace outsider | `outsider@omoikane.local` | `Password123!` |

The owner and member belong to the seeded `Omoikane Development` workspace. It
contains the `General` and `Engineering` channels and five representative
messages. The outsider has an active profile but no workspace membership. The
complete fixture contract, including stable local user IDs, is documented in
[`supabase/README.md`](supabase/README.md#local-development-users).

These credentials are explicitly local development credentials. Do not place
equivalent fixed passwords in production seed or migration files.

The local-only Auth insertion trade-off and its regression requirements are
documented with the seed in
[`supabase/README.md`](supabase/README.md#auth-seed-requirements).

## Documentation standard

Public types, use cases, ports, adapters, and non-obvious algorithms should have
TSDoc that explains intent and architectural role—not merely restates syntax.
README files explain package boundaries and extension rules. Generated files are
excluded from this requirement.

## Quality benchmark

Future slices should follow [
`docs/architecture/code-quality-benchmark.md`](docs/architecture/code-quality-benchmark.md),
which defines responsibility placement, package-boundary criteria, TSDoc/README
standards, and the review checklist.
