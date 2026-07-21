# Function Catalog

Repo: `Solution`

Generated from: `/home/pawan/vscodeagent/Solution`

## Audit steps

1. Run the script at the repo root.
2. Review rows with low live_confidence first.
3. Validate framework wiring, reflection, decorators, and config-based dispatch.
4. Fill owner_review and status. Suggested status values: keep, verify, remove, merge, rename.

## Snapshot

- Total functions found: 1591
- js: 936
- jsx: 73
- py: 24
- ts: 558

## Catalog columns

- function_name: function or method identifier.
- visibility: public, internal, or test-only heuristic.
- invocation_type: route, CLI, scheduler, handler, test, or direct.
- live_confidence: high, medium, low heuristic based on references and entry-point clues.

## Review table

| function_name | file_path | line | visibility | invocation_type | live_confidence | owner_review | status |
|---|---|---:|---|---|---|---|---|
| waitForApi | `e2e/base.ts` | 51 | public | Direct | high |  |  |
| writeJson | `e2e/regression/approval-audit-compliance.spec.ts` | 114 | test-only | Test | medium |  |  |
| createIsolatedState | `e2e/regression/approval-audit-compliance.spec.ts` | 119 | test-only | Test | medium |  |  |
| writeJson | `e2e/regression/workspace-policy-context-routing.spec.ts` | 95 | test-only | Test | medium |  |  |
| createIsolatedState | `e2e/regression/workspace-policy-context-routing.spec.ts` | 100 | test-only | Test | medium |  |  |
| writeJson | `e2e/smoke/account-rotation-ai-capture.spec.ts` | 98 | test-only | Test | medium |  |  |
| createIsolatedState | `e2e/smoke/account-rotation-ai-capture.spec.ts` | 103 | test-only | Test | medium |  |  |
| seedAccount | `e2e/smoke/account-rotation-ai-capture.spec.ts` | 196 | test-only | Test | medium |  |  |
| loadIcon | `electron-tray/main.js` | 31 | internal | CLI | high |  |  |
| getStateFromAccounts | `electron-tray/main.js` | 36 | internal | CLI | high |  |  |
| truncate | `electron-tray/main.js` | 44 | internal | CLI | high |  |  |
| pickCurrentAccount | `electron-tray/main.js` | 50 | internal | CLI | high |  |  |
| refreshAccounts | `electron-tray/main.js` | 60 | internal | CLI | high |  |  |
| buildMenu | `electron-tray/main.js` | 74 | internal | CLI | high |  |  |
| updateTray | `electron-tray/main.js` | 150 | internal | CLI | high |  |  |
| initializeTray | `electron-tray/main.js` | 158 | internal | CLI | high |  |  |
| handleDaemonEvent | `electron-tray/main.js` | 167 | internal | CLI, Path-invoked | high |  |  |
| init_collection | `index_repo.py` | 102 | internal | Direct | medium |  |  |
| is_text_file | `index_repo.py` | 116 | internal | Direct | medium |  |  |
| chunk_text | `index_repo.py` | 135 | internal | Direct | medium |  |  |
| embed | `index_repo.py` | 145 | internal | Direct | medium |  |  |
| chunk_id | `index_repo.py` | 157 | internal | Direct | medium |  |  |
| remove_existing_file | `index_repo.py` | 166 | internal | Direct | medium |  |  |
| index_file | `index_repo.py` | 183 | internal | Direct | medium |  |  |
| scan_repo | `index_repo.py` | 229 | internal | Direct | medium |  |  |
| parseToolArgs | `live-harness.ts` | 5 | internal | Direct | medium |  |  |
| should_skip | `output/repo_function_audit.py` | 42 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| is_text_code | `output/repo_function_audit.py` | 52 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| safe_read | `output/repo_function_audit.py` | 55 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| line_number | `output/repo_function_audit.py` | 61 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| visibility | `output/repo_function_audit.py` | 64 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| invocation_type | `output/repo_function_audit.py` | 74 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| parse_functions | `output/repo_function_audit.py` | 86 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| find_references | `output/repo_function_audit.py` | 133 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| confidence | `output/repo_function_audit.py` | 175 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| detect_path_invoked | `output/repo_function_audit.py` | 187 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| repo_name | `output/repo_function_audit.py` | 210 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| main | `output/repo_function_audit.py` | 213 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| detect_path_invoked_test | `output/test_detect_path.py` | 4 | test-only | Direct | medium |  |  |
| getCapabilities | `plugins/acme-browser-platform.js` | 3 | public | Direct | high |  |  |
| getCapabilities | `plugins/acme-llm-provider.js` | 3 | public | Direct | high |  |  |
| getCapabilities | `plugins/sample-healthcheck.js` | 3 | public | Direct | high |  |  |
| TopBar | `renderer/App.jsx` | 108 | internal | Handler | high |  |  |
| onStorage | `renderer/App.jsx` | 115 | internal | Handler | high |  |  |
| App | `renderer/App.jsx` | 213 | public | Handler | high |  |  |
| handler | `renderer/App.jsx` | 230 | internal | Handler | high |  |  |
| onKey | `renderer/App.jsx` | 251 | internal | Handler | high |  |  |
| handleEditTemplate | `renderer/App.jsx` | 282 | internal | Handler | high |  |  |
| handleRefresh | `renderer/App.jsx` | 287 | internal | Handler | high |  |  |
| BrowserPanel | `renderer/BrowserPanel.jsx` | 21 | public | CLI | high |  |  |
| handlePlatformClick | `renderer/BrowserPanel.jsx` | 32 | internal | CLI | high |  |  |
| handleCapture | `renderer/BrowserPanel.jsx` | 50 | internal | CLI | high |  |  |
| Logs | `renderer/Logs.jsx` | 5 | public | Direct | high |  |  |
| formatRelativeTime | `renderer/TrainingStatus.jsx` | 10 | internal | Direct | medium |  |  |
| TrainingStatus | `renderer/TrainingStatus.jsx` | 48 | public | Direct | high |  |  |
| Sidebar | `renderer/components/Sidebar.jsx` | 188 | public | Direct | high |  |  |
| pickTheme | `renderer/components/Sidebar.jsx` | 205 | internal | Direct | medium |  |  |
| NavItem | `renderer/components/Sidebar.jsx` | 392 | internal | Direct | medium |  |  |
| PickerRow | `renderer/components/Sidebar.jsx` | 485 | internal | Direct | medium |  |  |
| collectStatuses | `renderer/components/StatusBar.jsx` | 7 | internal | Direct | medium |  |  |
| deriveStatus | `renderer/components/StatusBar.jsx` | 18 | internal | Direct | medium |  |  |
| StatusBar | `renderer/components/StatusBar.jsx` | 35 | public | Direct | high |  |  |
| refresh | `renderer/components/StatusBar.jsx` | 40 | internal | Direct | medium |  |  |
| Root | `renderer/main.jsx` | 6 | internal | Direct | medium |  |  |
| StatusChip | `renderer/screens/Accounts.jsx` | 19 | internal | Direct | medium |  |  |
| Accounts | `renderer/screens/Accounts.jsx` | 35 | public | Direct | high |  |  |
| loadHealth | `renderer/screens/Accounts.jsx` | 54 | internal | Direct | medium |  |  |
| load | `renderer/screens/Accounts.jsx` | 66 | internal | Direct | medium |  |  |
| doSwitch | `renderer/screens/Accounts.jsx` | 91 | internal | Direct | medium |  |  |
| refreshHealth | `renderer/screens/Accounts.jsx` | 111 | internal | Direct | medium |  |  |
| updateForm | `renderer/screens/Accounts.jsx` | 115 | internal | Direct | medium |  |  |
| handleManualAdd | `renderer/screens/Accounts.jsx` | 117 | internal | Direct | medium |  |  |
| getLoginUrl | `renderer/screens/Accounts.jsx` | 139 | internal | Direct | medium |  |  |
| handleOpenLoginPage | `renderer/screens/Accounts.jsx` | 145 | internal | Direct | medium |  |  |
| handleCapture | `renderer/screens/Accounts.jsx` | 155 | internal | Direct | medium |  |  |
| BrowserAutomation | `renderer/screens/BrowserAutomation.jsx` | 10 | public | Direct | high |  |  |
| refresh | `renderer/screens/BrowserAutomation.jsx` | 22 | internal | Direct | medium |  |  |
| handleSend | `renderer/screens/BrowserAutomation.jsx` | 39 | internal | Direct | medium |  |  |
| handleLogin | `renderer/screens/BrowserAutomation.jsx` | 61 | internal | Direct | medium |  |  |
| handleUseTemplate | `renderer/screens/BrowserAutomation.jsx` | 77 | internal | Direct | medium |  |  |
| handleCopyToEditor | `renderer/screens/BrowserAutomation.jsx` | 84 | internal | Direct | medium |  |  |
| Dashboard | `renderer/screens/Dashboard.jsx` | 3 | public | Direct | high |  |  |
| onEvent | `renderer/screens/Dashboard.jsx` | 11 | internal | Direct | medium |  |  |
| GitMonitor | `renderer/screens/GitMonitor.jsx` | 3 | public | Direct | high |  |  |
| load | `renderer/screens/GitMonitor.jsx` | 8 | internal | Direct | medium |  |  |
| add | `renderer/screens/GitMonitor.jsx` | 17 | internal | Direct | medium |  |  |
| remove | `renderer/screens/GitMonitor.jsx` | 25 | internal | Direct | medium |  |  |
| LiveFeed | `renderer/screens/LiveFeed.jsx` | 3 | public | Direct | high |  |  |
| onEvent | `renderer/screens/LiveFeed.jsx` | 10 | internal | Direct | medium |  |  |
| LocalLLM | `renderer/screens/LocalLLM.jsx` | 8 | public | Direct | high |  |  |
| refreshStatus | `renderer/screens/LocalLLM.jsx` | 17 | internal | Direct | medium |  |  |
| handleSetup | `renderer/screens/LocalLLM.jsx` | 31 | internal | Direct | medium |  |  |
| handleAsk | `renderer/screens/LocalLLM.jsx` | 45 | internal | Direct | medium |  |  |
| ProgressLog | `renderer/screens/ProgressLog.jsx` | 4 | public | Direct | high |  |  |
| load | `renderer/screens/ProgressLog.jsx` | 9 | internal | Direct | medium |  |  |
| PromptTemplates | `renderer/screens/PromptTemplates.jsx` | 6 | public | Direct | high |  |  |
| refresh | `renderer/screens/PromptTemplates.jsx` | 15 | internal | Direct | medium |  |  |
| selectPrompt | `renderer/screens/PromptTemplates.jsx` | 37 | internal | Direct | medium |  |  |
| savePrompt | `renderer/screens/PromptTemplates.jsx` | 48 | internal | Direct | medium |  |  |
| deletePrompt | `renderer/screens/PromptTemplates.jsx` | 78 | internal | Direct | medium |  |  |
| startNew | `renderer/screens/PromptTemplates.jsx` | 95 | internal | Direct | medium |  |  |
| saveButtonLabel | `renderer/screens/PromptTemplates.jsx` | 101 | internal | Direct | medium |  |  |
| RobotFramework | `renderer/screens/RobotFramework.jsx` | 10 | public | Direct | high |  |  |
| loadRobotFiles | `renderer/screens/RobotFramework.jsx` | 32 | internal | Direct | medium |  |  |
| previewRobotFile | `renderer/screens/RobotFramework.jsx` | 42 | internal | Direct | medium |  |  |
| openBrowserFile | `renderer/screens/RobotFramework.jsx` | 59 | internal | Direct | medium |  |  |
| runSuite | `renderer/screens/RobotFramework.jsx` | 70 | internal | Direct | medium |  |  |
| runSelectedRobotFile | `renderer/screens/RobotFramework.jsx` | 91 | internal | Direct | medium |  |  |
| runTddCheck | `renderer/screens/RobotFramework.jsx` | 119 | internal | Direct | medium |  |  |
| pickRobotFile | `renderer/screens/RobotFramework.jsx` | 150 | internal | Direct | medium |  |  |
| pickSourceFile | `renderer/screens/RobotFramework.jsx` | 159 | internal | Direct | medium |  |  |
| generateSkeleton | `renderer/screens/RobotFramework.jsx` | 169 | internal | Direct | medium |  |  |
| Settings | `renderer/screens/Settings.jsx` | 3 | public | Direct | high |  |  |
| update | `renderer/screens/Settings.jsx` | 8 | internal | Direct | medium |  |  |
| save | `renderer/screens/Settings.jsx` | 9 | internal | Direct | medium |  |  |
| validateBinary | `run-tests.js` | 7 | internal | Direct | medium |  |  |
| buildArgsFor | `run-tests.js` | 22 | internal | Direct | medium |  |  |
| getChangedFiles | `scripts/architecture-sync-check.js` | 45 | internal | Direct | medium |  |  |
| isNonTrigger | `scripts/architecture-sync-check.js` | 60 | internal | Direct | medium |  |  |
| isTrigger | `scripts/architecture-sync-check.js` | 64 | internal | Direct | medium |  |  |
| checkContextFile | `scripts/architecture-sync-check.js` | 69 | internal | Direct | medium |  |  |
| checkBaselineFile | `scripts/architecture-sync-check.js` | 78 | internal | Direct | medium |  |  |
| getLatestBaselineTimestamp | `scripts/architecture-sync-check.js` | 92 | internal | Direct | medium |  |  |
| isStructuralChange | `scripts/architecture-sync-check.js` | 111 | internal | Direct | medium |  |  |
| main | `scripts/architecture-sync-check.js` | 126 | internal | Direct | medium |  |  |
| parseArgs | `scripts/chaos/run-chaos.js` | 14 | internal | Direct | medium |  |  |
| run | `scripts/chaos/run-chaos.js` | 23 | internal | Direct | medium |  |  |
| burstLoadScenario | `scripts/chaos/scenarios/burst-load.js` | 6 | internal | Direct, Path-invoked | low |  |  |
| corruptConfigScenario | `scripts/chaos/scenarios/corrupt-config.js` | 8 | internal | Direct, Path-invoked | low |  |  |
| killDaemonScenario | `scripts/chaos/scenarios/kill-daemon.js` | 6 | internal | Direct, Path-invoked | low |  |  |
| parseHealthOk | `scripts/chaos/utils.js` | 7 | internal | Direct | medium |  |  |
| computeFailureRate | `scripts/chaos/utils.js` | 17 | internal | Direct | medium |  |  |
| assertRecovery | `scripts/chaos/utils.js` | 24 | internal | Direct | medium |  |  |
| delay | `scripts/chaos/utils.js` | 32 | internal | Direct | medium |  |  |
| finishWhenElapsed | `scripts/chaos/utils.js` | 37 | internal | Direct | medium |  |  |
| createChaosHome | `scripts/chaos/utils.js` | 50 | internal | Direct | medium |  |  |
| makeCrcTable | `scripts/generate-icons.js` | 8 | internal | Direct | medium |  |  |
| crc32 | `scripts/generate-icons.js` | 21 | internal | Direct | medium |  |  |
| pngChunk | `scripts/generate-icons.js` | 29 | internal | Direct | medium |  |  |
| createPng | `scripts/generate-icons.js` | 39 | internal | Direct | medium |  |  |
| flatColor | `scripts/generate-icons.js` | 66 | internal | Direct | medium |  |  |
| ensureDir | `scripts/install.js` | 13 | internal | Direct | medium |  |  |
| writeFile | `scripts/install.js` | 17 | internal | Direct | medium |  |  |
| runCommand | `scripts/install.js` | 22 | internal | Direct | medium |  |  |
| runNpmLink | `scripts/install.js` | 30 | internal | Direct | low |  |  |
| installWindows | `scripts/install.js` | 39 | internal | Direct | medium |  |  |
| installMac | `scripts/install.js` | 68 | internal | Direct | medium |  |  |
| installLinux | `scripts/install.js` | 96 | internal | Direct | medium |  |  |
| main | `scripts/install.js` | 120 | internal | Direct | medium |  |  |
| main | `scripts/measurement-checkpoint.ts` | 54 | internal | Direct | medium |  |  |
| embed | `search_repo.py` | 7 | internal | Direct | medium |  |  |
| test | `smoke-test-sprint12.js` | 16 | internal | Test | medium |  |  |
| assert | `smoke-test-sprint12.js` | 20 | internal | Test | medium |  |  |
| runTests | `smoke-test-sprint12.js` | 26 | internal | Test | medium |  |  |
| waitFor | `src/__tests__/capture-pipeline.integration.test.js` | 316 | test-only | Handler, Test | high |  |  |
| exists | `src/accounts/health.js` | 30 | internal | Direct | medium |  |  |
| base64UrlDecode | `src/accounts/health.js` | 39 | internal | Direct | medium |  |  |
| parseJwtExp | `src/accounts/health.js` | 45 | internal | Direct | medium |  |  |
| parseExpiresAt | `src/accounts/health.js` | 57 | internal | Direct | medium |  |  |
| parseTokenLikeJson | `src/accounts/health.js` | 72 | internal | Direct | medium |  |  |
| deriveHealthFromExpiry | `src/accounts/health.js` | 80 | internal | Direct | medium |  |  |
| probeAccount | `src/accounts/health.js` | 102 | public | Direct | high |  |  |
| probeAccountFromAuthPath | `src/accounts/health.js` | 121 | internal | Direct | medium |  |  |
| getAccountBlob | `src/accounts/health.js` | 138 | internal | Direct | medium |  |  |
| missingSecretHealth | `src/accounts/health.js` | 153 | internal | Direct | medium |  |  |
| probeAuthBlob | `src/accounts/health.js` | 162 | internal | Direct | medium |  |  |
| probeTokenJson | `src/accounts/health.js` | 177 | internal | Direct | medium |  |  |
| daemonBaseDir | `src/accounts/health.js` | 197 | internal | Direct | medium |  |  |
| daemonPaths | `src/accounts/health.js` | 201 | internal | Direct | medium |  |  |
| readPid | `src/accounts/health.js` | 210 | internal | Direct | medium |  |  |
| isPidAlive | `src/accounts/health.js` | 220 | internal | Direct | medium |  |  |
| emptyAccountSummary | `src/accounts/health.js` | 232 | internal | Direct | medium |  |  |
| classifyAccount | `src/accounts/health.js` | 242 | internal | Direct | medium |  |  |
| summarizeAccountStatus | `src/accounts/health.js` | 261 | internal | Direct | medium |  |  |
| computeAccountHealth | `src/accounts/health.js` | 286 | public | Direct | high |  |  |
| computeDaemonHealth | `src/accounts/health.js` | 350 | public | Direct | high |  |  |
| mapLocalLlmStatus | `src/accounts/health.js` | 385 | internal | Direct | medium |  |  |
| computeLocalLlmHealth | `src/accounts/health.js` | 412 | public | Direct | high |  |  |
| getSystemHealth | `src/accounts/health.js` | 423 | public | Direct | high |  |  |
| installExtension | `src/accounts/profile-manager.js` | 11 | internal | Direct | medium |  |  |
| exists | `src/accounts/profile-manager.js` | 25 | internal | Direct | medium |  |  |
| resolveProfilesDir | `src/accounts/profile-manager.js` | 34 | internal | Direct | medium |  |  |
| readTemplate | `src/accounts/profile-manager.js` | 65 | internal | Direct | medium |  |  |
| writeProfileSettings | `src/accounts/profile-manager.js` | 85 | internal | Direct | medium |  |  |
| listFilesRecursively | `src/accounts/profile-manager.js` | 100 | internal | Direct | medium |  |  |
| defaultProgressPath | `src/accounts/secret-store.js` | 155 | public | Direct | high |  |  |
| getSupervisorCredentials | `src/accounts/secret-store.js` | 163 | public | Direct | high |  |  |
| setSupervisorCredentials | `src/accounts/secret-store.js` | 168 | public | Direct | high |  |  |
| defaultStorePath | `src/accounts/store.js` | 8 | internal | Direct | medium |  |  |
| serializeAccount | `src/accounts/store.js` | 12 | internal | Direct | medium |  |  |
| deserializeAccount | `src/accounts/store.js` | 22 | internal | Direct | medium |  |  |
| pathExists | `src/accounts/store.js` | 31 | internal | Direct | medium |  |  |
| ensureDir | `src/accounts/switcher.js` | 10 | internal | Direct | medium |  |  |
| tryFsyncDir | `src/accounts/switcher.js` | 14 | internal | Direct | medium |  |  |
| atomicWriteFile | `src/accounts/switcher.js` | 27 | public | Direct | high |  |  |
| createEmitter | `src/accounts/switcher.js` | 52 | internal | Direct | medium |  |  |
| readWorkspace | `src/accounts/workspace.js` | 3 | internal | Direct | medium |  |  |
| writeWorkspace | `src/accounts/workspace.js` | 19 | internal | Direct | medium |  |  |
| bindProfile | `src/accounts/workspace.js` | 23 | public | Direct | high |  |  |
| unbind | `src/accounts/workspace.js` | 33 | public | Direct | high |  |  |

_Only the first 200 rows are shown here. Use `function_catalog.csv` for the full catalog._
