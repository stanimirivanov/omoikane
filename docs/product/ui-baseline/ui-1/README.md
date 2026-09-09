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

These are review references, not pixel-locking test fixtures. Stable visual
assertions remain deferred to UI-8 as required by OMO-UX-001.
