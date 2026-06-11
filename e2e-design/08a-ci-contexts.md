# CI Execution Contexts

## Context Summary

| Context | Suite | OS | Parallel | Retries | Artifacts |
| --- | --- | --- | --- | --- | --- |
| Local developer runs | Smoke by default; regression/full only when explicitly requested | Windows required for parity; macOS optional for developers validating platform-specific UI or path behavior | Single worker by default; allow `E2E_WORKERS=2` only for isolated, non-flaky investigation runs | 0 retries by default; developers may rerun manually with trace enabled | Screenshots on failure, trace on first retry when retries are enabled, video retained on failure, HTML/list/JSON reports under local Playwright output |
| Pull request checks | Smoke suite for every relevant PR; regression suite for cross-journey or governance/persistence changes after smoke passes | Windows required; macOS only when touched code is platform-sensitive, such as filesystem paths, Electron shell behavior, packaging, or keychain-adjacent fallback behavior | Smoke: one worker. Regression: two workers in CI with isolated per-test state and no shared external services | 2 retries in CI for Electron/browser timing flakes; failures must still preserve the first failed attempt artifacts | Screenshots, traces, videos, renderer console, main-process console, JSON results, HTML report, and failed-run isolated state snapshots |
| Nightly full runs | Full suite after smoke and regression pass | Windows required; macOS included when release risk, platform-sensitive changes, or prior macOS-only failures justify it | Two workers in CI with per-test isolated `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and enterprise config; shard only by stable suite/test group if runtime exceeds target | 2 retries for infrastructure/Electron timing flakes; deterministic product failures are triaged from first failure and not masked by retry pass | Screenshots, traces, videos, HTML/JSON reports, renderer console, main-process console, mutated store snapshots, audit exports, daemon logs, captured response files, and seeded run metadata |

## Local Execution Guide

Local developer runs use the smoke suite as the normal fast feedback loop. The target is to prove the Electron app boots, preload and IPC namespaces are available, seeded account and capture state are readable, and the shortest governance path writes observable state in under 5 minutes.

Run on Windows before considering a change locally validated for CI. macOS local runs are optional and should be used when the change may affect Electron window behavior, path handling, packaging assumptions, or platform-specific storage/fallback behavior.

Use one worker by default to keep Electron process lifecycle and isolated state easy to inspect. Developers may temporarily set two workers for regression or full-suite investigation, but only when each test has its own isolated `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and `UNIFIED_THEATRE_ENTERPRISE_CONFIG`.

Retries are off for normal local runs. A local retry is useful only as a debugging choice, especially with trace capture enabled, because local failures should remain directly reproducible.

Collect local artifacts with a lightweight failure-first policy:

- Screenshots only on failure.
- Videos retained on failure.
- Traces on first retry when retries are enabled.
- List, HTML, and JSON reports in the standard Playwright output folders.
- Failed run output copied or preserved only when needed for debugging.

## PR Execution Spec

Pull request checks run the smoke suite for every relevant application, preload, IPC, governance, account, browser capture, LLM, policy, audit, quota, routing, or E2E support change. PRs that touch cross-journey behavior run the regression suite after smoke passes.

Windows is required for PR checks. Add macOS only when the PR touches platform-sensitive behavior, including Electron shell behavior, filesystem path handling, release packaging, browser fixture behavior, or secret-store fallback paths. External AI platform login, real local LLM inference, real OS keychain dependency, and real VS Code restart remain out of scope for PR automation.

Parallelization:

- Smoke runs with one worker to keep startup diagnostics simple and runtime under the target budget.
- Regression runs with two workers in CI, using isolated per-test state and seeded local data.
- No test may depend on live ChatGPT, Claude, Gemini, Perplexity, a real VS Code binary, or shared mutable state.

Retry policy:

- Use 2 retries in CI for Electron startup, renderer timing, or browser timing flakes.
- Treat a retry pass as a stability signal to investigate, not as evidence that the original failure is irrelevant.
- Product-state assertions, audit integrity failures, quota/routing mismatches, and secret leakage findings should be triaged from the first failed attempt.

Artifact collection:

- Screenshots on failure.
- Traces retained on failure or retry.
- Videos retained on failure.
- HTML report, JSON results, and CI-native annotations.
- Renderer console and main-process console logs.
- Failed-run isolated state snapshots when a failure mutates account, capture, governance, quota, routing, audit, or approval stores.

## Nightly Execution Spec

Nightly full runs execute the full suite after smoke and regression suites pass. The purpose is exhaustive coverage of edge cases, malformed persisted data, corruption recovery, boundary limits, race conditions, audit tampering, quota enforcement, routing explainability, daemon recovery, browser capture validation, and E2E isolation fixtures.

Windows is required for every nightly full run. macOS should be included for release-candidate nights, broad platform-sensitive changes, prior macOS-only failures, or any change touching path handling, Electron shell behavior, packaging, or storage fallback behavior.

Parallelization:

- Use two CI workers as the default full-suite shape.
- Maintain isolated `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and `UNIFIED_THEATRE_ENTERPRISE_CONFIG` for every test.
- If the full suite exceeds the 80-120 minute CI target, shard by stable test group or journey area while keeping each shard self-contained.
- Do not parallelize tests through shared external AI services or shared persisted state.

Retry policy:

- Use 2 retries for infrastructure-level and Electron/browser timing flakes.
- Preserve and triage the first failed attempt even if a retry passes.
- Do not let retries hide deterministic failures in audit hash chaining, secret handling, corruption recovery, approval resolution, quota enforcement, or routing policy precedence.

Artifact collection:

- Screenshots on failure.
- Traces retained for failures and retry attempts.
- Videos retained on failure.
- HTML report, JSON results, and CI-native summary.
- Renderer console and main-process console logs.
- Mutated store snapshots for account, secret fallback, browser response, prompt library, workspace policy, approval, quota, routing, audit, and daemon state.
- Audit exports generated during tests.
- Daemon logs and PID/lock diagnostics.
- Captured response files and browser selector fixture outputs.
- Seeded run metadata, environment summary, and shard identifiers for reproducibility.
