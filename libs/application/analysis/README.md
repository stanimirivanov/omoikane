# Analysis Application

Orchestrates the first deterministic Analysis Run workflow. It validates the
authenticated request identity, workspace and channel IDs, bounded UTC source
interval, run ID, dispatcher identity, and safe W3C processing trace carrier before invoking the capability-oriented
`AnalysisRunRepository` Effect service.

```text
HTTP boundary -> start/get use case ------> AnalysisRunRepository Tag
dispatcher    -> claim/dispatch use case -> infrastructure RPC
worker        -> load sources/process ----> deterministic result receipt
                                         -> validated AnalysisRun or job
```

The application library has no NestJS, Supabase, HTTP, browser, OpenTelemetry,
or generated database dependencies. The trace carrier is runtime correlation
metadata for the asynchronous boundary, not domain state. Operational job,
execution, receipt, and opaque-claim values are application contracts; lease
ownership and transactional idempotency remain PostgreSQL responsibilities.
Processor failures cross this boundary only as bounded retryable or terminal
categories; unexpected defects are classified by the worker runtime. The
deterministic processor consumes at most 100 immutable
message/revision/author identities from the run's authorized channel and
produces a versioned proposed inventory finding without reading content or
calling a model. Source selection
returns one runtime-validated, retry-stable snapshot with its persisted
truncation state. The snapshot uses the run's immutable inclusive-start,
exclusive-end interval; the start use case rejects invalid, longer-than-31-day,
and future-ending requests. Polling, worker lifecycle, hosted model execution,
review workflows, and streaming remain outside this package.

Verify with `pnpm exec nx run-many -t lint typecheck typecheck:test test -p analysis-application`.

## Decision extraction contract

`extractDecisions` accepts ordered snapshot identities enriched with immutable
message content at the trusted worker boundary. It validates the input, requests
`DecisionExtractorTag`, and checks decoded output against the exact source set.
The Tag is the typed Effect dependency; a Layer supplies a model adapter or the
local deterministic conformance adapter. This use case is not yet wired into
the inventory worker or database completion command.

`decision-extraction.ts` owns the port, bounded schemas, and safe failure
categories; `extract-decisions.ts` owns orchestration and the immutable prompt.
Candidate meaning and evidence requirements live in the analysis domain.
Messages are serialized as a separate JSON data payload. The instruction digest
is SHA-256 over the exact UTF-8 instruction string without a trailing newline,
verified by conformance tests using Node only in the test runtime.
`DECISION_EXTRACTION_OUTPUT_JSON_SCHEMA` is generated from the authoritative
Effect output schema for adapters that support constrained generation. The
Effect decoder remains authoritative because provider-side JSON Schema cannot
enforce evidence membership, authored-participant, or all refinement rules.

Version 1 limits input to 100 sources, 10,000 UTF-16 code units per message,
and 100,000 total; output has at most 20 candidates, each with at most 20 claims,
20 assumptions, and 100 participant assertions. These are conservative policy
bounds, not token estimates. Generation uses temperature zero, an 8,192-token
output ceiling, no tools, and no repair attempts. A participant must author at
least one cited source; this intentionally excludes inferred silent participants.
Empty candidate collections are valid. Schema errors are translated without
retaining raw content or provider output in error payloads.

The worker-facing `prepareAnalysisJobExtraction` use case now loads content
through `AnalysisRunRepository.loadJobExtractionInput`. It returns validated
`DecisionExtractionInput` under the current lease, rechecking requester access.
Empty snapshots remain valid inputs. Invalid/missing content and contract-limit
violations produce `InvalidAnalysisRunDataError`; access denial and stale leases
retain their existing typed failures. Future worker integration must
pin the provider, model, prompt, schema, evaluation, and generation policy
in the execution manifest before invoking a model. No fallback model is implied
by this contract. Invalid output is terminal under the current no-repair policy.

`pinAnalysisJobExecutionManifest` now performs that pinning through the existing
repository port. It builds the supported v1 artifact configuration, requires a
matching leased processor version, then requests atomic create-or-observe.
The database's stored configuration is authoritative. This single-adapter
deployment accepts it only when the configured provider/model and every
artifact/policy field match; otherwise it returns
`UnsupportedDecisionExtractionConfigurationError`. It never overwrites an old
manifest or silently selects another model. Version labels are decoded as
bounded metadata so unsupported historical artifacts can be rejected explicitly.

The manifest contains neither content nor prompt text nor credentials.
Model invocation and completion are still separate; configuring a provider in
the future must connect content preparation, manifest pinning, and extraction
before persistence. The inventory worker does not pin Decision Forensics
manifests. Source code retains the exact prompt artifact named by the manifest.

`AnalysisProcessorReceiptSchema` is now a discriminated union. The existing
workspace inventory variant remains unchanged; the Decision Forensics variant
contains validated candidates, the exact frozen source set, manifest-linked
artifact metadata, provider-reported nullable usage, and a bounded aggregate
summary. It is a persistence command value, not the authorized read projection.
The database independently matches it to the lease, snapshot, and immutable
manifest.

Content preparation is separate from `extractDecisions` so manifest pinning can
occur before a model call. The existing inventory processor continues to request
identities only; it does not load content it does not consume. When the model
processor is wired, invalid snapshot data must be terminal, unavailable storage
retryable, and lost leases must stop the attempt.
