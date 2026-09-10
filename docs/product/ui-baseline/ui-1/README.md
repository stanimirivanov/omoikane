# UI-1 authentication baseline

These captures compare the anonymous sign-in surface immediately before and
after UI-1. They were produced from the local Angular client and local Supabase
stack with a fresh browser context, so they contain no authenticated identity,
credential, token, personal data, or hosted data.

| Capture                             | Viewport   | Purpose                        |
| ----------------------------------- | ---------- | ------------------------------ |
| `before-authentication-desktop.png` | 1440 × 900 | Pre-redesign desktop reference |
| `before-authentication-mobile.png`  | 390 × 844  | Pre-redesign mobile reference  |
| `after-authentication-desktop.png`  | 1440 × 900 | UI-1 desktop review checkpoint |
| `after-authentication-mobile.png`   | 390 × 844  | UI-1 mobile review checkpoint  |

These remain historical review references, not pixel-locking test fixtures.
UI-8 introduced executable anonymous sign-in baselines under
`apps/client-e2e/e2e/__screenshots__/visual-regression.spec.ts/`; the Playwright
project README documents their controlled update workflow.
