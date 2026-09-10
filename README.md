# Omoikane

Omoikane is Izanagi's **Collaborative Intelligence Platform**. It combines
workspace collaboration with evidence-backed, human-reviewed intelligence
workflows. Channels and messaging are its first collaboration capability;
Decision Forensics is its first AI-assisted capability.

The repository is an Nx workspace built with Angular, NgRx Signal Store,
Effect, Supabase, NestJS, Fastify, and a separate AI worker. The approved
product and architecture direction is indexed in the
[Omoikane documentation](docs/README.md).

## Architecture

Dependencies point toward policy:

```text
Angular presentation
        ↓
Application use cases and ports
        ↓
Domain model

Infrastructure ──implements──> Application ports
Shared database types ───────> Infrastructure only
```

- Domain libraries own validated business values and invariants.
- Application libraries coordinate Effect workflows and declare ports.
- Infrastructure libraries implement those ports with Supabase.
- Angular services form the browser Effect execution boundary; feature-local
  Signal Stores own presentation state.
- NestJS and the AI worker host trusted and asynchronous workflows without
  proxying ordinary RLS-protected collaboration operations.

The integrated boundaries are documented in the
[Collaboration Architecture](docs/architecture/collaboration-architecture.md),
[Angular Client Architecture](docs/architecture/angular-client-architecture.md),
[Modular Server Architecture](docs/architecture/modular-server-architecture.md),
[Analysis Run Processing Contracts](docs/architecture/analysis-run-processing-contracts.md),
and [Decision Forensics Contracts](docs/architecture/decision-forensics-contracts.md).

## Workspace

```text
apps/client/                   Angular browser application
apps/client-e2e/               Playwright browser contracts
apps/server/                   Trusted NestJS and Effect HTTP boundary
apps/ai-worker/                Durable Analysis Run worker
libs/domain/                   Framework-independent business model
libs/application/              Use cases and ports
libs/infrastructure/           Supabase adapters
libs/shared/database/          Generated database types
supabase/                      Migrations, seed, configuration, and pgTAP tests
docs/                          Product, architecture, development, and operations
tools/                         Repository development and database tooling
```

Package READMEs describe local responsibilities, dependency rules, public APIs,
and focused verification commands.

## Getting started

The reference environment uses Node.js 24, pnpm 11.16.0, and Docker Desktop
with Linux containers. Exact version, WSL2, port, environment, and
troubleshooting guidance lives in the
[Local Development Environment](docs/development/local-development-environment.md).

Bootstrap a fresh clone and start the Angular client:

```bash
pnpm --version
pnpm dev:bootstrap
pnpm start
```

`dev:bootstrap` validates the toolchain, installs the locked dependency graph,
and starts local Supabase without resetting existing data. If pnpm is not yet
available, enable the repository-pinned version with Corepack first.

To reset the deterministic local database and run the client, server, and
worker together:

```bash
pnpm dev
```

This command destroys uncommitted local database data. Local identities and
the complete database workflow are documented in
[`supabase/README.md`](supabase/README.md).

## Verification

| Command           | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `pnpm check`      | Format, workspace synchronization, lint, and type contracts    |
| `pnpm verify`     | Fast checks, unit tests, and production builds                 |
| `pnpm db:verify`  | Clean reset, SQL lint, pgTAP, and generated database types     |
| `pnpm e2e:verify` | Reset the local platform and run Chromium browser contracts    |
| `pnpm verify:all` | Complete source, database, server integration, and browser run |

Run `pnpm verify` before committing. Use `pnpm verify:all` before a major pull
request when the required local services are available. The same contracts run
in [GitHub Actions](.github/workflows/ci.yml).

Operational commands for Supabase, observability, Ollama, the server, and the
worker are catalogued in the
[Local Development Environment](docs/development/local-development-environment.md#7-target-startup-scripts).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) defines the contributor workflow, Angular
presentation conventions, dependency rules, and review expectations. New work
is delivered as small vertical slices; abstractions are introduced only when
implemented code demonstrates the need.

The [Code Quality and Documentation Benchmark](docs/architecture/code-quality-benchmark.md)
is the review standard for responsibility placement, runtime validation,
Effect contracts, testing, and package documentation.
