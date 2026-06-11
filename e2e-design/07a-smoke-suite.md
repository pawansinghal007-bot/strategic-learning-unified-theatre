# Smoke Suite

## Suite Summary (target runtime, trigger conditions)

- Target runtime: under 5 minutes total on a developer machine or CI runner.
- Recommended budget: 4 tests, single worker, no external AI platform login, no real VS Code restart, no real local LLM inference.
- Trigger conditions:
  - Every pull request that changes `electron-ui/**`, `src/main/**`, `src/accounts/**`, `src/policies/**`, `src/governance/**`, `src/audit/**`, `src/llm/**`, `src/browser-bridge.js`, preload files, IPC handlers, or E2E support.
  - Every merge to the main integration branch.
  - Before release packaging.
- Required mode:
  - Use isolated `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and `UNIFIED_THEATRE_ENTERPRISE_CONFIG`.
  - Use `VSCODE_ROTATOR_MOCK_LLM=1`.
  - Use seeded local data only; do not depend on live ChatGPT, Claude, Gemini, Perplexity, OS keychain, or a real VS Code binary.
- Coverage intent:
  - Prove the Electron app boots.
  - Prove preload/IPC namespaces are available.
  - Prove seeded account/capture state can be read through the UI/API.
  - Prove the core governance happy path writes audit/routing/quota-visible state.

## Test Cases (one subsection per test with all fields)

### SMOKE-001 — App Boots With Preload APIs

- Test ID and name: `SMOKE-001 — App Boots With Preload APIs`
- Objective:
  - Verify the Electron dashboard starts successfully, loads the main window, and exposes the preload namespaces required by all critical journeys.
- Prerequisites:
  - Base E2E isolated state is created.
  - `$HOME/.vscode-rotator/config.json` and `$UNIFIED_THEATRE_ENTERPRISE_CONFIG` are seeded with the clean default config.
  - Electron app launches with `NODE_ENV=test` and `VSCODE_ROTATOR_MOCK_LLM=1`.
- Step-by-step execution flow:
  1. Launch Electron through the `electronApp` fixture.
  2. Resolve the first `mainWindow`.
  3. Wait for the dashboard body to become visible.
  4. Wait for `window.rotator`.
  5. Wait for governance namespaces: `providerPolicy`, `workspacePolicy`, `workspaceApproval`, `workspaceQuota`, `workspaceRouting`, and `audit`.
  6. Read app version through `window.rotator.app.version()`.
  7. Read config through `window.rotator.config.get()`.
- Assertions:
  - Main window is present and not crashed.
  - Dashboard body is visible.
  - `window.rotator.accounts.list`, `window.rotator.browser.listResponses`, and `window.rotator.config.get` are functions.
  - Governance namespaces exist.
  - App version returns a non-empty string.
  - Config contains `policy.features.localDbEnabled === true`, `browserCaptureEnabled === true`, and `llmCommandsEnabled === true`.
- Estimated runtime:
  - 30-45 seconds.

### SMOKE-002 — Seeded Account Appears And Health Is Readable

- Test ID and name: `SMOKE-002 — Seeded Account Appears And Health Is Readable`
- Objective:
  - Verify the account storage/preload/IPC path works for the core account rotation journey without performing a real VS Code restart.
- Prerequisites:
  - Base E2E isolated state is created.
  - One active test account is seeded through `AccountStore` and `SecretStore` helpers.
  - Fake auth target paths are created under isolated `HOME`.
  - App is launched and preload APIs are ready.
- Step-by-step execution flow:
  1. Launch Electron through fixtures.
  2. Open or focus the accounts surface through `AccountsPage`.
  3. Read accounts through the UI if the account list is visible; otherwise read via `window.rotator.accounts.list()`.
  4. Request account details through `window.rotator.accounts.listDetails()`.
  5. Request daemon status through `window.rotator.daemon.status()` or the daemon status badge.
  6. Request health for the seeded account through `window.rotator.accounts.health(accountId)`.
- Assertions:
  - Exactly one seeded account is visible or returned by IPC.
  - Account id, email, `agentType`, and `status` match the seed.
  - Account detail response includes the seeded account.
  - Health response is returned without IPC error.
  - Daemon status surface or IPC response is readable.
- Estimated runtime:
  - 35-50 seconds.

### SMOKE-003 — Captured Response Is Listed

- Test ID and name: `SMOKE-003 — Captured Response Is Listed`
- Objective:
  - Verify the browser capture retrieval happy path using a seeded local captured response, without launching external AI sites.
- Prerequisites:
  - Base E2E isolated state is created.
  - `browserResponsesIngest` may remain `false` for speed.
  - A representative markdown capture is seeded at `$HOME/.vscode-rotator/browser-responses/<timestamp>-chatgpt.md`.
  - App is launched and preload APIs are ready.
- Step-by-step execution flow:
  1. Launch Electron through fixtures.
  2. Open or focus the browser/capture surface through `BrowserPanePage`.
  3. Call `window.rotator.browser.listResponses({ platform: "chatgpt", limit: 5 })`.
  4. Select the seeded response filename.
  5. Call `window.rotator.browser.getResponse(filename)`.
  6. If the response list is visible in the UI, verify the seeded filename appears there as well.
- Assertions:
  - Response list contains the seeded ChatGPT response.
  - Response metadata includes filename, filepath, and content.
  - Response content contains the seeded prompt/response marker.
  - No capture or response IPC call rejects.
- Estimated runtime:
  - 30-45 seconds.

### SMOKE-004 — Governance Happy Path Writes Observable State

- Test ID and name: `SMOKE-004 — Governance Happy Path Writes Observable State`
- Objective:
  - Verify the shortest happy path through workspace governance: set policy/quota, record/read routing state, and verify audit integrity.
- Prerequisites:
  - Base E2E isolated state is created.
  - Empty `.unified-ai-workspace` stores are seeded.
  - Test workspace id is defined, for example `smoke-workspace`.
  - App is launched and preload APIs are ready.
- Step-by-step execution flow:
  1. Launch Electron through fixtures.
  2. Apply a simple provider policy preset through `window.providerPolicy.applyPreset("default")`.
  3. Set a workspace policy override through `window.workspacePolicy.set("smoke-workspace", { routingMode: "hybrid" })`.
  4. Resolve the workspace policy through `window.workspacePolicy.resolve("smoke-workspace")`.
  5. Set a quota through `window.workspaceQuota.set("smoke-workspace", 10, 50, "alert", null)`.
  6. Record one quota usage event through `window.workspaceQuota.recordUsage("smoke-workspace", 1)`.
  7. Evaluate quota through `window.workspaceQuota.evaluate("smoke-workspace")`.
  8. Read routing summary through `window.workspaceRouting.summary("smoke-workspace")`.
  9. Read latest audit events through `window.audit.latest(10)`.
  10. Verify audit integrity through `window.audit.verify()`.
- Assertions:
  - Provider policy preset call succeeds.
  - Workspace policy resolves with source `workspace` or includes the `hybrid` override.
  - Quota policy is stored with daily limit `10`, weekly limit `50`, and mode `alert`.
  - Quota evaluation returns an allowed/non-blocked state for one usage event.
  - Routing summary call returns a valid empty or populated summary object for the workspace.
  - Audit latest includes at least one governance-related event from the test flow.
  - Audit verification returns `ok === true`.
- Estimated runtime:
  - 60-90 seconds.
