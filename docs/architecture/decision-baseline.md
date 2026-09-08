# Decision Baseline and Documentation Map

> **Document ID:** OMO-ARC-000  
> **Version:** 1.0  
> **Status:** Approved baseline  
> **Date:** 2 August 2026  
> **Product:** Omoikane - The Collaborative Intelligence Platform

## 1. Purpose and authority

This document consolidates the product, architecture, development, and
deployment decisions already taken for Omoikane. It is the starting point for
implementation and is not an options paper. Future changes are made explicitly
through Architecture Decision Records and then propagated into the affected
documents.

**Decision status:** The company name is Izanagi. The product name is Omoikane.
Omoikane is implemented as a collaborative intelligence platform and evolves
through a modular monolith, asynchronous workers, PostgreSQL with pgvector, and
multiple deployment profiles.

## 2. Canonical decisions

| ID    | Area                 | Decision                                                                                                                                                                                          |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-001 | Brand                | Izanagi is the company and publisher. Omoikane is the flagship product.                                                                                                                           |
| D-002 | Positioning          | Omoikane is a Collaborative Intelligence Platform. Chat is the first collaboration capability, not the product category.                                                                          |
| D-003 | Architecture         | The application server is a modular monolith. Microservices are not part of the baseline.                                                                                                         |
| D-004 | Operational backend  | Supabase remains responsible for authentication, PostgreSQL, Row Level Security, Storage, and Realtime.                                                                                           |
| D-005 | Client access        | The Angular client continues to access Supabase directly for simple RLS-protected operational capabilities.                                                                                       |
| D-006 | Server boundary      | NestJS hosts trusted application APIs, AI orchestration, streaming responses, and privileged workflows. Effect implements application services, typed errors, and dependency composition.         |
| D-007 | Async execution      | A separate AI worker runtime executes durable, retryable, and idempotent jobs.                                                                                                                    |
| D-008 | Data                 | PostgreSQL is the system of record. pgvector provides embeddings and semantic retrieval. PostgreSQL full-text search and `pg_trgm` provide hybrid retrieval.                                      |
| D-009 | Reliable integration | The transactional outbox and a PostgreSQL-backed durable job queue are implemented before external brokers.                                                                                       |
| D-010 | AI outputs           | Every AI execution creates an immutable Analysis Run. AI findings remain proposed facts until confirmed or rejected.                                                                              |
| D-011 | Local development    | The reference workstation uses Windows 11, WSL2, Docker Desktop, VS Code Remote WSL, pnpm, and the Supabase CLI.                                                                                  |
| D-012 | Deployment           | Docker Compose is the local baseline. Cloud Run is the public portfolio profile. Kubernetes is the cloud-native reference profile. Istio Ambient belongs only to the advanced Kubernetes profile. |
| D-013 | Delivery             | Work proceeds in small vertical slices with one focused pull request per step and updated tests and documentation in the same change.                                                             |

## 3. Documentation set

| Document ID | Document                                                                                    | Role                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OMO-ARC-000 | This decision baseline                                                                      | Defines canonical decisions, document authority, and implementation order.                                                                                             |
| OMO-BRD-001 | [Rebranding Implementation Plan](../product/rebranding-implementation-plan.md)              | Records the completed Omoikane migration without mixing unrelated domain refactors.                                                                                    |
| OMO-DEV-001 | [Local Development Environment](../development/local-development-environment.md)            | Defines the reproducible workstation, runtime topology, scripts, environment policy, and verification steps.                                                           |
| OMO-OPS-001 | [Deployment and Environment Strategy](../operations/deployment-and-environment-strategy.md) | Defines local, public cloud, Kubernetes, and service-mesh deployment profiles.                                                                                         |
| OMO-RMP-001 | [Product and Architecture Roadmap](../product/product-and-architecture-roadmap.md)          | Defines the sequence of product, architecture, AI, and platform milestones.                                                                                            |
| OMO-SAD-001 | Software Architecture Document                                                              | Planned. It will become the broad architecture reference and be updated as vertical slices become implemented reality. No approved source was included in this import. |
| ADR series  | [Architecture Decision Records](adr/README.md)                                              | Record later changes that supersede a baseline decision.                                                                                                               |
| OMO-ARC-003 | [Modular Server Architecture](modular-server-architecture.md)                               | Defines the approved Phase 3 server boundary and ordered implementation slices.                                                                                        |
| OMO-ARC-004 | [Analysis Run Processing Contracts](analysis-run-processing-contracts.md)                   | Defines the approved Phase 4 lifecycle, outbox, durable-job, worker, retry, and idempotency contracts.                                                                 |
| OMO-ARC-005 | [Decision Forensics Contracts](decision-forensics-contracts.md)                             | Defines the approved Phase 5 source snapshot, extraction, evidence, versioning, governance, evaluation, and human-review contracts.                                    |

## 4. Governance and precedence

1. An accepted ADR has the highest authority for the decision it covers.
2. This decision baseline governs where no later ADR exists.
3. Implementation plans define execution details and acceptance criteria.
4. The SAD describes the integrated architecture and is revised after
   implementation; it is not used to preserve obsolete alternatives.
5. Repository code, tests, database migrations, deployment manifests, and
   documentation must describe the same architecture.

The target documentation structure grows only as an implemented capability
needs it:

```text
docs/
  architecture/
    sad/
    adr/
    c4/
    security/
    data/
    ai/
  product/
    vision/
    roadmap/
    terminology/
  development/
    local-environment/
    testing/
    contribution/
  operations/
    deployment/
    runbooks/
    observability/
```

Empty directories are not created in advance. A directory is introduced with
the first document it owns.

## 5. Immediate execution order

1. Preserve the completed Omoikane identity and prevent legacy branding from
   returning to active product surfaces.
2. Create the documented local development platform and verify that a clean
   clone starts with the approved commands.
3. Stabilize the collaboration MVP and its architectural boundaries.
4. Implement OMO-ARC-003 in order: server runtime and liveness, authenticated
   boundary, then the deterministic Analysis Run vertical slice.
5. Introduce the AI worker, Analysis Run model, transactional outbox, and
   PostgreSQL-backed durable jobs.
6. Deliver Decision Forensics as the first server-backed AI vertical slice.
7. Proceed through Requirement Drift, Conversational BI, and Stakeholder
   Intelligence.
8. Add Cloud Run, Kubernetes, and Istio Ambient profiles only at their defined
   roadmap gates.

## 6. References

- [Supabase CLI local development](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase pgvector](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Angular version compatibility](https://angular.dev/reference/versions)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
