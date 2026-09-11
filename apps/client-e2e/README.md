# Client browser smoke test

This Nx project owns focused Chromium end-to-end checks for the existing
Angular-to-Supabase collaboration boundary and the responsive accessibility
contract. Feature-shaped page objects are introduced only for executable guide
scenarios; they own semantic locators and interactions, not assertions about
application policy.

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
and reduced motion. The desktop baseline is platform-specific because its large
typography exposes material Chromium font-rasterization differences between
Windows development machines and the Linux CI runner. The smaller mobile
baseline remains shared while it stays within the configured rendering
tolerance.

After an intentional visual change, review the generated images before updating
them with:

```bash
pnpm e2e --grep=visual --update-snapshots
```

Run `pnpm e2e --grep=visual` afterward to prove that normal comparison mode
passes. Snapshot updates affect only the platform on which the command runs;
review Linux failures from the uploaded CI artifact before replacing the Linux
baseline. Do not update snapshots merely to make an unexplained failure green.

## Executable user guides

The tagged sign-in scenario runs as an ordinary assertion-first browser test
during `pnpm e2e`. Generate its narrated artifacts with:

```bash
pnpm guide:generate
```

The command resets the deterministic local database, ensures Chromium is
installed, and runs only `@user-guide` scenarios in `user-guide` mode. The
scenario creates `dist/user-guide/sign-in/README.md`, annotated step images,
and a WebM recording. Calling `UserGuideSession.start()` and `finish()` creates
and closes the dedicated Playwright browser context, so those calls define the
recording boundary without CDP or FFmpeg. A failed scenario calls `abort()` and
removes its incomplete artifacts.

Guide prose is source-controlled beside the executable scenario and its page
objects. Each successful recording writes a versioned `guide.json` manifest.
After all guide scenarios pass, the book assembler validates those manifests,
writes each Markdown page, and creates deterministic ordered navigation without
letting independently recorded guides overwrite one another. Generated
Markdown and media remain disposable build output under `dist/`; publishing is
intentionally outside this slice.

The assembler also creates a dependency-free static HTML edition at
`dist/user-guide/index.html`. Preview it locally after generation with:

```bash
pnpm guide:preview
```

The preview server binds only to `127.0.0.1` and defaults to port `4173`. Set
`GUIDE_PORT` to use another local port. All site links and media references are
relative, so the complete `dist/user-guide` directory can later be deployed to
a static host without rebuilding application code. Provider selection and
automated publication remain outside this slice.

The sign-in guide records the complete anonymous workflow. The channel-message
guide authenticates in a temporary setup context, transfers only Playwright
storage state, and starts its guide context afterward. Its video therefore
contains only workspace, channel, and message interactions. This pattern keeps
test setup executable while making recording boundaries deliberate.

Page objects accept an optional `GuideNarrator`. Without one, the same methods
perform ordinary smoke-test interactions with no guide delays or output. With
one, they add documentation metadata around those interactions. Scenarios keep
their own assertions; page objects own semantic locators and cohesive user
actions.
