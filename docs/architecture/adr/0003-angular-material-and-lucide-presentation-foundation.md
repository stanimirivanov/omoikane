# ADR 0003: Angular Material and Lucide presentation foundation

> **Status:** Accepted  
> **Date:** 8 September 2026  
> **Decision owners:** Omoikane product and architecture

## Context

The Angular client implements the collaboration and Decision Forensics
workflows, but its templates are predominantly unstyled semantic HTML. The next
product-experience track will give the application a cohesive, dense desktop
workspace inspired by the interaction model of collaboration tools without
copying another product's visual identity.

The presentation foundation must:

- remain free and compatible with the repository's supported Angular runtime;
- provide maintained, accessible interaction primitives without copying
  component source into this repository;
- allow an Omoikane-specific visual language rather than impose a complete
  product shell;
- preserve the existing Angular, Signal Store, application, Effect, and
  Supabase boundaries; and
- avoid a speculative shared-component layer before repeated consumers exist.

## Decision

The Angular client will use `@angular/material` and `@angular/cdk`, with their
major versions aligned to the workspace's Angular major version. Material owns
complex interaction primitives such as form fields, buttons, menus, dialogs,
tooltips, progress indicators, and drawers when those primitives are introduced
by a concrete redesign slice.

The client will use `@lucide/angular` for interface icons. Components import
only the standalone Lucide icons they render. The application will not register
the complete icon catalogue, depend on an icon font, or use an icon as the only
accessible name of an action.

Omoikane continues to own its product layout and visual identity. Workspace
navigation, channel navigation, conversation rows, evidence cards, and other
product-specific compositions remain semantic Angular components styled with
component-scoped CSS. Angular Material is a toolkit, not the application shell.

The global stylesheet owns only the theme, design tokens, document-level reset,
and true application-wide rules. Feature styles remain colocated with their
components. Code must not couple to undocumented Material DOM structure, use
`::ng-deep`, or override internal selectors globally.

UI-0 records this decision and the design contract without installing runtime
packages. UI-1 will install the dependencies, establish the theme, and prove
the foundation through the anonymous authentication surface.

A reusable presentation component or wrapper is introduced only when multiple
implemented consumers need the same semantic behavior. Ordinary Material
components are used directly until that evidence exists.

## Consequences

- The project gains maintained keyboard, focus, overlay, and form primitives
  that follow Angular's release lifecycle.
- The visual system can remain recognizably Omoikane because product layout and
  semantic components are not delegated to a full application template.
- Material theming and component density require deliberate configuration to
  avoid a generic Material appearance.
- Material and Lucide increase the client dependency and bundle surface. Static
  component imports and production-build budgets must keep that cost visible.
- Presentation-only redesign slices must preserve feature-store ownership,
  application calls, route semantics, authorization affordances, and accessible
  names unless a separately approved behavior slice changes them.

## Rejected alternatives

- **Spartan UI with Tailwind CSS:** its source-distribution model would make the
  application responsible for copied component implementations and upgrades,
  contrary to the selected maintenance model.
- **PrimeNG:** it offers a broad packaged component suite, but the selected
  foundation favors Angular-aligned primitives and a smaller visual surface to
  restyle.
- **Headless primitives plus custom styling only:** this maximizes visual
  freedom but leaves more interaction, accessibility, and maintenance work in
  the application than the redesign currently justifies.
- **Angular CDK and bespoke controls only:** the CDK remains available through
  Material, but building every form and overlay control would add implementation
  cost without product value.
- **Tailwind CSS as the styling foundation:** utility classes are not required
  for the small token system and component-scoped styling model selected here.

## Affected decisions and documents

This ADR adds a presentation decision not specified by OMO-ARC-000. It does not
change the runtime or dependency direction established by that baseline. The
approved visual, responsive, accessibility, and migration contract is recorded
in OMO-UX-001 and linked from OMO-RMP-001.

## Implementation and verification implications

- UI-1 installs Angular Material, Angular CDK, and Lucide with compatible,
  locked versions and verifies the production bundle.
- Each UI slice retains or extends component interaction tests; changing only
  appearance is not a reason to weaken role- and name-based assertions.
- The authenticated Playwright path remains the behavior regression gate.
- Desktop and mobile reference captures are taken at defined redesign
  checkpoints. Pixel-perfect snapshot testing is deferred until the visual
  system has stabilized.
- Accessibility verification covers keyboard order, visible focus, landmarks,
  dialog focus management, announcements, contrast, zoom, reduced motion, and
  coarse-pointer targets.
