# Client browser smoke test

This Nx project owns focused Chromium end-to-end checks for the existing
Angular-to-Supabase collaboration boundary and the responsive accessibility
contract. It deliberately contains no page objects or reusable browser-testing
layer.

Run the complete deterministic path with:

```bash
pnpm e2e:verify
```

The command starts local Supabase when necessary, resets the database to the
committed seed, installs Chromium, launches the Angular development server, and
runs the test. The database reset discards uncommitted local data.

Use `pnpm e2e` when local Supabase and Chromium are already prepared. Failed
runs retain Playwright traces and screenshots under `dist/.playwright`. Nx
caching is disabled for the `e2e` target because the result depends on live
Angular and Supabase processes, not only on repository inputs.

The scenarios run serially because they share the same deterministic Supabase
seed. In addition to the desktop collaboration path, the suite covers a 320
CSS-pixel authenticated layout with keyboard and drawer focus assertions, plus
a touch-enabled check for minimum interaction-target sizes.

Desktop and mobile anonymous sign-in screenshots are committed under
`e2e/__screenshots__/visual-regression.spec.ts/`. They are the only executable
pixel baselines because that state is deterministic and contains no account or
hosted data. Screenshot comparison fixes locale, timezone, light color scheme,
and reduced motion, while allowing a small cross-platform rendering tolerance.

After an intentional visual change, review the generated images before updating
them with:

```bash
pnpm e2e --grep=visual --update-snapshots
```

Run `pnpm e2e --grep=visual` afterward to prove that normal comparison mode
passes. Do not update snapshots merely to make an unexplained failure green.
