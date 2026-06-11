# IPC & Brittleness Audit

## Preload API Surface

**window.rotator namespace (main dashboard renderer):**

- `rotator.accounts.list()` → returns account list
- `rotator.accounts.add(account)` → adds new account, returns id
- `rotator.accounts.capture(params)` → captures auth, returns account object
- `rotator.accounts.update(id, patch)` → updates account, returns updated object
- `rotator.accounts.remove(id)` → removes account, returns success boolean
- `rotator.accounts.listDetails()` → returns accounts with health/metadata
- `rotator.accounts.info(id)` → returns account detail
- `rotator.accounts.health(id)` → returns health status for account
- `rotator.switcher.switch(id)` → switches active account, restarts VS Code, returns success
- `rotator.daemon.status()` → returns daemon state (running/paused/crashed)
- `rotator.daemon.pause()` → pauses daemon
- `rotator.daemon.resume()` → resumes daemon
- `rotator.daemon.onEvent(callback)` → subscribes to daemon events (health, account change, etc.)
- `rotator.browser.send(prompt)` → sends prompt to active browser platform
- `rotator.browser.login(creds)` → triggers login flow on active platform
- `rotator.browser.listResponses(options)` → lists captured AI responses
- `rotator.browser.getResponse(filename)` → retrieves response content
- `rotator.browser.clearResponses(options)` → deletes responses
- `rotator.browser.listPrompts()` → lists saved prompt templates
- `rotator.browser.addPrompt(prompt)` → adds prompt template
- `rotator.browser.updatePrompt(id, updates)` → updates template
- `rotator.browser.deletePrompt(id)` → deletes template
- `rotator.browser.runPrompt(id, context)` → runs template against active platform
- `rotator.browser.switchPlatform(name)` → switches browser pane to ChatGPT|Claude|Gemini|Perplexity
- `rotator.browser.setVisible(visible)` → shows/hides browser pane
- `rotator.browser.navigate(url)` → navigates embedded browser
- `rotator.git.status(repoPath)` → returns git status
- `rotator.git.watchedRepos()` → returns list of watched repos
- `rotator.git.addRepo(repoPath)` → adds repo to watch list
- `rotator.git.removeRepo(repoPath)` → removes repo from watch list
- `rotator.git.pickDir()` → opens file picker for directory selection
- `rotator.journal.tail(n)` → returns last n journal entries
- `rotator.journal.rawMd()` → returns full journal as markdown
- `rotator.config.get()` → returns current config
- `rotator.config.set(patch)` → updates config, returns updated config
- `rotator.llm.status()` → returns local LLM health and available models
- `rotator.llm.setup(options)` → initializes local LLM
- `rotator.llm.ask(request)` → submits request to local LLM, returns response
- `rotator.robot.runSuite(opts)` → runs Robot Framework suite
- `rotator.robot.tddCheck(opts)` → runs TDD check
- `rotator.robot.generateSkeleton(filePath)` → generates test skeleton
- `rotator.robot.runFile(filePath, opts)` → runs single test file
- `rotator.robot.listFiles()` → lists test files
- `rotator.robot.readFile(filePath)` → reads test file content
- `rotator.robot.openFile(filePath)` → opens test file in editor
- `rotator.robot.pickSourceFile()` → file picker for source files
- `rotator.robot.pickRobotFile()` → file picker for robot files
- `rotator.app.version()` → returns app version
- `rotator.app.openUrl(url)` → opens URL in default browser

**window.providerTelemetry namespace:**

- `providerTelemetry.getStatus(provider)` → returns provider status/availability
- `providerTelemetry.getUsage(provider, limit)` → returns recent usage stats
- `providerTelemetry.resetHealth(provider)` → resets health state
- `providerTelemetry.resetUsage(provider)` → resets usage counters
- `providerTelemetry.resetAll(provider)` → resets all telemetry for provider

**window.providerPolicy namespace:**

- `providerPolicy.getPolicy()` → returns current provider policy
- `providerPolicy.listPresets()` → returns available policy presets
- `providerPolicy.applyPreset(presetName)` → applies preset, returns updated policy
- `providerPolicy.allow(provider)` → allows provider, returns updated policy
- `providerPolicy.block(provider)` → blocks provider, returns updated policy
- `providerPolicy.setManualProvider(provider)` → sets manual provider override
- `providerPolicy.reset()` → resets policy to default

**window.workspacePolicy namespace:**

- `workspacePolicy.get(workspaceId)` → returns workspace policy
- `workspacePolicy.set(workspaceId, patch)` → sets policy override, triggers approval if sensitive
- `workspacePolicy.clear(workspaceId)` → clears override
- `workspacePolicy.resolve(workspaceId)` → returns effective policy (merged global + workspace)

**window.workspaceContext namespace:**

- `workspaceContext.get(workspaceId)` → returns stored context
- `workspaceContext.set(workspaceId, context)` → stores context (summary, tags, intent)
- `workspaceContext.clear(workspaceId)` → clears context
- `workspaceContext.buildPrompt(workspaceId, prompt)` → injects context into prompt

**window.workspaceRouting namespace:**

- `workspaceRouting.list(workspaceId, filter)` → returns routing history
- `workspaceRouting.latest(workspaceId)` → returns most recent routing decision
- `workspaceRouting.summary(workspaceId)` → returns routing stats
- `workspaceRouting.export(workspaceId, format)` → exports routing data as JSON/CSV

**window.workspaceReport namespace:**

- `workspaceReport.save(workspaceId, format, filter)` → saves report to disk, returns filename

**window.audit namespace:**

- `audit.list(limit, filter)` → returns audit log entries
- `audit.latest(limit)` → returns most recent audit entries
- `audit.verify()` → verifies audit log integrity (hash chain), returns {ok: boolean, tampered: number}
- `audit.exportJson(workspaceId, filter)` → exports audit log as JSON
- `audit.exportHtmlReport(workspaceId, filter)` → exports audit log as HTML report

**window.workspaceApproval namespace:**

- `workspaceApproval.list(workspaceId)` → returns pending approvals
- `workspaceApproval.resolve(workspaceId, approvalId, status, reviewData)` → accepts/rejects approval

**window.workspaceQuota namespace:**

- `workspaceQuota.get(workspaceId)` → returns quota policy
- `workspaceQuota.list()` → returns all workspace quotas
- `workspaceQuota.set(workspaceId, dailyLimit, weeklyLimit, mode, fallbackProvider)` → sets quota
- `workspaceQuota.clear(workspaceId)` → clears quota
- `workspaceQuota.recordUsage(workspaceId, increment)` → records request usage
- `workspaceQuota.usage(workspaceId)` → returns current usage (daily, weekly)
- `workspaceQuota.evaluate(workspaceId)` → returns quota status (ok/alert/blocked)
- `workspaceQuota.clearUsage(workspaceId)` → resets usage counters

## IPC Boundaries

| Channel                      | Direction       | Payload                                                    | Expected Response                               | Brittleness Notes                                                                                                  |
| ---------------------------- | --------------- | ---------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `accounts:list`              | renderer → main | none                                                       | `[{id, email, agentType, profileName}...]`      | Not brittle; straightforward list serialization                                                                    |
| `accounts:capture`           | renderer → main | `{email, agentType, profileName, timeoutMs, launchEditor}` | `{id, email, agentType, authBlob, profileName}` | **Brittle**: capture timeout depends on external auth flow; launchEditor restart timing is OS-dependent            |
| `switcher:switch`            | renderer → main | `{id}`                                                     | `{success, message}`                            | **Brittle**: VS Code process restart is OS-dependent; auth file handoff path varies by platform                    |
| `browser:switchPlatform`     | renderer → main | `{name}`                                                   | `{platform, url, visible}`                      | **Brittle**: platform name must match partition convention (`persist:platform-${name}`); preload attachment timing |
| `browser:navigate`           | renderer → main | `{url}`                                                    | `{platform, url}`                               | **Brittle**: embedded view navigation timing; network delays; external site changes                                |
| `capture:done`               | main → renderer | `{platform, responseId, status}`                           | none (event)                                    | **Brittle**: capture completion signal timing; AI platform DOM changes; selector mismatch across UI updates        |
| `providerPolicy:applyPreset` | renderer → main | `{presetName}`                                             | `{policy, presetName}`                          | **Brittle**: preset names hardcoded; policy merge logic can differ if schema changes                               |
| `workspacePolicy:set`        | renderer → main | `{workspaceId, patch}`                                     | `{policy, requiresApproval}`                    | **Brittle**: sensitive-patch detection logic; approval triggering conditions change                                |
| `workspaceContext:set`       | renderer → main | `{workspaceId, context}`                                   | `{context}`                                     | **Brittle**: context prompt injection affects downstream routing; LLM behavior changes                             |
| `workspaceRouting:list`      | renderer → main | `{workspaceId, filter}`                                    | `{entries, count}`                              | **Brittle**: routing history JSON format can change; timestamp precision; decision reason strings                  |
| `audit:verify`               | renderer → main | `{filter}`                                                 | `{ok, tampered, hashChainValid}`                | **Brittle**: hash chain verification depends on exact serialization; tampering detection thresholds                |
| `workspaceApproval:resolve`  | renderer → main | `{workspaceId, approvalId, status, reviewData}`            | `{approval, resolved}`                          | **Brittle**: approval workflow state transitions; policy application after approval                                |
| `workspaceQuota:recordUsage` | renderer → main | `{workspaceId, increment}`                                 | `{totalDaily, totalWeekly, exceeded}`           | **Brittle**: quota calculation timing; clock skew on reset boundaries; enforcement mode interactions               |
| `workspaceQuota:evaluate`    | renderer → main | `{workspaceId}`                                            | `{status, action}`                              | **Brittle**: quota mode (alert/fallback/block) enforcement depends on exact thresholds                             |
| `health:get`                 | renderer → main | none                                                       | `{daemonRunning, accountsHealthy, lastCheck}`   | **Brittle**: health polling frequency; daemon crash detection timing; account token expiry calculation             |

## Brittleness Risk Register

| Location                                        | Risk Type                                                                  | Mitigation                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `electron-ui/preload-browser.cjs` DOM selectors | External platform DOM changes (ChatGPT, Claude, Gemini, Perplexity)        | Store selectors in separate `browser-selectors.json` with fallback logic; add e2e override env var for test platforms |
| `capture:done` event timing                     | AI response completion depends on streaming detection and fixed delays     | Add explicit completion sentinel or streaming-end marker; log capture duration for regression detection               |
| `switcher:switch` VS Code restart               | OS-dependent process lifecycle; auth file path varies by platform          | Wrap restart in retry logic with backoff; validate auth file presence before declaring success                        |
| Browser pane partition names                    | Hardcoded `persist:platform-${platform}` naming convention                 | Abstract partition names to const; version partition names if schema changes                                          |
| Policy merge logic                              | Workspace override + global policy merge can have edge cases               | Test merge behavior exhaustively; maintain a merge decision tree in docs                                              |
| Approval workflow state                         | Multiple approval states + policy application race conditions              | Add idempotent approval resolution; validate policy actually applied after resolution                                 |
| Quota calculation                               | Daily/weekly boundary timing; clock skew across processes                  | Use server clock for quota boundaries; add grace period; log quota transitions for audit                              |
| Audit log hash chain                            | Serialization order or format changes break verification                   | Version audit log format; maintain backwards-compatible hash verification                                             |
| Daemon health polling                           | Polling frequency can miss brief crashes; async health updates             | Switch to event-based health signals; add crash detection via IPC timeout                                             |
| Account capture timeout                         | External auth platform behavior; network delays                            | Make timeout configurable per account type; add network diagnostics in failure logs                                   |
| Routing history persistence                     | JSON schema changes; ordering of decision records                          | Add migrations for audit log format; test round-trip serialization                                                    |
| Window/view lifecycle                           | Preload attachment timing on view creation; BrowserView vs WebContentsView | Abstract view creation behind consistent interface; add lifecycle event hooks                                         |
| Native tray interactions                        | OS-specific menu behavior; platform-dependent icon rendering               | Test on all target platforms; use platform-neutral menu templates; log tray events                                    |
| File I/O paths                                  | Home directory expansion; encrypted file decryption timing                 | Normalize paths at entry point; add file I/O timeout; validate decryption before use                                  |
| LLM inference                                   | Local model availability; response formatting inconsistency                | Mock LLM for unit tests; snapshot responses for regression; add inference timeout                                     |
| Git status polling                              | Repository state changes; git command failures                             | Add git error handling; cache git status with TTL; validate repo path exists before stat                              |
