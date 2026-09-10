# Omoikane UI/UX Redesign Plan

> **Document ID:** OMO-UX-001  
> **Version:** 1.0  
> **Status:** Approved UI-0 design contract  
> **Date:** 8 September 2026  
> **Related decision:** [ADR-0003](../architecture/adr/0003-angular-material-and-lucide-presentation-foundation.md)

## 1. Outcome

Omoikane will become a focused collaborative-intelligence workspace with the
familiar efficiency of a desktop collaboration application and its own visual
identity. This track changes information hierarchy, presentation, interaction
polish, responsiveness, and accessibility. It does not add product behavior or
move responsibility between Angular, Signal Store, application, Effect, or
Supabase layers.

The redesign is complete when existing collaboration and Decision Forensics
workflows are easier to scan and operate on desktop, remain fully usable on
small screens, and pass the existing behavioral checks with a documented
accessibility review.

## 2. Design principles

1. **Workspace before chrome.** Persistent navigation supports the work but
   does not visually compete with the conversation or evidence being reviewed.
2. **Dense, not cramped.** Desktop surfaces favor information density while
   maintaining clear grouping and predictable targets.
3. **Calm content, branded navigation.** Dark ink/plum navigation frames quiet
   neutral work surfaces; warm copper is reserved for meaningful emphasis.
4. **Continuous conversation.** Messages read as a timeline, not as a stack of
   unrelated cards.
5. **Context beside content.** Members, analysis, and management appear in a
   contextual drawer or panel instead of displacing primary navigation.
6. **State is explicit.** Loading, empty, failure, success, editing, and
   confirmation states remain recognizable without relying on color alone.
7. **Accessibility is structural.** Semantics, keyboard operation, focus, and
   announcements are acceptance criteria, not a final visual pass.

The interface may use established collaboration patterns, but it must not copy
Slack trademarks, illustrations, wording, exact color values, or pixel-level
layouts.

## 3. Scope boundaries

In scope:

- the anonymous authentication experience;
- the authenticated application shell and navigation hierarchy;
- conversation history and message composition;
- workspace, channel, member, invitation, archive, search, profile, presence,
  typing, and unread presentation;
- Analysis Run and Decision Forensics presentation; and
- responsive, keyboard, focus, contrast, motion, and visual-regression checks.

Out of scope:

- new commands, queries, database objects, API routes, or realtime channels;
- changes to domain or application validation;
- changes to route/query-parameter meaning;
- changes to authorization or Supabase RLS policy;
- a generic design-system library or speculative component wrappers;
- a dark content theme, user-selectable themes, animation system, marketing
  website, logo redesign, or native mobile application; and
- pixel-perfect compatibility with another product.

## 4. Presentation foundation

Angular Material and the Angular CDK provide maintained interaction primitives.
Lucide provides the interface icon set. Product-specific layout remains normal
semantic Angular markup with component-scoped CSS.

Use Material directly for controls whose interaction behavior is costly to
recreate: fields, buttons, menus, dialogs, tooltips, progress, and responsive
drawers. Prefer native HTML for headings, landmarks, lists, articles, timestamps,
and other document semantics. Icons supplement visible text or receive an
explicit accessible name when an icon-only control is justified.

UI-0 adds no package. Dependency installation and theme configuration belong to
UI-1 so the dependency diff and first concrete consumer are reviewed together.

## 5. Desktop information architecture

```text
+--------------------------------------------------------------------------+
| Product / workspace context | Search and current context | User actions  |
+-------+----------------------+----------------------------+---------------+
| Work- | Workspace navigation | Conversation / selected    | Context       |
| space | channels, unread,    | feature                    | drawer        |
| rail  | presence, utilities  |                            | (optional)    |
|       |                      | header                     | members,      |
|       |                      | timeline / results         | analysis,     |
|       |                      | composer / actions         | management    |
+-------+----------------------+----------------------------+---------------+
```

- The top bar is 48 px high and communicates current context without duplicating
  the page heading.
- The workspace rail is 68 px wide on desktop.
- The navigation sidebar is 240–288 px wide and may be resized only if a later
  slice proves that capability necessary.
- The main pane uses the remaining width and must set `min-width: 0` so long
  content cannot force the shell beyond the viewport.
- The optional context panel begins at 320 px and is opened by an explicit
  action. It is not permanently present merely because space is available.
- The application shell occupies `100dvh`; primary panes own their scrolling so
  navigation and the composer remain stable.

## 6. Visual tokens

Tokens use semantic Omoikane names rather than Material internals. Values are
the UI-1 implementation baseline; contrast corrections may adjust a value
without changing the semantic contract.

### 6.1 Color

| Token                 | Baseline  | Purpose                              |
| --------------------- | --------- | ------------------------------------ |
| `--omo-nav-rail`      | `#211625` | Primary product rail                 |
| `--omo-nav-sidebar`   | `#302033` | Workspace navigation surface         |
| `--omo-nav-text`      | `#f8f5f9` | High-emphasis navigation text        |
| `--omo-nav-muted`     | `#c9bdcc` | Secondary navigation text            |
| `--omo-canvas`        | `#f6f5f3` | Application background               |
| `--omo-surface`       | `#ffffff` | Primary content surface              |
| `--omo-text`          | `#211f22` | Primary content text                 |
| `--omo-text-muted`    | `#666166` | Supporting content text              |
| `--omo-border`        | `#ded9df` | Structural dividers                  |
| `--omo-accent`        | `#b45309` | Primary action and selected emphasis |
| `--omo-accent-strong` | `#92400e` | Hover/active emphasis                |
| `--omo-focus`         | `#2563eb` | Visible keyboard focus               |
| `--omo-danger`        | `#b42318` | Destructive and error emphasis       |
| `--omo-success`       | `#257a4b` | Successful completion emphasis       |

Do not use status color without adjacent text or an icon with an accessible
label. Feature CSS consumes tokens and does not repeat palette literals.

### 6.2 Typography, spacing, shape, and elevation

- Use the local system font stack; do not add a remote font dependency.
- Type sizes are 12, 14, 15, 18, and 24 px. Body content defaults to 15 px;
  metadata uses 12 or 14 px; screen titles use 18 or 24 px.
- Use weights 400, 500, and 600. Reserve 600 for headings, selected navigation,
  and high-emphasis actions.
- Use a 4 px spacing grid: 4, 8, 12, 16, 24, and 32 px.
- Use 4 px radii for compact controls, 8 px for surfaces, and 12 px for dialogs
  or large overlays.
- Dividers and surface color establish normal hierarchy. Shadows are reserved
  for overlays and dialogs, with no more than two elevation strengths.
- Desktop controls may be compact, but coarse-pointer targets remain at least
  44 by 44 CSS pixels.

## 7. Responsive contract

| Viewport             | Required composition                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| `< 48rem`            | One primary pane; navigation and context use modal drawers; composer remains visible |
| `48rem` to `< 64rem` | Main pane plus one navigation surface; secondary surfaces use drawers                |
| `>= 64rem`           | Workspace rail, navigation sidebar, and main pane; optional context panel            |

Responsive presentation must not destroy feature stores or reinterpret route
state. Closing a drawer hides presentation only. Every command available on
desktop remains discoverable and operable on a small screen.

## 8. Accessibility contract

Every redesigned slice must preserve or introduce:

- one main landmark, named navigation landmarks, and a logical heading outline;
- a keyboard path matching visual reading order and a skip link in the
  authenticated shell;
- a visible focus indicator that is not clipped by scrolling panes;
- accessible names for icon-only buttons and retained role/name assertions in
  component and browser tests;
- focus trapping and restoration for modal dialogs and drawers;
- polite live announcements for asynchronous results and status changes;
- error text associated with its field or operation;
- minimum WCAG AA contrast: 4.5:1 for normal text and 3:1 for large text and
  meaningful UI boundaries;
- useful operation at 200% zoom and without horizontal document scrolling at
  320 CSS pixels, except intrinsically two-dimensional content; and
- reduced-motion behavior for nonessential transitions.

## 9. Existing-state inventory

The redesign must account for the states already represented by client
templates and feature stores. It must not make only the happy path polished.

| Surface                 | Existing states to preserve                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Authentication          | session initialization, sign-in, sign-up, confirmation/resend, reset request/recovery, busy, failure |
| Current profile         | fallback identity, loading, loaded, edit, save failure, avatar image and initials fallback           |
| Workspace navigation    | loading, empty, selected, create, edit, archive/leave confirmation, failure, realtime reconnect      |
| Channel navigation      | loading, empty, selected, create, edit, archive confirmation, failure, realtime reconciliation       |
| Archive history         | workspace/channel loading, empty, restore confirmation, restore failure                              |
| Members and invitations | paginated loading, empty, role actions, removal, invite/revoke, permission and dependency failures   |
| Conversation            | initial/history loading, empty, send/edit/delete, revisions, focus target, failure, realtime changes |
| Presence and typing     | online/connecting/unavailable, retry, zero/one/many remote typists                                   |
| Search and unread       | idle, query, loading, empty, results, exact-message navigation, counts and read position             |
| Analysis Runs           | form validation, start/read/poll, lifecycle states, result inventory, unavailable server             |
| Decision Forensics      | candidates, claims, assumptions, participants, evidence links, pending/confirmed/rejected review     |

This is a presentation inventory, not permission to consolidate independent
feature states into one global store.

## 10. Screenshot and review baseline

UI-1 must capture the current application immediately before its first markup
change and capture the redesigned state after verification. Later slices update
the same named checkpoints rather than accumulating arbitrary screenshots.

| Checkpoint              | Identity / route                        | Viewports                   |
| ----------------------- | --------------------------------------- | --------------------------- |
| Anonymous sign-in       | root route, no session                  | 1440x900 and 390x844        |
| Collaboration workspace | seeded owner, General channel           | 1440x900, 1024x768, 390x844 |
| Management context      | seeded owner, workspace management open | 1440x900 and 390x844        |
| Decision review         | seeded owner, populated reviewed run    | 1440x900 and 390x844        |

Reference captures are review artifacts, not initial pixel-locking tests. Store
them under `docs/product/ui-baseline/<slice>/` only when the fixture is
deterministic and contains no credential, token, personal, or hosted data.
Playwright screenshots and traces from failed CI runs remain build artifacts.

## 11. Reviewable implementation sequence

1. **UI-0 — Design contract. Completed.** Record the framework decision, tokens, layout,
   existing-state inventory, responsive/accessibility criteria, and capture
   matrix. No runtime or behavior change.
2. **UI-1 — Foundation and authentication. Completed.** Install the selected packages,
   configure the Material theme and tokens, establish document-level styles,
   capture the anonymous baseline, and redesign all anonymous/recovery states.
3. **UI-2 — Authenticated shell. Completed.** Add the desktop shell, workspace rail,
   channel sidebar, main pane, responsive drawers, top bar, and skip link while
   preserving URL and store ownership.
4. **UI-3 — Conversation. Completed.** Redesign the channel header, continuous message
   timeline, metadata/actions, pagination, typing state, and composer.
5. **UI-4 — Collaboration management. Completed.** Redesign workspace/channel lifecycle,
   member directory, invitations, archive history, and confirmations using
   context surfaces.
6. **UI-5 — Discovery and identity. Completed.** Integrate search, unread navigation,
   presence, current profile, and supporting empty/error/reconnect states.
7. **UI-6 — Decision Forensics. Completed.** Redesign Analysis Run initiation,
   lifecycle, results, evidence, and human-review states around an
   evidence-first reading experience.
8. **UI-7 — Responsive and accessibility hardening. Completed.** Test the full
   state matrix across breakpoints, keyboard-only operation, zoom, contrast,
   reduced motion, announcements, and coarse pointers. The review and browser
   evidence are recorded in
   [UI-7 responsive and accessibility review](ui-accessibility-review.md).
9. **UI-8 — Visual regression and cleanup. Completed.** Add stable screenshot
   assertions only for deterministic critical paths, remove superseded styles,
   verify bundle budgets, and reconcile documentation. The anonymous desktop
   and mobile sign-in states are executable Playwright baselines; authenticated
   screenshots remain review artifacts until their fixtures can be isolated
   from mutable collaboration data.

Each pull request has one presentation purpose. A UI slice may refactor markup
needed for its layout, but changes to application behavior are separated into a
normal vertical slice with the owning tests and architecture layers.

All slices in this redesign plan are complete. Subsequent presentation changes
should begin with a new, bounded product outcome instead of extending this plan
indefinitely.

## 12. UI-0 acceptance

- [x] Presentation framework and icon decisions are accepted in ADR-0003.
- [x] Desktop information architecture and visual tokens are recorded.
- [x] Current feature states are inventoried from the implementation.
- [x] Responsive and accessibility acceptance criteria are explicit.
- [x] Baseline capture identities, routes, viewports, and storage policy are
      defined.
- [x] Runtime dependency installation and behavior changes remain outside
      UI-0.
