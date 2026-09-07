# Analysis Application

Orchestrates the first deterministic Analysis Run workflow. It validates the
authenticated request identity, workspace and channel IDs, run ID, dispatcher
identity, and safe W3C processing trace carrier before invoking the capability-oriented
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
deterministic processor consumes only immutable message/revision/author
identities from the run's authorized channel, selects at most 100 sources, and produces a versioned proposed
inventory finding without reading content or calling a model. Polling, worker
lifecycle, hosted model execution, review workflows, and streaming remain
outside this package.

Verify with `pnpm exec nx run-many -t lint typecheck typecheck:test test -p analysis-application`.
