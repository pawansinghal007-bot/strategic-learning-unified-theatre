# Dead Code Audit — Triaged Report (v3)

Generated from `output/audit-real-v3/function_catalog.csv`

| Metric | Value |
|--------|-------|
| Total functions scanned | 1518 |
| Zero-total rows | 80 |
| **False positives** | **78** |
| **Genuine dead code** | **2** |
| **Needs human judgment** | **0** |

---

## 1. FALSE POSITIVES — Framework/String-Wired

These functions have zero call-site references but are **live**.

### A. React/JSX Components — Framework-wired via JSX render tree

Components are invoked as `<ComponentName>` in JSX, not as function calls.

| File | Function | Line |
|------|----------|------|
| `renderer/App.jsx` | `App` | 213 |
| `renderer/App.jsx` | `handleEditTemplate` | 282 |
| `renderer/App.jsx` | `handleRefresh` | 287 |
| `renderer/App.jsx` | `onKey` | 251 |
| `renderer/App.jsx` | `onStorage` | 115 |
| `renderer/BrowserPanel.jsx` | `BrowserPanel` | 21 |
| `renderer/Logs.jsx` | `Logs` | 5 |
| `renderer/TrainingStatus.jsx` | `TrainingStatus` | 48 |
| `renderer/components/Sidebar.jsx` | `NavItem` | 392 |
| `renderer/components/Sidebar.jsx` | `PickerRow` | 485 |
| `renderer/components/Sidebar.jsx` | `Sidebar` | 188 |
| `renderer/components/Sidebar.jsx` | `pickTheme` | 205 |
| `renderer/components/StatusBar.jsx` | `StatusBar` | 35 |
| `renderer/main.jsx` | `Root` | 6 |
| `renderer/screens/Accounts.jsx` | `Accounts` | 35 |
| `renderer/screens/Accounts.jsx` | `StatusChip` | 19 |
| `renderer/screens/Accounts.jsx` | `handleManualAdd` | 117 |
| `renderer/screens/Accounts.jsx` | `handleOpenLoginPage` | 145 |
| `renderer/screens/BrowserAutomation.jsx` | `BrowserAutomation` | 10 |
| `renderer/screens/BrowserAutomation.jsx` | `handleCopyToEditor` | 84 |
| `renderer/screens/BrowserAutomation.jsx` | `handleLogin` | 61 |
| `renderer/screens/BrowserAutomation.jsx` | `handleSend` | 39 |
| `renderer/screens/BrowserAutomation.jsx` | `handleUseTemplate` | 77 |
| `renderer/screens/Dashboard.jsx` | `Dashboard` | 3 |
| `renderer/screens/LiveFeed.jsx` | `LiveFeed` | 3 |
| `renderer/screens/LocalLLM.jsx` | `LocalLLM` | 8 |
| `renderer/screens/LocalLLM.jsx` | `handleAsk` | 45 |
| `renderer/screens/LocalLLM.jsx` | `handleSetup` | 31 |
| `renderer/screens/ProgressLog.jsx` | `ProgressLog` | 4 |
| `renderer/screens/PromptTemplates.jsx` | `PromptTemplates` | 6 |
| `renderer/screens/PromptTemplates.jsx` | `saveButtonLabel` | 101 |
| `renderer/screens/PromptTemplates.jsx` | `savePrompt` | 48 |
| `renderer/screens/PromptTemplates.jsx` | `startNew` | 95 |
| `renderer/screens/RobotFramework.jsx` | `RobotFramework` | 10 |
| `renderer/screens/RobotFramework.jsx` | `runSelectedRobotFile` | 91 |
| `renderer/screens/RobotFramework.jsx` | `runTddCheck` | 119 |
| `renderer/screens/Settings.jsx` | `Settings` | 3 |

**Subtotal: 37 functions**

### B. Test Fixtures — Test-only helpers

These are defined in test files and used only within the test framework.

| File | Function | Line |
|------|----------|------|
| `test-bc2-integration.js` | `assertApiReachable` | 119 |
| `test-bc2-integration.js` | `assertEventStats` | 125 |
| `test-bc2-integration.js` | `assertSearchResults` | 147 |
| `tests/audit-log.test.js` | `mockJoin` | 46 |
| `tests/browser-bridge.test.js` | `mockLaunch` | 79 |
| `tests/config-validation.test.js` | `withHomeDir` | 26 |
| `tests/idea-store-extra-coverage.test.js` | `gm` | 347 |
| `tests/llm/gateway-prompt-budget.test.ts` | `containsTailPortion` | 71 |
| `tests/llm/gateway-prompt-budget.test.ts` | `countOccurrences` | 58 |
| `tests/llm/gateway-prompt-budget.test.ts` | `makeToolResultBlock` | 46 |
| `tests/regression/ingestion-error-handling.test.js` | `rejectHandler` | 317 |
| `tests/storage/symbol-extractor.test.ts` | `MyComponent` | 320 |
| `tests/storage/symbol-extractor.test.ts` | `Widget` | 330 |
| `tests/storage/symbol-extractor.test.ts` | `alpha` | 290 |
| `tests/storage/symbol-extractor.test.ts` | `beta` | 291 |
| `tests/storage/symbol-extractor.test.ts` | `doWork` | 395 |
| `tests/storage/symbol-extractor.test.ts` | `greet` | 166 |
| `tests/storage/symbol-extractor.test.ts` | `hello` | 311 |
| `tests/storage/symbol-extractor.test.ts` | `longSig` | 302 |
| `tests/storage/symbol-extractor.test.ts` | `transform` | 385 |
| `tests/test-runner-branch-gaps.test.js` | `x` | 468 |
| `tests/test-runner-branch-gaps.test.js` | `y` | 492 |
| `tests/test-runner-coverage.test.js` | `thing` | 393 |
| `tests/test-runner.test.js` | `doThing` | 102 |
| `tests/test_repo_function_audit.py` | `test_find_references_counts_same_file_usage_without_definition_line` | 18 |
| `tests/ui/dashboard.test.js` | `buildMinimalDOM` | 7708 |
| `tests/ui/dashboard.test.js` | `runCompare` | 4887 |
| `tests/ui/helpers/electronUi.js` | `getStyleSnapshot` | 39 |

**Subtotal: 28 functions**

### C. Same-File Usage — Scanner Regex Missed

These functions ARE called within their own file or via dynamic dispatch, but the scanner missed the pattern.

| File | Function | Actual Usage |
|------|----------|--------------|
| `scripts/chaos/scenarios/burst-load.js` | `burstLoadScenario` | Path-invoked via dynamic require(readdir) in run-chaos.js |
| `scripts/chaos/scenarios/corrupt-config.js` | `corruptConfigScenario` | Path-invoked via dynamic require(readdir) in run-chaos.js |
| `scripts/chaos/scenarios/kill-daemon.js` | `killDaemonScenario` | Path-invoked via dynamic require(readdir) in run-chaos.js |
| `scripts/chaos/utils.js` | `finishWhenElapsed` | Path-invoked via dynamic require(readdir) in run-chaos.js |
| `src/accounts/store.js` | `serializeAccount` | .map(serializeAccount) on line 118 |
| `src/commands/ai.js` | `loadAiMemoryContext` | Path-invoked via tests/ai.test.js |
| `src/commands/storage.js` | `shutdown` | Wired to SIGINT/SIGTERM on lines 35-36 |
| `src/llm/prompt-generator.js` | `sprintSummary` | .map(sprintSummary) on line 128 |
| `src/llm/routing-history.ts` | `toTimelineEntry` | Exported on line 286 |
| `src/security/secrets/gitleaks-runner.ts` | `normalizeFinding` | .map(normalizeFinding) on line 200 |
| `src/security/security-overview/ai-explain.ts` | `normalizeFindingForPrompt` | Called on lines 135, 246 |
| `src/ui/dashboard.js` | `loadUnifiedView` | Event listener on line 721 |
| `vscode-extension/extension.js` | `flushStagedSignals` | VS Code command registration on line 116 |

**Subtotal: 13 functions**

---

## 2. GENUINE DEAD-CODE CANDIDATES

These functions have no references — not cross-file, not same-file, not framework-wired.

| File | Function | Line | Rationale |
|------|----------|------|-----------|
| `electron-tray/main.js` | `handleDaemonEvent` | 167 | Defined but never wired to IPC, events, or called |
| `scripts/install.js` | `runNpmLink` | 30 | Defined but never called by main() or any other function |

**Subtotal: 2 functions**

---

## 3. NEEDS HUMAN JUDGMENT

These functions require manual review to determine if they are dead code or live via obscure wiring.

| File | Function | Line | Question |
|------|----------|------|----------|

**Subtotal: 0 functions**

---

## Scanner Blind Spots Identified

1. **Callback references**: `.map(fnName)` — regex looks for `fnName(` not `fnName)`
2. **setTimeout/closure references**: `setTimeout(fnName, ...)` — scanner may miss
3. **Event emitter wiring**: `process.on('SIGINT', fnName)` — not counted
4. **Export statements**: `export { fnName }` — not counted
5. **JSX component composition**: `<ComponentName>` — not a function call
6. **VS Code command registration**: `registerCommand('...', fnName)` — not counted
7. **Arrow function closures**: `const fn = () => {}` inside another function
8. **Dynamic require via readdir**: `require(path.join(dir, file))` — path-invoked, not name-invoked