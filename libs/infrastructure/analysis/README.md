# Analysis Infrastructure

Implements the Analysis Run application repository with narrowly privileged
Supabase RPCs. PostgreSQL atomically checks active workspace membership and the
selected active channel, then creates the immutable run or reads its current
lifecycle/result projection. A
separate lease-fenced pair of commands claims a requested outbox event and
idempotently dispatches it into one durable, versioned job plus its `queued`
lifecycle fact. The worker adapter rechecks that scope, loads bounded immutable
source identities from only the selected channel, and atomically commits the
result, evidence, finding, attempt, and terminal fact.
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
