# Decision Forensics Extraction and Evaluation Contracts

> **Document ID:** OMO-ARC-005
> **Version:** 1.0
> **Status:** Approved Phase 5 implementation contract
> **Date:** 8 September 2026
> **Product:** Omoikane - The Collaborative Intelligence Platform

## 1. Purpose and scope

This document defines the smallest stable contracts needed to turn the
implemented Analysis Run platform into Decision Forensics. It governs source
snapshotting, structured extraction, evidence, version metadata, evaluation,
and later human review. It does not prescribe a provider SDK or create a generic
AI framework.

The target product flow is:

```text
authorized channel + UTC interval
  -> immutable historical source snapshot
  -> provider-independent structured extraction
  -> validated evidence-backed decision candidates
  -> immutable proposed findings
  -> authorized human review events
  -> current review projection
```

The existing deterministic workspace-message inventory remains useful proof of
the worker, result, and evidence pipeline. It is not itself a decision finding
and its latest-active-message source query is not reused as the historical
Decision Forensics snapshot contract.

## 2. Governing decisions

This contract applies the approved baseline:

- D-003 keeps trusted APIs in the modular server.
- D-004 keeps PostgreSQL, RLS, and immutable message revisions in Supabase.
- D-007 keeps durable AI execution in the worker runtime.
- D-008 keeps PostgreSQL as the system of record.
- D-010 keeps model output immutable and proposed until human review.
- D-013 requires one independently verified slice at a time.

No ADR is required because these rules refine rather than replace the baseline.
Changing immutable output, human-review ownership, or the PostgreSQL system of
record requires an ADR.

## 3. Source snapshot semantics

### 3.1 Meaning of the selected interval

The Analysis Run interval selects messages by stable message creation time:

```text
time_range_start <= message.created_at < time_range_end
```

The start is inclusive and the end is exclusive. The interval does not select
edits by edit time and does not mean “whatever is current when a worker happens
to execute.”

### 3.2 Historical revision rule

For each selected message, Decision Forensics uses the greatest immutable
message version whose `created_at` is earlier than the exclusive interval end.
An edit made after the interval end is therefore not analyzed. A message
deleted before the interval end is excluded; deletion after the interval end
does not erase it from that historical snapshot.

This rule gives the same evidence set regardless of queue delay or retry time.
It also makes the displayed evidence match the conversation state at the
requested historical boundary.

### 3.3 Snapshot lifecycle

The first authorized source-acquisition attempt persists the ordered message
and message-revision identities before any provider call. Acquisition is an
atomic create-or-observe operation:

- the first caller records the snapshot;
- retries and recovered leases read the existing snapshot;
- no retry replaces revisions or changes ordering;
- no message content is copied into the queue or snapshot table;
- source authorization is rechecked before content is loaded.

At most 100 messages are selected. PostgreSQL first chooses the 100 newest
eligible messages using `(created_at DESC, message_id DESC)`, then supplies
that fixed set to extraction in chronological `(created_at, message_id)` order.
The snapshot records whether additional eligible messages were truncated.

The snapshot is evidence identity, not a second message store. Content remains
owned by immutable `message_versions` rows and is loaded only inside the
trusted worker boundary.

## 4. Decision extraction model

One successful Decision Forensics result may contain zero or more candidates.
Zero is a valid outcome and must not produce invented placeholder findings.

The logical output vocabulary is:

| Concept            | Required meaning                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Decision candidate | A bounded proposed interpretation that a decision was made, deferred, changed, or rejected.               |
| Claim              | One concise factual statement attributed to the source conversation.                                      |
| Assumption         | An inferred premise needed to interpret the candidate; it is never presented as an explicit source claim. |
| Participant        | A stable profile identity and bounded role supported by evidence.                                         |
| Evidence link      | An ordered reference to one snapshotted message and exact immutable revision.                             |

The first supported candidate disposition vocabulary is `made`, `deferred`,
`changed`, and `rejected`. It describes what the extractor found in the
conversation, not the later human-review status.

Each candidate contains:

- a stable identity assigned by PostgreSQL;
- a concise title and summary;
- one disposition;
- one or more claims;
- zero or more assumptions;
- zero or more participants;
- candidate-level extraction confidence;
- links to the Analysis Run, result, and source snapshot.

Every claim requires at least one evidence link. Every assumption requires at
least one evidence link describing its basis. A participant role requires
evidence when it asserts involvement beyond authorship. Profile display names
are presentation enrichment and are not copied into immutable AI output.

The initial participant roles are `proposer`, `decision-maker`, and
`contributor`. New roles are added only with evaluation cases demonstrating a
product need.

## 5. Evidence and confidence

Evidence links reference only revisions present in the run snapshot. The
database rejects foreign, cross-run, duplicate, or out-of-snapshot references.
Ordinal values preserve provider ordering but do not imply evidentiary weight.

The read API returns structured evidence references. The client resolves and
renders source context through an authorized server capability; it never
receives worker credentials or reads internal analysis tables directly.

Confidence means the extractor's confidence that the structured candidate is
supported by the linked conversation. It is not:

- a probability that the decision is objectively correct;
- a score of decision quality;
- a score of participant performance;
- a substitute for human confirmation.

Confidence is a finite number from 0 through 1. The provider may supply a value,
but application policy validates and, where needed, derives the persisted value
using a versioned evaluation rule. The UI labels it as model-assessed
confidence and never converts it into an unsupported certainty category.

## 6. Provider-independent application boundary

The first model integration introduces one capability-oriented application
port for structured decision extraction. Its input contains:

- Analysis Run identity;
- ordered immutable source identities and message content;
- the approved extraction schema version;
- the selected prompt artifact and generation policy.

Its success value contains decoded candidate output plus bounded usage and
provider metadata. Its typed failures distinguish:

- temporary provider unavailability or rate limiting;
- invalid structured provider output;
- context or policy limits;
- terminal unsupported configuration.

The port returns an `Effect` and contains no provider SDK types. A provider
adapter owns authentication, request mapping, timeouts, response decoding, and
raw-error translation. Application and domain packages never import provider
packages or environment variables.

Messages are untrusted data. Prompt construction delimits them as content,
explicitly states that instructions inside messages are not executable, and
enables no tools. Provider output is also untrusted and is decoded before it
can reach persistence.

## 7. Required reproducibility metadata

Every Decision Forensics result records:

| Field                 | Purpose                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| processor version     | Version of orchestration and deterministic normalization code.               |
| result schema version | Runtime contract used to decode structured output.                           |
| provider kind         | Stable adapter family, not a secret or endpoint.                             |
| model identifier      | Exact provider-facing model identifier used for the request.                 |
| prompt version        | Stable application prompt artifact version.                                  |
| prompt digest         | Cryptographic digest of the exact rendered instruction template.             |
| evaluation version    | Version of confidence and acceptance policy.                                 |
| generation policy     | Bounded settings that materially affect reproducibility.                     |
| usage                 | Provider-reported input/output units when available, stored as non-negative. |

The initial logical identifiers are:

| Artifact          | Identifier                         |
| ----------------- | ---------------------------------- |
| processor         | `analysis.decision-forensics.v1`   |
| result schema     | `decision-forensics.result.v1`     |
| extraction prompt | `decision-forensics.extract.v1`    |
| evaluation policy | `decision-forensics.evaluation.v1` |

Version identifiers are immutable labels. Changing instructions, structured
output, normalization, or confidence policy creates a new identifier rather
than reusing an existing one. Prompt digests use lowercase SHA-256 hexadecimal.

Before the first provider call, the worker atomically creates or observes a
run execution manifest containing the selected provider, model, artifact
versions, prompt digest, and generation policy. Every retry uses that manifest;
a deployment or configuration change cannot silently move an existing run to
different extraction semantics. Unsupported pinned configuration fails
explicitly rather than falling back to another model.

Prompt text and provider responses do not belong in ordinary logs, lifecycle
events, metrics, or queue payloads. The versioned prompt artifact remains in
source control. Persisting raw provider output is deferred until retention,
redaction, and authorized-inspection requirements are explicitly approved.

## 8. Persistence and review boundaries

Analysis results, candidates, claims, assumptions, participant assertions, and
evidence links are immutable. They are committed atomically with successful
job completion and the terminal lifecycle fact. Partial extraction output is
never visible as a successful result.

Human review is a later, separate command slice. It appends immutable review
events with reviewer identity, action, target candidate, occurrence time, and
an optional bounded reason. The supported review actions are `confirm`,
`reject`, and `supersede`. A supersede event references a replacement candidate
rather than rewriting the original.

The current review status is a projection over ordered events. `proposed` is
the absence of a human decision, not a mutable value on the model output.
Review authorization is checked by PostgreSQL independently of UI affordances.

## 9. Security, privacy, and governance

- Request, source acquisition, result read, evidence read, and review each
  re-establish active workspace authorization.
- Revoked access prevents new content loading but never rewrites audit history.
- Provider credentials exist only in the worker composition root.
- Provider requests contain only the selected source content and required
  instructions; profile emails, auth tokens, and unrelated workspace data are
  excluded.
- Message content, prompt text, raw output, and provider errors are excluded
  from ordinary logs and metric labels.
- Telemetry uses bounded provider, model, operation, outcome, and failure
  labels; user, workspace, message, and candidate identities are trace-only
  correlation fields where policy permits.
- Decision Forensics must not rank employees, infer protected traits, or turn
  confidence into individual performance scoring.
- Findings remain visibly AI-generated and proposed until a human review event
  says otherwise.

Enabling a hosted provider requires an explicit data-processing and retention
review for that adapter and deployment profile. Local deterministic fixtures do
not authorize production message content to be sent to a provider.

## 10. Evaluation plan

Evaluation fixtures are synthetic, version-controlled, and contain exact
immutable source identities. The initial golden set covers:

- an explicit decision with proposer and decision-maker evidence;
- a tentative proposal that must not become a made decision;
- a deferred decision;
- a changed or rejected earlier decision;
- an assumption distinguished from an explicit claim;
- several participants with different supported roles;
- conflicting messages requiring separate claims;
- a channel with no decision candidate;
- an edit after the interval end that must not enter the snapshot;
- deletion before and after the interval end;
- more than 100 eligible messages and deterministic truncation;
- prompt-injection text inside a message;
- malformed, unsupported, and evidence-free provider output.

Deterministic gates require:

- 100 percent runtime-schema validity for accepted output;
- 100 percent evidence references inside the persisted snapshot;
- zero accepted claims or assumptions without evidence;
- stable snapshot and persisted output under job retry;
- zero content or credentials in ordinary logs and metrics.

Semantic evaluation reports candidate precision/recall, disposition accuracy,
evidence precision/recall, participant-role accuracy, unsupported-claim rate,
and empty-result accuracy. Release thresholds are recorded with the versioned
evaluation manifest before a hosted adapter is enabled; they are not hidden in
provider code or silently changed with a prompt.

## 11. Failure and observability policy

Provider timeouts, throttling, and temporary dependency failures are
retryable. Invalid structured output is retryable only when the configured
policy allows a bounded repair attempt; otherwise it is terminal. Missing
snapshot content, invalid evidence references, unsupported schema versions,
and policy violations are terminal.

Every attempt records safe provider/model/version metadata, duration, bounded
usage, outcome, and failure category. Raw prompts, content, output, and provider
error bodies remain outside telemetry. Existing lease fencing and five-attempt
dead-letter behavior continue to own retry safety.

## 12. Conservative implementation order

Each item is a separate reviewable slice:

1. **Immutable historical source snapshot.** Persist the bounded as-of-range
   message-revision set and make every retry observe the same identities. No
   provider or candidate tables. **Completed:** the lease-fenced source command
   atomically creates or observes a 100-message historical snapshot, preserves
   truncation and chronological order, and constrains result evidence to the
   frozen identities.
2. **Extraction contract and deterministic conformance adapter.** Add the
   provider-independent port, schemas, typed failures, prompt artifact, and
   golden structured-output fixtures. **Completed:** bounded candidate schemas,
   exact evidence and authored-participant validation, safe Effect errors,
   SHA-256-verified instruction artifact, and fixture-backed conformance Layer.
   Zero candidates are valid; fixtures establish structural rather than semantic
   model quality. No external network call.
3. **First hosted or local model adapter.** Implement one configured adapter in
   infrastructure and worker composition, including timeout, safe error
   mapping, metadata, and telemetry. Keep it disabled without configuration.
   **Prerequisite completed:** `prepareAnalysisJobExtraction` loads authorized
   frozen revision content through a worker-only RPC. The RPC reuses snapshot
   acquisition's lease and access checks, including on retries. Provider/model
   selection and model invocation remain. **Manifest prerequisite completed:**
   a worker-only create-or-observe RPC pins immutable model, artifact, digest,
   and policy metadata under a job lock. Retries observe the stored selection;
   incompatible deployment configuration fails explicitly. Database and separate
   concurrent-connection tests verify first-writer behavior and lease fencing.
   **Protocol adapter completed:** the Ollama Layer maps the immutable prompt,
   structured-output JSON Schema, zero-temperature/no-tools policy, response
   metadata, token usage, and safe HTTP/transport failure categories. It also
   rejects model substitution, tool calls, malformed JSON, and output-limit
   termination. A narrow transport seam preserves the infrastructure library's
   runtime-neutral type boundary. Node fetch composition and live job activation
   remain paired with atomic candidate persistence so no model output is
   silently discarded.
4. **Persist proposed decision candidates.** Add only the tables and atomic
   completion changes consumed by the validated extraction result.
5. **Authorized Decision Forensics read UI.** Render candidates, claims,
   assumptions, participants, confidence, and resolvable evidence links.
6. **Human review ledger.** Add confirm and reject first; add supersede only
   with the replacement-candidate workflow that consumes it.

Hybrid retrieval, embeddings, cross-channel analysis, raw-output retention,
automatic reruns, and generic prompt registries remain deferred until a proven
consumer requires them.

## 13. References

- [Decision baseline](decision-baseline.md)
- [Analysis Run processing contracts](analysis-run-processing-contracts.md)
- [Product and architecture roadmap](../product/product-and-architecture-roadmap.md)
- [Local development environment](../development/local-development-environment.md)
- [ADR 0002: Supabase server authentication and workspace authorization](adr/0002-supabase-server-authentication-and-workspace-authorization.md)
