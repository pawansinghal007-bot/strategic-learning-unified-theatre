# E2E Architecture Document

## Purpose and Scope

The E2E test architecture validates the desktop application as a user-facing Electron system: the main dashboard, embedded browser pane, preload/IPC bridge, account state, local data stores, governance workflows, and CI execution paths.

The scope is intentionally centered on deterministic, local-first automation. E2E tests must prove that critical workflows work through the renderer, preload APIs, IPC handlers, and persisted stores without depending on live ChatGPT, Claude, Gemini, Perplexity, real OS keychain writes, real local LLM inference, or a real VS Code restart. Where platform behavior matters, tests use fake auth targets, mocked LLM behavior, seeded browser captures, deterministic browser fixtures, and isolated state directories.

The suite covers five critical journeys:

- J1 Account Rotation & AI Capture.
- J2 Workspace Policy & Context Routing.
- J3 Approval & Audit Compliance.
- J4 Quota Governance & Access Control.
- J5 Explainable Routing & Decision Review.

The test pyramid is split into three E2E execution depths:

- Smoke: boot, preload/IPC readiness, seeded account/capture readability, and shortest governance happy path.
- Regression: moderate-depth state transitions, restart persistence, and cross-surface consistency across all five critical journeys.
- Full: nightly/release-grade edge cases, malformed persisted data, corruption recovery, race conditions, boundary behavior, and failure handling.

## Tool Choices and Rationale

| Tool | Use | Rationale |
| --- | --- | --- |
| Playwright | E2E runner, Electron launch, browser/page control, screenshots, traces, videos, reports | Supports Electron automation, reliable waiting, project configuration, retries, CI reporters, and failure artifacts. |
| Electron application fixture | Launches `electron-ui/main.cjs` with isolated environment | Exercises the real dashboard shell, preload bridge, IPC handlers, and app lifecycle without relying on packaged builds. |
| Page objects | Model dashboard, browser pane, accounts, workspace, approvals, audit, quotas, and routing surfaces | Keeps specs behavior-focused, centralizes selectors, and limits UI churn to page-object updates. |
| Test fixtures | Create isolated state, seed data, launch Electron, expose page objects | Keeps state setup, process lifecycle, and domain seed logic outside specs. |
| Seed helpers | Create config, accounts, browser responses, governance stores, quotas, approvals, routing history, and audit entries | Makes tests deterministic while avoiding direct writes to encrypted account/secret files. |
| Mocked LLM mode | `VSCODE_ROTATOR_MOCK_LLM=1` for automated E2E | Avoids slow, flaky, or machine-dependent inference while preserving UI/IPC behavior. |
| Isolated filesystem state | Per-test `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and `UNIFIED_THEATRE_ENTERPRISE_CONFIG` | Prevents developer data damage, cross-test leakage, stale daemon state, and OS keychain cleanup needs. |
| GitHub Actions | PR smoke/regression and nightly full runs | Provides Windows-required CI coverage, optional macOS validation, retries, and artifact upload. |

## Folder Structure Summary

```text
playwright.config.ts
e2e/
  README.md
  specs/
    smoke/
      app-startup.spec.ts
    j1-account-rotation-capture/
      account-rotation.spec.ts
      browser-capture.spec.ts
    j2-workspace-policy-routing/
      workspace-policy.spec.ts
      context-routing.spec.ts
    j3-approval-audit/
      approval-flow.spec.ts
      audit-integrity.spec.ts
    j4-quota-governance/
      quota-policy.spec.ts
    j5-routing-review/
      routing-history.spec.ts
  fixtures/
    electron-app.fixture.ts
    isolated-state.fixture.ts
    journey-data.fixture.ts
    test.ts
  support/
    env.ts
    paths.ts
    seed.ts
    reset.ts
    electron.ts
    selectors.ts
    assertions.ts
    auth.ts
    ipc.ts
    waits.ts
  page-objects/
    shell.page.ts
    accounts.page.ts
    browser-pane.page.ts
    workspace.page.ts
    approvals.page.ts
    audit.page.ts
    quotas.page.ts
    routing.page.ts
  data/
    config/
    browser/
    captures/
    policies/
  artifacts/
```

Folder responsibilities:

- `e2e/specs/` contains Playwright specs only, grouped by critical journey.
- `e2e/specs/smoke/` contains the smallest app-start and preload readiness checks.
- `e2e/fixtures/` composes isolated state, seed data, Electron launch, main window, and page objects.
- `e2e/support/` owns environment normalization, path building, seed/reset mechanics, Electron lifecycle, IPC wrappers, waits, and shared assertions.
- `e2e/page-objects/` owns UI interactions and surface-specific behavior methods.
- `e2e/data/` stores static, sanitized fixtures that are safe to commit.
- `e2e/artifacts/` is the local failure-artifact landing zone and should remain gitignored except for `.gitkeep`.

## Conventions and Maintenance Guidelines

- Import `test` and `expect` from `e2e/fixtures/test.ts`, not directly from `@playwright/test`.
- Keep specs focused on user journeys and assertions. Put process lifecycle, seed data, filesystem mutation, and reset logic in fixtures/support helpers.
- Prefer selectors in this order: `data-testid`, accessible roles/names, `aria-label`, placeholder text, then tightly scoped CSS inside page objects.
- Page objects expose behavior methods such as `applyPreset()`, `verifyIntegrity()`, or `resolveApproval()`, not raw locator internals.
- Every test that mutates persistent state gets isolated `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and `UNIFIED_THEATRE_ENTERPRISE_CONFIG`.
- Seed accounts through `AccountStore` and `SecretStore` helpers; do not hand-write `accounts.enc` or `secrets.enc`.
- Do not use live AI platforms, live local LLM inference, real OS keychain records, or real VS Code binaries in automated smoke/regression/full runs.
- Use fake auth targets under the isolated home for switch tests.
- Use seeded markdown captures and deterministic browser fixtures for capture and ingestion behavior.
- Use `expect.poll` or observable UI/API state rather than fixed sleeps.
- Preserve screenshots, traces, videos, logs, mutated stores, audit exports, daemon logs, and captured response files according to suite depth and CI context.
- Keep smoke under 5 minutes with one worker.
- Run regression with moderate depth and two CI workers after smoke passes.
- Run full nightly with two CI workers, optional sharding if the 80-120 minute target is exceeded.
- Treat retry passes as stability signals. Product-state failures, audit integrity failures, quota/routing mismatches, and secret leakage must be triaged from the first failed attempt.
- Add or update coverage whenever a sprint adds a new user-visible workflow, IPC namespace, persisted store, approval/quota/routing rule, or brittle browser selector path.
