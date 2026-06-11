# Full Suite

## Suite Summary (target runtime, trigger conditions)

- Target runtime: 80-120 minutes total on CI with two workers; 110-160 minutes on a developer machine with one worker.
- Recommended budget: 20 tests, isolated per-test state, mostly mocked LLM provider, deterministic local browser fixtures, no live AI platform dependency, no real OS keychain dependency, and no real VS Code binary unless an explicitly gated manual variant is enabled.
- Trigger conditions:
  - Nightly scheduled CI after smoke and regression suites pass.
  - Release candidate validation before production packaging.
  - After broad changes to persistence, encryption/fallback secrets, browser capture selectors, ingestion, workspace governance stores, audit hash chaining, quota enforcement, routing explainability, daemon scheduling, feature flags, or E2E isolation fixtures.
  - On demand for incident reproduction where smoke and regression suites are too shallow to expose the suspected edge.
- Required mode:
  - Use isolated `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and `UNIFIED_THEATRE_ENTERPRISE_CONFIG` for every test.
  - Use `VSCODE_ROTATOR_MOCK_LLM=1` except tests that explicitly validate unavailable local-provider behavior without live inference.
  - Seed accounts through `AccountStore` and `SecretStore` helpers; never hand-write encrypted account or secret files.
  - Seed browser responses, browser selector overrides, workspace stores, approval records, quota usage, routing history, and audit events through E2E fixture helpers.
  - Preserve screenshots, traces, renderer console, main-process console, mutated store snapshots, audit exports, daemon logs, and captured response files on failure.
- Coverage intent:
  - Cover exhaustive scenarios, edge cases, error states, malformed persisted data, boundary limits, race conditions, and recovery behavior not covered by smoke or regression.
  - Avoid duplicating smoke coverage for app boot, preload availability, seeded account readability, seeded capture readability, and shortest governance happy path.
  - Avoid duplicating regression coverage for normal account switching, traceable ingestion, workspace override/context happy paths, sensitive approval approval path, clean audit export, quota alert/block happy paths, provider fallback review, and governance restart consistency.

## Test Cases (one subsection per test with all fields)

### FULL-001 — Account Store Handles Duplicate Missing Disabled And Unsupported Records

- Test ID and name: `FULL-001 — Account Store Handles Duplicate Missing Disabled And Unsupported Records`
- Objective:
  - Verify account list, health, and switch flows fail safely when account metadata includes duplicate emails, missing secrets, disabled accounts, unsupported agent types, and stale active-account pointers.
- Prerequisites:
  - Base E2E isolated state is created.
  - Account helper seeds one valid active account, one duplicate-email account with a distinct id, one disabled account, one account with no secret, one unsupported agent type, and one stale active-account reference.
  - Fake auth target paths exist under isolated `HOME`.
  - Electron app is launched and account APIs are ready.
- Step-by-step execution flow:
  1. Open the accounts surface.
  2. Read account list and details through UI and preload API.
  3. Request health for every seeded account.
  4. Attempt to switch to the disabled account.
  5. Attempt to switch to the missing-secret account.
  6. Attempt to switch to the unsupported agent type account.
  7. Attempt to recover by switching to the valid account.
  8. Read active account state, fake auth target files, and recent audit/error activity.
- Assertions:
  - Duplicate emails remain distinct by id and do not collapse into one row.
  - Disabled, missing-secret, unsupported, and stale-active records show non-healthy or recoverable states.
  - Invalid switch attempts are rejected with clear non-secret errors.
  - Rejected switch attempts do not modify fake auth target files.
  - Valid account recovery succeeds and leaves exactly one active account.
  - UI text, preload responses, logs, and audit/error activity do not expose raw secrets.
- Estimated runtime:
  - 4-6 minutes.

### FULL-002 — Secret Store Fallback And Corruption Recovery

- Test ID and name: `FULL-002 — Secret Store Fallback And Corruption Recovery`
- Objective:
  - Verify account secrets recover safely when OS keychain access is unavailable, fallback secret storage is used, and fallback secret data becomes corrupted or unreadable.
- Prerequisites:
  - Base E2E isolated state is created.
  - Secret helper is configured to use fallback/test-only secret storage.
  - Two accounts are seeded with fallback secrets.
  - A fixture can corrupt or permission-limit `$HOME/.vscode-rotator/secrets.enc`.
- Step-by-step execution flow:
  1. Launch Electron and verify both accounts report healthy secret access.
  2. Close Electron.
  3. Corrupt the fallback secret file with invalid encrypted payload content.
  4. Relaunch Electron and request account health plus account details.
  5. Attempt a switch that requires the corrupted secret.
  6. Restore the secret store through helper reseeding.
  7. Relaunch Electron and attempt the switch again.
- Assertions:
  - Healthy fallback secrets are readable before corruption.
  - Corrupted fallback store produces scoped secret-read failures, not app startup failure.
  - Account metadata remains readable while secrets are unavailable.
  - Switch requiring a corrupted secret is rejected and does not write auth targets.
  - Restored fallback store allows switching again.
  - Error surfaces do not include encrypted payload text or raw token values.
- Estimated runtime:
  - 5-7 minutes.

### FULL-003 — Switch Lock And Stale Daemon PID Recovery

- Test ID and name: `FULL-003 — Switch Lock And Stale Daemon PID Recovery`
- Objective:
  - Verify stale switch locks and stale daemon PID files are detected, cleaned up, and do not block later account or daemon operations.
- Prerequisites:
  - Base E2E isolated state is created.
  - Two valid accounts are seeded.
  - `$HOME/.vscode-rotator/switch.lock` contains a nonexistent PID.
  - `$ROTATOR_STATE_DIR/.vscode-rotator/daemon.pid` contains a nonexistent PID.
- Step-by-step execution flow:
  1. Launch Electron and open shell or daemon status surface.
  2. Read daemon status.
  3. Attempt an account switch.
  4. Wait for stale lock cleanup or replacement.
  5. Read daemon status again.
  6. Close and relaunch Electron.
  7. Inspect lock, daemon PID state, and active account.
- Assertions:
  - Initial daemon state reports stale or recoverable status rather than a healthy false positive.
  - Account switch succeeds after stale lock handling.
  - Stale `switch.lock` is removed or replaced by a valid test-owned lock during the operation.
  - Stale daemon PID does not hang startup or teardown.
  - Restarted app has stable daemon status and no stale lock warning.
- Estimated runtime:
  - 5-7 minutes.

### FULL-004 — Browser Capture Selector Fallback Unknown Platform And Failed Capture

- Test ID and name: `FULL-004 — Browser Capture Selector Fallback Unknown Platform And Failed Capture`
- Objective:
  - Verify browser capture handles selector overrides, invalid selectors, unknown platform URLs, and failed capture attempts without misclassification or empty capture files.
- Prerequisites:
  - Base E2E isolated state is created.
  - Browser capture feature is enabled.
  - Selector override file includes valid selectors for `chatgpt` and intentionally invalid selectors for `claude`.
  - Embedded browser pane uses deterministic local fixture pages for known and unknown platforms.
- Step-by-step execution flow:
  1. Launch Electron and open the browser pane.
  2. Navigate to a ChatGPT-shaped local fixture page and capture with valid selector override.
  3. Navigate to a Claude-shaped fixture page with invalid selectors and attempt capture.
  4. Navigate to an unmapped AI-like fixture page and attempt capture.
  5. List captured responses by platform and all platforms.
  6. Inspect capture status, response files, and renderer console errors.
- Assertions:
  - Valid ChatGPT fixture capture is saved with expected platform and content.
  - Invalid Claude selectors produce a visible or IPC-readable capture error without crashing the pane.
  - Unknown platform capture is rejected or labeled unknown according to contract, never mislabeled as the previous platform.
  - Failed captures do not create empty markdown files.
  - Capture status resets so a later valid capture can run.
- Estimated runtime:
  - 5-7 minutes.

### FULL-005 — Browser Response Ingestion Handles Empty Oversized Malformed And Duplicate Files

- Test ID and name: `FULL-005 — Browser Response Ingestion Handles Empty Oversized Malformed And Duplicate Files`
- Objective:
  - Verify ingestion validates file boundaries and remains idempotent with empty files, malformed markdown, oversized captures, duplicate content, and repeated ingestion attempts.
- Prerequisites:
  - Base E2E isolated state is created.
  - `browserResponsesIngest` is enabled.
  - Browser response directory contains one valid capture, one empty file, one malformed markdown file, one oversized file at or above configured limit, and one duplicate-content file with a different filename.
  - Experience DB and AI memory DB start empty.
- Step-by-step execution flow:
  1. Launch Electron and open browser/capture surface.
  2. Trigger ingestion for all seeded responses.
  3. Read ingestion result summary.
  4. Trigger ingestion a second time with the same files.
  5. Read response list, experience DB-visible summary, and memory DB-visible state.
  6. Restart Electron and read the same summaries again.
- Assertions:
  - Valid capture is ingested exactly once.
  - Empty and malformed files are skipped or reported as validation failures.
  - Oversized file behavior matches configured limit and does not block valid file ingestion.
  - Duplicate content does not create duplicate durable learning records if idempotency is expected.
  - Second ingestion run is idempotent.
  - Restarted app shows stable counts and no DB corruption.
- Estimated runtime:
  - 6-8 minutes.

### FULL-006 — Prompt Library Corruption Duplicate IDs And Length Limits

- Test ID and name: `FULL-006 — Prompt Library Corruption Duplicate IDs And Length Limits`
- Objective:
  - Verify prompt library loading and save flows recover from invalid JSON, duplicate prompt ids, blank prompts, maximum-length prompts, and over-limit prompt content.
- Prerequisites:
  - Base E2E isolated state is created.
  - `$HOME/.vscode-rotator/prompt-library.json` can be seeded with invalid JSON and later repaired.
  - Browser pane or prompt library surface is available.
- Step-by-step execution flow:
  1. Launch Electron and open browser/prompt surface.
  2. Attempt to load a prompt library seeded with invalid JSON.
  3. Replace the library with duplicate ids and blank prompt entries.
  4. Reload prompt library from UI or API.
  5. Add a valid prompt at the maximum supported length.
  6. Attempt to add a prompt exceeding the maximum supported length.
  7. Close and relaunch Electron.
  8. Read prompt library again.
- Assertions:
  - Invalid JSON produces a recoverable error or empty-library fallback.
  - Duplicate ids are rejected, de-duplicated, or clearly surfaced according to contract.
  - Blank prompts cannot be sent to a platform.
  - Maximum-length valid prompt persists across restart.
  - Over-limit prompt is rejected without silently truncating existing valid prompts.
  - Prompt library errors do not prevent account, capture, or governance surfaces from loading.
- Estimated runtime:
  - 4-6 minutes.

### FULL-007 — Workspace Policy Precedence Invalid Override And Enterprise Restriction

- Test ID and name: `FULL-007 — Workspace Policy Precedence Invalid Override And Enterprise Restriction`
- Objective:
  - Verify enterprise policy, provider defaults, and workspace overrides resolve in the correct order while invalid or enterprise-forbidden overrides fail closed.
- Prerequisites:
  - Base E2E isolated state is created.
  - Enterprise config sets one restrictive routing or feature rule.
  - Provider policy is seeded with a default routing mode.
  - Workspace override store contains one valid override, one unknown workspace id, one invalid routing mode, and one enterprise-forbidden change.
- Step-by-step execution flow:
  1. Launch Electron and open workspace policy surface.
  2. Resolve policy for valid, unknown, and enterprise-restricted workspaces.
  3. Attempt to save an invalid routing mode.
  4. Attempt to save the enterprise-forbidden override.
  5. Remove the valid workspace override.
  6. Resolve policy again.
  7. Read persisted overrides and latest audit/error events.
- Assertions:
  - Valid workspace resolves with expected source precedence.
  - Unknown workspace falls back without creating a phantom override.
  - Invalid routing mode is rejected with validation error.
  - Enterprise-forbidden override is rejected and does not weaken enterprise policy.
  - Removing an override restores expected fallback policy.
  - Audit/error events identify attempted invalid or forbidden changes.
- Estimated runtime:
  - 5-7 minutes.

### FULL-008 — Workspace Context Redacts Secrets Excludes Unsafe Files And Enforces Size Bounds

- Test ID and name: `FULL-008 — Workspace Context Redacts Secrets Excludes Unsafe Files And Enforces Size Bounds`
- Objective:
  - Verify workspace context collection excludes secret-like content, honors hard exclude patterns, handles binary and oversized files, and enforces maximum context size.
- Prerequisites:
  - Base E2E isolated state is created.
  - Test workspace contains normal source, markdown notes, `.env`, `.pem`, binary-like file, excluded `node_modules` file, and a file above the configured size limit.
  - Workspace context feature is enabled.
- Step-by-step execution flow:
  1. Launch Electron and open workspace surface.
  2. Save context settings for the test workspace.
  3. Trigger context collection or routing for that workspace.
  4. Read routing explanation and context summary.
  5. Attempt to explicitly include an over-limit or hard-excluded file.
  6. Restart Electron and read persisted context settings.
- Assertions:
  - Normal source and markdown files are included in context summary.
  - `.env`, key, binary-like, excluded directory, and over-limit files are omitted or redacted.
  - Routing explanation reports context counts and sources without leaking secret file content.
  - Explicit unsafe include is rejected or clipped with an auditable warning.
  - Persisted context settings survive restart.
- Estimated runtime:
  - 6-8 minutes.

### FULL-009 — Approval Expiry Rejection Cancellation And Double Resolution

- Test ID and name: `FULL-009 — Approval Expiry Rejection Cancellation And Double Resolution`
- Objective:
  - Verify approval workflows handle rejection, cancellation, expiry, repeated resolution, and stale approval ids without applying policy changes incorrectly.
- Prerequisites:
  - Base E2E isolated state is created.
  - Approval-required policy changes are enabled.
  - Fixture can seed active, expired, cancelled, and already-resolved approval records.
- Step-by-step execution flow:
  1. Launch Electron and open approvals surface.
  2. Request a sensitive policy change and reject it with a reason.
  3. Verify the rejected change did not apply.
  4. Request another sensitive change and cancel it.
  5. Attempt to approve an expired seeded request.
  6. Attempt to approve an already-approved request a second time through API.
  7. Attempt to resolve an unknown approval id.
  8. Read workspace policy and audit events.
- Assertions:
  - Rejected and cancelled requests do not apply policy changes.
  - Expired requests cannot be approved.
  - Already-resolved requests cannot be resolved a second time.
  - Unknown approval id returns a clear not-found error.
  - Audit events preserve request, rejection, cancellation, expiry, and invalid-resolution evidence.
  - Resolution reason and actor metadata do not overwrite original requester metadata.
- Estimated runtime:
  - 6-8 minutes.

### FULL-010 — Audit Hash Chain Detects Modified Deleted Reordered And Appended Events

- Test ID and name: `FULL-010 — Audit Hash Chain Detects Modified Deleted Reordered And Appended Events`
- Objective:
  - Verify audit verification detects tampering patterns beyond clean export: modified payloads, deleted middle events, reordered events, and invalid appended events.
- Prerequisites:
  - Base E2E isolated state is created.
  - At least five valid audit-producing governance actions are seeded or performed.
  - Clean backup audit fixtures are available between tamper sub-scenarios.
- Step-by-step execution flow:
  1. Launch Electron and verify audit integrity is initially OK.
  2. Close Electron and mutate one audit event payload.
  3. Relaunch and verify integrity.
  4. Restore clean audit log, delete one middle event, and verify again.
  5. Restore clean audit log, reorder two events, and verify again.
  6. Restore clean audit log, append an invalid event, and verify again.
  7. Attempt export after a tampered state.
- Assertions:
  - Clean chain verifies successfully before tampering.
  - Modified, deleted, reordered, and invalid-appended logs each fail verification.
  - UI integrity badge and `window.audit.verify()` agree.
  - Export after tamper includes failed integrity status and never claims verified success.
  - Audit latest remains readable even when integrity fails.
- Estimated runtime:
  - 7-9 minutes.

### FULL-011 — Audit Export Handles Empty Large Special Character And Unwritable Targets

- Test ID and name: `FULL-011 — Audit Export Handles Empty Large Special Character And Unwritable Targets`
- Objective:
  - Verify audit export works for empty logs and large logs, escapes user-controlled text, and fails clearly for unwritable destinations.
- Prerequisites:
  - Base E2E isolated state is created.
  - Test-owned export directories include one writable path and one unwritable path under the isolated run root.
  - Large audit fixture can generate at least 1,000 events with quotes, HTML-like strings, long reasons, and escaped Unicode-like text.
- Step-by-step execution flow:
  1. Launch Electron with an empty audit log.
  2. Export empty audit log as JSON and HTML.
  3. Seed or generate 1,000 audit events.
  4. Export large log as JSON and HTML.
  5. Attempt export to unwritable path.
  6. Parse JSON export and inspect HTML export through test helpers.
- Assertions:
  - Empty export succeeds with zero events and valid integrity metadata.
  - Large export completes within expected timeout.
  - JSON export parses and contains expected event count.
  - HTML export escapes user-controlled strings and does not include raw script markup.
  - Unwritable export fails with a clear error and no false success state.
  - Partial export artifacts are absent or marked failed according to contract.
- Estimated runtime:
  - 5-7 minutes.

### FULL-012 — Quota Daily Weekly Reset And Exact Boundary Evaluation

- Test ID and name: `FULL-012 — Quota Daily Weekly Reset And Exact Boundary Evaluation`
- Objective:
  - Verify quota evaluation at zero, one below limit, exactly at limit, one above limit, daily reset, weekly reset, and negative/zero-limit boundaries.
- Prerequisites:
  - Base E2E isolated state is created.
  - Workspace quota policy is enabled for `quota-boundary-workspace`.
  - Fixture can seed usage timestamps for current day, previous day, current week, and previous week.
- Step-by-step execution flow:
  1. Launch Electron and open quota surface.
  2. Set daily limit to `3`, weekly limit to `5`, and mode to `block`.
  3. Evaluate with zero usage, one below daily limit, exactly daily limit, and one above daily limit.
  4. Seed usage across daily and weekly boundaries.
  5. Evaluate daily reset and weekly reset behavior.
  6. Attempt zero and negative quota limits through UI/API.
  7. Read quota notifications and audit events.
- Assertions:
  - Zero and one-below-limit states are allowed.
  - Exactly-at-limit behavior matches contract and is consistent in UI/API.
  - Above-limit state blocks in block mode.
  - Daily reset clears daily exceeded state without clearing valid weekly usage.
  - Weekly reset excludes previous-week usage.
  - Zero and negative limit inputs are rejected or interpreted according to contract, never silently misapplied.
  - Audit/notification state reflects each boundary transition.
- Estimated runtime:
  - 6-8 minutes.

### FULL-013 — Quota Fallback Mode And Cross Workspace Notification Isolation

- Test ID and name: `FULL-013 — Quota Fallback Mode And Cross Workspace Notification Isolation`
- Objective:
  - Verify fallback-mode quota enforcement routes to fallback provider and quota notifications remain scoped under concurrent workspace usage.
- Prerequisites:
  - Base E2E isolated state is created.
  - Provider policy contains primary and fallback providers.
  - Three workspaces have quota policies: fallback mode, alert mode, and block mode.
  - Routing and quota stores start clean.
- Step-by-step execution flow:
  1. Launch Electron.
  2. Exceed quota for all three workspaces in quick succession.
  3. Request routing decisions for all three workspaces.
  4. Open quota notifications and routing history.
  5. Read persisted quota and routing stores.
- Assertions:
  - Fallback-mode workspace routes to fallback provider with quota fallback explanation.
  - Alert-mode and block-mode workspaces keep their distinct behaviors without cross-contamination.
  - Notifications are workspace-scoped and contain correct mode, limit, and usage.
  - Persisted routing history links each decision to the correct workspace and quota mode.
  - Provider usage is incremented only for allowed or fallback-routed requests.
- Estimated runtime:
  - 5-7 minutes.

### FULL-014 — Routing Handles All Providers Unavailable Stale Health And Recovery

- Test ID and name: `FULL-014 — Routing Handles All Providers Unavailable Stale Health And Recovery`
- Objective:
  - Verify routing decisions handle unhealthy, stale, disabled, unknown, all-unavailable, and recovered provider states with complete explanations.
- Prerequisites:
  - Base E2E isolated state is created.
  - Provider policy includes at least four providers with ordered preference.
  - Provider health store is seeded with healthy, unhealthy, stale, disabled, and unknown states.
- Step-by-step execution flow:
  1. Launch Electron and open routing surface.
  2. Request routing when preferred provider is unhealthy.
  3. Mark fallback provider stale and request routing again.
  4. Disable a provider and request routing.
  5. Mark all providers unavailable and request routing.
  6. Restore one provider to healthy and request routing again.
  7. Read routing history through UI, preload API, and persisted JSON.
- Assertions:
  - Routing skips unhealthy or disabled providers.
  - Stale and unknown health states are handled according to contract and explained.
  - All-unavailable state returns deterministic blocked/no-provider result.
  - Recovered provider can be selected again.
  - Every routing record includes chosen provider or no-provider result, candidates considered, policy source, health reason, timestamp, and fallback reason when applicable.
  - UI/API/persisted routing history agree on order and content.
- Estimated runtime:
  - 6-8 minutes.

### FULL-015 — Routing History Large Dataset Filtering Pagination And Export Boundaries

- Test ID and name: `FULL-015 — Routing History Large Dataset Filtering Pagination And Export Boundaries`
- Objective:
  - Verify routing history remains usable with large data, duplicate timestamps, long explanations, combined filters, pagination boundaries, and filtered export.
- Prerequisites:
  - Base E2E isolated state is created.
  - Routing history fixture seeds at least 500 decisions across providers, workspaces, modes, quota states, and duplicate timestamps.
  - Routing page supports table filters or equivalent preload summary filters.
- Step-by-step execution flow:
  1. Launch Electron and open routing history surface.
  2. Verify first page loads.
  3. Apply workspace, provider, date/recent-limit, and text filters.
  4. Navigate first, next, last, and previous pagination boundaries.
  5. Inspect a long explanation row.
  6. Export filtered routing history if export is supported.
- Assertions:
  - Large table loads within timeout without renderer crash.
  - Combined filters return only matching records.
  - Duplicate timestamps keep deterministic secondary ordering.
  - Pagination does not skip or duplicate records at page boundaries.
  - Long explanations do not break table layout or export structure.
  - Exported filtered data matches visible/API-filtered result count.
- Estimated runtime:
  - 5-7 minutes.

### FULL-016 — Feature Flags Fail Closed Across UI IPC And Persisted State

- Test ID and name: `FULL-016 — Feature Flags Fail Closed Across UI IPC And Persisted State`
- Objective:
  - Verify disabling `localDbEnabled`, `browserCaptureEnabled`, or `llmCommandsEnabled` blocks only the intended operations and leaves unrelated surfaces readable.
- Prerequisites:
  - Base E2E isolated state is created.
  - Enterprise config can be restarted with each feature flag disabled one at a time.
  - Seeded account, captured response fixture, and governance stores are available.
- Step-by-step execution flow:
  1. Launch with `browserCaptureEnabled: false` and attempt capture plus ingestion.
  2. Verify accounts and governance surfaces still load.
  3. Relaunch with `localDbEnabled: false` and attempt DB-backed ingestion or memory operation.
  4. Verify file-backed governance stores remain readable if contract permits.
  5. Relaunch with `llmCommandsEnabled: false` and attempt mocked LLM command path.
  6. Read error surfaces, persisted stores, and logs.
- Assertions:
  - Disabled browser capture blocks capture and ingestion with clear error.
  - Disabled local DB blocks DB-backed operations without corrupting DB files.
  - Disabled LLM commands block LLM command execution while leaving policy inspection available.
  - Unrelated surfaces remain readable.
  - UI, preload IPC, and persisted config state agree on disabled feature state.
  - Disabled operations fail closed and do not silently perform work.
- Estimated runtime:
  - 7-10 minutes.

### FULL-017 — Corrupted Governance Stores Recover Without Cross Store Reset

- Test ID and name: `FULL-017 — Corrupted Governance Stores Recover Without Cross Store Reset`
- Objective:
  - Verify malformed governance JSON in one store does not reset or corrupt unrelated provider, workspace, approval, quota, routing, or audit stores.
- Prerequisites:
  - Base E2E isolated state is created.
  - Each `.unified-ai-workspace` JSON store can be corrupted independently through fixture helper.
  - Clean backup fixtures are available for restoration between sub-scenarios.
- Step-by-step execution flow:
  1. Corrupt `provider-policy.json` with invalid JSON and launch Electron.
  2. Read provider policy and unrelated quota state.
  3. Restore provider policy and corrupt `workspace-approvals.json` with wrong root shape.
  4. Relaunch and open approvals plus audit surfaces.
  5. Restore approvals and corrupt `workspace-quotas.json` with partial-write content.
  6. Relaunch and open quota plus routing surfaces.
  7. Restore quotas and corrupt `routing-history.json` with mixed invalid records.
  8. Relaunch and read routing summary.
- Assertions:
  - Each corrupted store produces a scoped error or safe empty fallback.
  - Unrelated stores remain readable and are not reset due to another store's corruption.
  - App startup never hangs or crashes on malformed governance JSON.
  - Writes after recovery go to the correct store only.
  - Error messages identify store type without exposing unnecessary host paths.
  - Clean restored stores resume normal behavior.
- Estimated runtime:
  - 8-10 minutes.

### FULL-018 — Concurrent Governance Writes Preserve Valid JSON And Event Counts

- Test ID and name: `FULL-018 — Concurrent Governance Writes Preserve Valid JSON And Event Counts`
- Objective:
  - Verify simultaneous policy updates, quota usage records, approval resolutions, and routing writes do not lose accepted events or produce torn JSON writes.
- Prerequisites:
  - Base E2E isolated state is created.
  - Electron app is launched and preload APIs are ready.
  - Test uses bounded concurrency from renderer or test process.
- Step-by-step execution flow:
  1. Start 20 concurrent workspace policy updates across five workspaces.
  2. Start 50 quota usage record requests across the same workspaces.
  3. Start 10 approval request/resolve pairs.
  4. Start 50 routing decision records.
  5. Wait for all operations to settle.
  6. Read all governance stores from UI/API.
  7. Close and relaunch Electron.
  8. Parse persisted JSON files and verify audit integrity.
- Assertions:
  - No operation rejects with parse errors, torn writes, or unhandled IPC errors.
  - Persisted JSON files parse successfully after the burst.
  - Final policy state per workspace is deterministic according to last-write or version contract.
  - Quota usage count equals accepted usage writes.
  - Approval records are each resolved at most once.
  - Routing history contains all accepted records.
  - Audit verification remains OK.
- Estimated runtime:
  - 7-10 minutes.

### FULL-019 — Daemon Scheduled Capture Enhancement And Error Isolation

- Test ID and name: `FULL-019 — Daemon Scheduled Capture Enhancement And Error Isolation`
- Objective:
  - Verify watcher daemon scheduled capture and enhancement tasks handle one failing task without preventing later successful scheduled work.
- Prerequisites:
  - Base E2E isolated state is created.
  - `captureSchedule.enabled` and `enhanceSchedule.enabled` are enabled with short test intervals.
  - One capture fixture intentionally fails selector lookup and a later fixture succeeds.
  - Mock LLM enhancement is configured.
- Step-by-step execution flow:
  1. Launch Electron and confirm daemon status.
  2. Wait for first scheduled capture attempt.
  3. Wait for scheduled enhancement attempt.
  4. Switch fixture state from failing capture to valid capture.
  5. Wait for second scheduled capture.
  6. Read daemon log/status, captured responses, enhancement output, and audit/activity events.
  7. Close Electron and verify test-owned daemon teardown.
- Assertions:
  - First capture failure is logged and surfaced without killing daemon.
  - Enhancement task still runs after capture failure.
  - Later valid capture succeeds.
  - Schedule interval does not create overlapping duplicate runs for the same task.
  - Daemon status reports healthy or degraded accurately.
  - Test-owned daemon process exits during teardown.
- Estimated runtime:
  - 8-12 minutes.

### FULL-020 — Storage Monitor Missing Huge Deep And Permission Limited Paths

- Test ID and name: `FULL-020 — Storage Monitor Missing Huge Deep And Permission Limited Paths`
- Objective:
  - Verify storage monitoring indexes configured paths safely when paths are missing, deeply nested, very large, deleted mid-run, or permission-limited.
- Prerequisites:
  - Base E2E isolated state is created.
  - Config `storagePaths` includes one valid small path, one missing path, one deep path, one path with many files, and one test-owned permission-limited path.
  - Storage monitor index and snapshot stores start empty.
- Step-by-step execution flow:
  1. Launch Electron.
  2. Trigger storage monitor scan through UI/API/daemon path.
  3. Wait for scan completion or timeout status.
  4. Read storage index and snapshot.
  5. Delete one previously indexed path.
  6. Trigger scan again.
  7. Read daemon/storage health state.
- Assertions:
  - Valid small and deep paths are indexed.
  - Missing and deleted paths are reported as unavailable without crashing scan.
  - Large path scan respects timeout or max-entry limits.
  - Permission-limited path reports access error without leaking paths outside the isolated root.
  - Snapshot updates atomically and remains valid JSON.
  - Storage health status reflects partial failure rather than all-good.
- Estimated runtime:
  - 5-8 minutes.

## Suite Summary Table (table: Suite | Test Count | Runtime | Trigger)

| Suite | Test Count | Runtime | Trigger |
| --- | ---: | --- | --- |
| Full Suite | 20 | 80-120 minutes on CI with two workers; 110-160 minutes on one local worker | Nightly CI after smoke/regression, release candidate validation, broad persistence/governance/capture/routing changes, and incident reproduction beyond smoke or regression coverage |
