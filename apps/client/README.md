# Omoikane Angular Client

The client is Omoikane's browser delivery mechanism. It renders application
state, translates user interactions into application use-case calls, and
composes the Effect and Supabase runtime through Angular dependency injection.

## Responsibilities

- Present authentication, collaboration, and Decision Forensics workflows.
- Keep presentation state in feature-scoped NgRx Signal Stores.
- Execute application Effects through Angular services under `core/`.
- Preserve URL-owned workspace, channel, and message navigation.
- Access simple RLS-protected collaboration capabilities directly through the
  configured Supabase adapters.

Business validation remains in domain and application libraries. Database
authorization remains in PostgreSQL constraints, functions, and row-level
security policies. The client must not reproduce either boundary.

## Structure

```text
src/app/core/          Application-wide runtime composition and Angular boundaries
src/app/features/      Vertical presentation slices and feature-local stores
src/app/shared/        Presentation code shared by multiple implemented features
src/environments/      Build-time public client configuration
```

The root route lazy-loads the authentication shell. Cross-feature imports use
`@client/*`; relative imports keep locality visible within one feature.

See the [Angular Client Architecture](../../docs/architecture/angular-client-architecture.md)
for state ownership, runtime flow, navigation, feature behavior, and extension
guidance. Presentation decisions and the completed UI modernization sequence
are recorded in the [UI/UX Redesign Plan](../../docs/product/ui-ux-redesign-plan.md)
and [ADR-0003](../../docs/architecture/adr/0003-angular-material-and-lucide-presentation-foundation.md).

## Verification

```bash
pnpm nx lint client
pnpm nx run client:typecheck
pnpm nx run client:typecheck:test
pnpm nx test client
pnpm nx build client
```

Browser-level collaboration and visual contracts live in
[`apps/client-e2e`](../client-e2e/README.md).
