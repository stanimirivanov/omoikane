# UI-7 responsive and accessibility review

**Date:** 10 September 2026  
**Applies to:** Angular client presentation through UI-6

## Outcome

The implemented UI remains usable at a 320 CSS-pixel viewport, with browser
zoom reducing the effective viewport through the same responsive breakpoints.
The authenticated shell retains one main landmark, named workspace and channel
navigation, keyboard-operable modal drawers, a skip link, visible focus, and a
stable message composer. Feature component tests continue to cover loading,
empty, error, success, mutation, and realtime states.

This review changes presentation and verification only. Route semantics,
Signal Store ownership, application commands, authorization, and server
boundaries are unchanged.

## Verified contract

| Concern                  | Evidence                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Small viewport and zoom  | Playwright exercises anonymous and authenticated paths at 320 by 720 CSS pixels and rejects horizontal document overflow. Responsive layouts use CSS-pixel breakpoints, so 200% browser zoom enters the same compact compositions.                                                                                |
| Keyboard order and focus | Browser coverage moves between authentication fields with Tab, checks the application focus indicator, opens modal navigation drawers, verifies trapped focus, closes with Escape, and verifies restoration to the opener.                                                                                        |
| Navigation and landmarks | The authenticated shell owns the single `main` landmark and skip target. Workspace and channel collections retain named `nav` landmarks and selected items expose `aria-current`.                                                                                                                                 |
| Accessible names         | Icon-only buttons retain explicit `aria-label` values. Decorative Lucide icons are consistently hidden from the accessibility tree.                                                                                                                                                                               |
| Asynchronous state       | Existing component tests cover status and alert roles. Analysis status uses a concise polite announcement instead of announcing its complete evidence report.                                                                                                                                                     |
| Errors                   | Authentication, message composition, and search controls reference their rendered operation error through `aria-describedby`. Other command errors remain adjacent, named `role="alert"` regions.                                                                                                                 |
| Contrast                 | Primary text on surface is 16.36:1, muted text 6.06:1, accent 5.02:1, strong accent 7.09:1, navigation text 16.10:1, navigation muted text 8.43:1, danger text 5.98:1, and success text 4.87:1. Native control boundaries now use a dedicated 4.88:1 token rather than the low-emphasis structural-divider token. |
| Coarse pointers          | A global coarse-pointer contract gives buttons, disclosure summaries, and form controls a minimum 44 CSS-pixel target. Playwright measures visible anonymous controls in a touch-enabled Chromium context.                                                                                                        |
| Reduced motion           | The global reduced-motion query collapses animation and transition durations. Browser coverage verifies the animated workspace switcher under an emulated reduced-motion preference.                                                                                                                              |
| Forced colors            | Focus and current-page outlines defer to the system Highlight color when forced colors are active. Status remains accompanied by text and does not depend on color alone.                                                                                                                                         |

## Browser verification

The real-backend Playwright project runs serially because every scenario uses
the same reset Supabase seed. It retains screenshots and traces only when a run
fails. The suite contains:

- the existing desktop collaboration and sign-out smoke path;
- a responsive authenticated path covering keyboard focus, both navigation
  drawers, reduced motion, the channel composer, and document overflow; and
- a touch-enabled anonymous path measuring minimum interaction targets.

The browser checks intentionally use role and accessible-name locators rather
than visual selectors, except where a CSS property or drawer focus boundary is
the subject of the assertion.

## Deferred to UI-8

- Deterministic screenshot assertions for selected critical states.
- Removal of styles proven to be superseded after visual comparison.
- Final bundle-budget and documentation reconciliation.
