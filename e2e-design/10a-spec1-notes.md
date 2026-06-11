# Spec 1 Notes

## Journey Chosen

J1 — Account Rotation & AI Capture.

## Rationale

J1 is the highest-priority journey for the first complete Playwright spec because it is listed first among the high-impact journeys and covers the core developer workflow: account state, daemon/dashboard readiness, and captured AI response retrieval. A failure here breaks the main value path and weakens downstream capture/routing review.

The spec is smoke-grade and deterministic. It launches Electron with isolated `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and `UNIFIED_THEATRE_ENTERPRISE_CONFIG`; seeds one account through `AccountStore`; seeds one ChatGPT markdown capture; and verifies the data through preload IPC using local page objects.

## Selector Assumptions

- The current repo does not yet include the Phase 6 `e2e/fixtures/` or `e2e/page-objects/` implementation, so the spec defines small local page objects inside the spec file.
- Stable dashboard `data-testid` hooks are not assumed to exist yet.
- The page objects prefer preload IPC for this first smoke test because the design allows page objects to read preload APIs when UI observability is not reliable.
- Future revisions should move `ShellPage`, `AccountsPage`, and `BrowserPanePage` into `e2e/page-objects/` once the Phase 6 fixture tree is implemented.

## Open Questions Needing Human Review

- Should this first J1 smoke test perform `rotator.accounts.health()`? The current Electron process creates `SecretStore` without an explicit test-only fallback adapter, so a health probe may touch OS keychain when `keytar` is available.
- Should account switching be covered in smoke or left to regression? A real `rotator.switcher.switch()` can close/relaunch VS Code unless a first-class fake restart mode is added.
- Should the planned folder be `e2e/smoke/` or `e2e/specs/smoke/`? This request explicitly asked for `e2e/smoke/<journey-name>.spec.ts`, while Phase 6 proposes `e2e/specs/smoke/`.
- Which stable `data-testid` values should the dashboard expose for accounts, capture response list, and daemon status? The spec currently avoids relying on selectors that may not exist.
- Should CI run this spec against built `electron-ui/dist` only, or should it support `VITE_DEV_SERVER_URL` for local debugging?
