# Analysis Infrastructure

Implements the Analysis Run application repository with narrowly privileged
Supabase RPCs. PostgreSQL atomically checks active workspace membership, the
selected active channel, and the bounded historical UTC interval, then creates the
immutable run or reads its current lifecycle/result projection. A
separate lease-fenced pair of commands claims a requested outbox event and
idempotently dispatches it into one durable, versioned job plus its `queued`
lifecycle fact. The worker adapter rechecks that scope, loads bounded immutable
source identities from only the selected channel, and atomically commits the
result, evidence, finding, attempt, and terminal fact. The source RPC creates
or observes one immutable historical snapshot per run, so retries retain exact
revision identities, chronological order, and truncation metadata.
The separate `load_analysis_job_extraction_input` RPC first invokes that same
lease/access gate, then joins frozen revision IDs to immutable message content.
It returns one JSON input including the Analysis Run ID and truncation flag,
even when the source array is empty. The adapter validates the extraction schema
and checks the returned run ID against the execution. Neither message content
nor raw transport/schema errors are attached to its failure values or spans.
Browser roles cannot invoke this content capability.
Only messages created at or after the inclusive start and before the exclusive
end can become result sources. Edits and deletion are resolved as they existed
at that exclusive boundary. PostgreSQL independently rejects missing,
reversed, future-ending, or longer-than-31-day intervals.
Provider rows and errors are translated before crossing into application code.

```text
use case -> repository Tag -> Supabase Layer -> service-role RPC
         -> atomic run/event/outbox or claim/job/queued command
         -> decoded current AnalysisRun, sources, optional claim, or job
```

The trusted Supabase key is supplied only to the server and worker runtimes; it
never identifies the caller and never reaches Angular. Browser roles receive no
direct event, job, attempt, result, source, or finding-table access. The adapter
exposes focused readiness, acquisition, success, and failed-completion RPCs but
never performs polling or decides lease validity, retry timing, or exhaustion.
Worker lifecycle, deterministic policy, model execution, and generic privileged
repositories remain outside this package.

Verify with
`pnpm exec nx run-many -t lint typecheck typecheck:test test -p analysis-infrastructure`.

## Decision extraction conformance adapter

`makeDeterministicDecisionExtractorLayer` supplies the application extractor
Tag from one explicit synthetic input/output case. It compares the full request,
including source data, prompt, and generation policy, then decodes unknown output
and verifies evidence through the application validator. Unmatched requests or
metadata fail with unsupported configuration. The adapter performs no inference
and has no network access; it is not installed in the production worker.

The conformance suite covers dispositions, conflicts, assumptions, participant
roles, empty outcomes, malformed output, revision mismatch, and adversarial
message text. These tests establish structural conformance only. They do not
measure model precision, recall, or resistance to prompt injection; those need
a real adapter and the later versioned semantic evaluation gate.
