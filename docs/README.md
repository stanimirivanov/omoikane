# Omoikane documentation

This directory contains the version-controlled product, architecture,
development, and operations documentation for Omoikane, an Izanagi product.
Omoikane is positioned as a **Collaborative Intelligence Platform**; channels
and messaging are its first collaboration capability, not its product category.

## Authority and precedence

Documentation is interpreted in this order:

1. An accepted Architecture Decision Record (ADR) has authority for the
   decision it covers.
2. The [decision baseline](architecture/decision-baseline.md) governs where no
   later ADR exists.
3. Approved implementation plans define execution details and acceptance
   criteria.
4. Architecture descriptions explain the integrated system as it exists after
   implementation.
5. Code, tests, migrations, deployment manifests, and documentation must agree.

When implementation and documentation disagree, do not silently preserve the
discrepancy. Correct factual drift in the same pull request or record a decision
change through an ADR.

## Approved baseline set

| ID          | Document                                                                                 | Purpose                                                           |
| ----------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| OMO-ARC-000 | [Decision Baseline and Documentation Map](architecture/decision-baseline.md)             | Canonical decisions, authority, and execution order               |
| OMO-BRD-001 | [Rebranding Implementation Plan](product/rebranding-implementation-plan.md)              | Controlled migration to the approved Omoikane identity            |
| OMO-DEV-001 | [Local Development Environment](development/local-development-environment.md)            | Target workstation, runtime topology, scripts, and verification   |
| OMO-OPS-001 | [Deployment and Environment Strategy](operations/deployment-and-environment-strategy.md) | Local, Cloud Run, Kubernetes, and service-mesh profiles           |
| OMO-RMP-001 | [Product and Architecture Roadmap](product/product-and-architecture-roadmap.md)          | Ordered product and architecture phases                           |
| OMO-SAD-001 | Software Architecture Document                                                           | Planned; no approved source was supplied for this baseline import |
| ADR series  | [Architecture Decision Records](architecture/adr/README.md)                              | Later decisions that amend or supersede the baseline              |

## Architecture descriptions and implementation contracts

| ID          | Document                                                                               | Purpose                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| OMO-ARC-001 | [Collaboration Architecture](architecture/collaboration-architecture.md)               | Audited capability, boundary, state, authorization, and realtime architecture for the implemented collaboration baseline |
| OMO-ARC-002 | [Collaboration Phase 2 Exit Audit](architecture/collaboration-phase-2-exit-audit.md)   | Phase 2 exit evidence, including the authenticated browser-to-Supabase smoke boundary                                    |
| OMO-ARC-003 | [Modular Server Architecture](architecture/modular-server-architecture.md)             | Approved Phase 3 runtime, module, API, security, health, telemetry, and implementation boundaries                        |
| OMO-ARC-004 | [Analysis Run Processing Contracts](architecture/analysis-run-processing-contracts.md) | Approved Phase 4 lifecycle, outbox, durable-job, worker, retry, idempotency, security, and telemetry contracts           |
| OMO-ARC-005 | [Decision Forensics Contracts](architecture/decision-forensics-contracts.md)           | Approved Phase 5 source snapshot, extraction, evidence, versioning, governance, evaluation, and review contracts         |
| OMO-ARC-006 | [Angular Client Architecture](architecture/angular-client-architecture.md)             | Implemented Angular boundary, presentation-state ownership, navigation, and feature architecture                         |
| OMO-UX-001  | [UI/UX Redesign Plan](product/ui-ux-redesign-plan.md)                                  | Completed presentation foundation, visual contract, migration slices, and review gates                                   |

## Accepted architecture decisions

| ADR                                                                                             | Purpose                                                                             |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [ADR 0001](architecture/adr/0001-nestjs-effect-runtime-boundary.md)                             | Defines the NestJS-to-Effect runtime and lifecycle boundary.                        |
| [ADR 0002](architecture/adr/0002-supabase-server-authentication-and-workspace-authorization.md) | Defines bearer identity validation, workspace authorization, and privileged access. |
| [ADR 0003](architecture/adr/0003-angular-material-and-lucide-presentation-foundation.md)        | Selects Angular Material and Lucide while retaining Omoikane-owned product layout.  |

## Repository reconciliation

The approved Word documents were imported as reviewable Markdown on
8 August 2026. The repository copy makes three factual clarifications:

- the current database model already uses `channels`, so no legacy `rooms`
  table is retained by the rebrand;
- server readiness and trace export were implemented in Phase 3; worker gates
  belong to Phase 4, while Redis remains deferred until a consuming capability
  needs it rather than being a Phase 1 prerequisite;
- presence, typing, search, and persisted realtime unread reconciliation were
  implemented as conservative Phase 2 vertical slices after the source
  documents were imported.

These clarifications align the approved direction with the repository without
changing application behavior.
