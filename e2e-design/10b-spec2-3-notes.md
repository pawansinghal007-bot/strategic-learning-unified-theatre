# Spec 2-3 Notes

## Journeys Chosen

- J2 — Workspace Policy & Context Routing.
- J3 — Approval & Audit Compliance.

## Rationale

J2 and J3 are the next two priority journeys in `03-critical-journeys.md` after the existing J1 smoke spec. They cover the highest-impact governance flows that are not duplicated by spec 1: workspace-level policy overrides, workspace context injection, workspace-scoped routing review, approval creation/resolution, audit integrity verification, and audit evidence export.

The specs are deterministic Electron Playwright tests. Each test creates an isolated `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and enterprise policy file, then seeds only test-owned `.unified-ai-workspace` stores. J2 seeds routing history because there is no renderer API for recording a provider decision directly. J3 drives the sensitive-policy approval flow through preload APIs and verifies the resulting audit chain and exported JSON/HTML evidence.

## Selector Assumptions

- The current repo still does not include the Phase 6 shared `e2e/fixtures/` and `e2e/page-objects/` tree, so both specs define local Page Object Model classes in the spec files.
- Stable dashboard `data-testid` hooks are not assumed to exist yet.
- Page objects use preload namespaces as the stable observable surface:
  - `window.workspacePolicy`
  - `window.workspaceContext`
  - `window.workspaceRouting`
  - `window.workspaceApproval`
  - `window.audit`
- J2 avoids UI selectors and validates workspace routing through `workspaceRouting.list()` and `workspaceRouting.analytics()`.
- J3 assumes sensitive workspace policy changes create a pending approval and audit events for `workspacePolicy.set`, `workspaceApproval.requested`, and `workspaceApproval.approved`.

## Open Questions Needing Human Review

- `electron-ui/main.cjs` currently registers `workspace-handlers.cjs`, while approval and quota handlers appear to live in `workspace-policy-handlers.cjs`. Should main register the newer governance handler module so `workspaceApproval:*` IPC calls work?
- `electron-ui/preload.cjs` passes a single third `options` argument to `workspacePolicy:set`, while `workspace-policy-handlers.cjs` currently accepts `requestedBy` and `reason` as separate arguments. Which contract should be canonical?
- Should workspace context changes emit audit events? The selector/hook design mentions `workspaceContext.set`, but the current context handler appears to persist context without appending audit events.
- Should audit verification with a workspace filter verify the full hash chain or only the filtered subset? The J3 spec uses full-chain verification after creating only workspace-scoped events.
- Should audit exports continue writing to the repo root, or should E2E export paths be redirected under the per-test run root to avoid repo-local cleanup?
