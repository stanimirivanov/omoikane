# Analysis Domain

Defines the provider-independent Analysis Run identity and its observable
processing states: `created`, `queued`, `running`, `succeeded`, and `failed`.
New runs carry one immutable channel identity; the nullable representation is
retained only so truthful pre-scope history remains decodable.
Only failed runs carry a bounded, safe failure category. A succeeded run carries
one validated immutable channel-scoped inventory result, its exact message
revision references, bounded processor metadata, and one proposed finding.
Execution mechanics, jobs, and future review facts remain outside the domain
value.

The library depends only on inner domain identities and Effect Schema. External
rows are decoded before becoming `AnalysisRun` values.

`DecisionCandidateSchema` additionally defines proposed extraction values:
made/deferred/changed/rejected dispositions, bounded claims and assumptions,
supported participant roles, exact evidence identities, and finite confidence.
Each assertion requires evidence without duplicate messages. Candidate identity
and human review are assigned later by persistence; model output cannot choose
them. The application enforces membership in the specific run snapshot.
Provider envelopes, prompts, and transport failures remain application concerns.

```text
lifecycle projection -> infrastructure decoder -> AnalysisRun
```

Verify with `pnpm exec nx run-many -t lint typecheck typecheck:test test -p analysis-domain`.
