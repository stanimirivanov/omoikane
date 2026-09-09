# Contributing to Omoikane

This repository is developed in small vertical slices. A change should deliver
one observable capability or one cohesive refactoring, verify it, and introduce
an abstraction only when current code demonstrates the need.

The authoritative general review standard is the
[Code Quality and Documentation Benchmark](docs/architecture/code-quality-benchmark.md).
The rules below specialize that benchmark for Angular, NgRx Signal Store, and
Effect code.

## Dependency boundaries

Production dependencies point toward policy:

```text
Angular presentation and runtime composition
                  ↓
        application use cases and ports
                  ↓
               domain

infrastructure ──implements──> application ports
```

- Domain code must not depend on Angular, NgRx, Supabase, browser APIs, or
  database representations.
- Application code builds typed Effects and depends on capability-oriented
  ports. It must not execute Effects or know which adapter supplies a port.
- Infrastructure implements application ports and translates provider data and
  failures before they cross the boundary.
- Angular owns interaction, presentation state, runtime execution, and final
  dependency composition.

## Angular component responsibilities

Components adapt Angular inputs and browser events to a feature's presentation
API. They should not reconstruct application workflows or access Supabase,
Effect Layers, generated database types, or repositories.

- Keep transient state local when no sibling or service needs it. Examples are
  an open editor, a selected anonymous authentication form, and confirmation UI.
- Represent mutually exclusive local interaction modes with one discriminated
  signal, such as `idle | editing | confirming-delete`, rather than several
  booleans that can become true at the same time.
- Move state to a Signal Store when it coordinates multiple components,
  survives component replacement, represents asynchronous work, or must be
  reconciled with an authoritative external stream.
- Pass primitive or application/domain values to component handlers. Do not
  make handlers accept `HTMLInputElement` merely to read its value.
- Keep constructors limited to dependency acquisition and deliberate lifecycle
  actions. Do not use an Angular `effect()` for a one-time imperative action.
- Use `ChangeDetectionStrategy.OnPush` and signal-based inputs, outputs, and
  local state for standalone components.

Do not introduce a facade around a Signal Store merely to rename its members.
The store is already the Angular feature facade unless a second consumer needs
a materially smaller, independently replaceable contract.

## Signal Store state design

State stores facts; computed selectors express policy derived from those facts;
methods own state transitions and asynchronous coordination.

- Model mutually exclusive states with discriminated unions or explicit status
  vocabularies instead of combinations of unrelated booleans.
- NgRx materializes state properties as independently writable signals. When a
  top-level discriminated union conflicts with that model, keep an explicit
  status and nullable storage fields, update correlated fields atomically, and
  expose a discriminated computed model to readers.
- Return a discriminated presentation model when a rendered state requires
  correlated data. For example, an authenticated view should carry its
  non-null session and a confirmation-required view should carry its email.
- Compose nested presentation models when a feature contains independent
  subworkflows, such as recipient and owner invitation states. Do not flatten
  them into an artificial cross-product or one feature-wide loading flag.
- Keep operation statuses when they protect concurrency, stale-result handling,
  retry behavior, or progress feedback. Do not collapse independent operations
  into one generic loading flag.
- Centralize shared policies such as “any authentication command is pending” in
  one computed selector. Adding another operation should require changing one
  policy definition.
- Keep authoritative-stream reconciliation and the commands it invalidates in
  the same consistency boundary. Splitting a large store is not an improvement
  when the extracted stores would coordinate through hidden temporal coupling.
- Use revision tokens or stable request identities when an older Promise may
  complete after newer authoritative state arrives.
- Map application failures to safe presentation errors at the Angular boundary.
  Raw provider errors and secrets must never enter store state.

Avoid generic async runners when operations have different completion,
cancellation, or stale-result semantics. Extract a runner only when the complete
transition protocol—not merely `loading` boilerplate—is genuinely identical.

## Template interaction

Templates render presentation decisions; they do not derive workflow state from
low-level store fields.

- Prefer `@switch` over parallel `@if` expressions for mutually exclusive
  discriminated views. Use explicit cases so supported states are visible in
  review.
- Ask the store for a presentation model when a condition encodes precedence or
  correlates several values. Do not recreate that condition independently in a
  header, body, and child component.
- Render an existing domain or application discriminant directly when it
  already expresses the complete UI decision. Do not add a second presentation
  union that merely renames its cases.
- Use `@let` to give a meaningful name to a repeatedly consumed reactive value
  or to keep one coherent value within a render branch. `@let` is not a
  substitute for a missing store-level abstraction.
- Keep one-off reads and commands direct. Aliasing every signal makes a template
  longer without improving cohesion.
- Derive row-specific values inside `@for` when they depend on the current row;
  derive collection-wide state outside the loop.
- Preserve semantic HTML, accessible names, live-region behavior, form
  autocomplete, and disabled states while refactoring presentation code.

## Forms

Use the least complex form mechanism that satisfies current behavior:

- Native form controls and submit events are appropriate for small forms whose
  validation and normalization are owned by the application use case.
- Use Angular reactive forms when the UI owns field-level validation,
  cross-field feedback, dynamic controls, drafts, or reusable form state.
- Do not duplicate domain or application validation merely to adopt a form
  library. Browser validation is an interaction aid, not the trust boundary.
- Pass submitted values to the store; never place credentials in logs, errors,
  URLs, or long-lived presentation state.

## Effect execution

Application and domain modules build Effects but never call `runPromise` or
`runFork`. Angular boundary services execute those programs through the shared
managed runtime.

- Keep Effect requirements visible in boundary helper signatures.
- Translate an Effect's typed failure into `Either` or another explicit Angular
  result before it reaches a Signal Store.
- Centralize identical execution concerns such as safe diagnostic logging.
- Keep stream Fiber ownership and interruption at the Angular lifecycle
  boundary.
- Do not inject Angular services into application or domain code.

## Testing

Test behavior at the narrowest owner:

- Signal Store tests cover transitions, derived presentation models, command
  serialization, stale completion, and authoritative-stream reconciliation.
- Component tests cover rendered states and event adaptation. They should not
  repeat lower-layer input validation.
- Test fixtures should construct coherent discriminated views instead of
  independently toggling booleans into impossible combinations.
- Use a fresh test double per test and verify the values crossing the component
  or application boundary.
- A shell test may exercise real children when composition is the behavior under
  test; otherwise replace children with focused stubs to avoid accidental
  feature integration.

## Before opening a pull request

Run the checks proportionate to the change and finish with the repository's
required verification commands:

```bash
pnpm check
pnpm test
pnpm build
```

Database, server integration, and end-to-end changes additionally require the
relevant commands documented in `README.md`. Review the final diff for boundary
violations, stale documentation, accidental generated-file changes, and tests
that pass without exercising the intended code.
