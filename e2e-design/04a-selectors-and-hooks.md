# Selectors & Hooks

## Recommended data-testid Locations

| Component                                   | Location                                                    | Rationale                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Account selector dropdown                   | Tray menu, dashboard header                                 | Core to J1 (account rotation); needed to verify active account changes                    |
| Account add/capture button                  | Dashboard accounts panel                                    | Entry point for J1; test must verify account storage and auth capture                     |
| Account switcher button                     | Dashboard accounts panel                                    | Critical for J1; test verifies VS Code restart and auth handoff                           |
| Browser pane container                      | Main dashboard layout                                       | Foundation for J1; verify embedded view attachment, platform switching, visibility toggle |
| Browser platform tabs                       | Embedded browser pane (ChatGPT, Claude, Gemini, Perplexity) | J1 journey; must verify session partition persistence and DOM detection                   |
| Capture status indicator                    | Browser pane footer                                         | J1; shows passive capture state and response count                                        |
| Daemon status badge                         | Dashboard header / tray                                     | J1/general; shows health and pause/resume availability                                    |
| Provider policy selector                    | Dashboard provider policy panel                             | J2, J5; verify preset application and policy merge                                        |
| Workspace policy override form              | Dashboard workspace panel                                   | J2; test policy get/set/clear and override persistence                                    |
| Workspace context summary input             | Dashboard workspace panel                                   | J2; test context injection into routing decisions                                         |
| Routing history table                       | Dashboard routing analytics panel                           | J5; verify decision logging, filtering, export                                            |
| Routing explanation row                     | Routing history table                                       | J5; verify reason strings, policy influence, fallback visibility                          |
| Audit log table                             | Dashboard audit panel                                       | J3; verify log entries, timestamps, event types                                           |
| Audit export buttons (JSON/HTML)            | Dashboard audit panel footer                                | J3; verify export file generation and verification badge                                  |
| Approval list                               | Dashboard workspace approvals panel                         | J3; verify approval request display and resolve button state                              |
| Approval resolve button                     | Approval list item                                          | J3; test approval acceptance/rejection and event linkage                                  |
| Workspace quota policy form                 | Dashboard quota panel                                       | J4; test policy set/clear and mode selection                                              |
| Quota usage meter                           | Quota panel                                                 | J4; verify usage bar and exceeded alert styling                                           |
| Quota enforce action (alert/fallback/block) | Quota panel                                                 | J4; verify enforcement mode selected and audit event written                              |

## Stable Selectors Reference

### When data-testid is absent, use these patterns

**Tray menu (native; limited CSS selection available):**

- `role="menuitem"` with text content match for account switch actions
- Status indicators via native tray icon state or menu item checkmark

**Dashboard React components:**

- `role="tab"` for navigation tabs (Provider Telemetry, Workspace Policy, Routing, Audit, Approvals, Quotas)
- `role="tabpanel"` for panel content
- `[aria-label="Account switcher"]` or similar for named buttons
- `[aria-live="polite"]` for status updates (daemon health, capture in progress, quota alert)
- `role="listitem"` for table rows or list items; `[data-testid="routing-row-${id}"]` if IDs available

**Embedded browser pane (WebContentsView/BrowserView):**

- Platform detection via persistent partition names: `persist:platform-chatgpt`, `persist:platform-claude`, etc.
- Preload-injected data attributes on AI platform pages for response detection
- Fall back to hostname checks in preload script if DOM selectors fail

**Form inputs and controls:**

- `aria-label` attributes on policy override form fields, quota enforcement mode radio group
- `[placeholder="..."]` for text inputs where labels are unavailable
- `role="button"` for action buttons (Add Account, Capture, Export Audit, Resolve Approval)

**Dialogues and pickers:**

- Native `dialog::open` and `input[type="file"]` selectors for file pickers
- `[role="alertdialog"]` for confirmation modals

## Observability Hooks Required

**IPC Event Logging (main process → renderer lifecycle telemetry):**

- `ipc.log('ipc:invoke:start', { channel, timestamp })` when renderer calls `ipcRenderer.invoke(channel, ...)`
- `ipc.log('ipc:invoke:end', { channel, duration, statusCode, timestamp })` after handler returns
- `ipc.log('ipc:error', { channel, errorCode, message, timestamp })` on handler rejection

**Route Decision Signals:**

- `log.info('routing.decision', { workspaceId, selectedProvider, reason, policyApplied, quotaStatus, timestamp })` on each gateway route
- `log.warn('routing.fallback', { workspaceId, primaryProvider, fallbackProvider, reason, timestamp })` on fallback trigger
- `log.error('routing.blocked', { workspaceId, quotaExceeded | policyBlocked, timestamp })` on block

**Policy Change Audit Events:**

- `audit.log({ eventType: 'providerPolicy.applied', oldPolicy, newPolicy, presetName, timestamp })`
- `audit.log({ eventType: 'workspacePolicy.override', workspaceId, patch, timestamp })`
- `audit.log({ eventType: 'workspacePolicy.cleared', workspaceId, timestamp })`
- `audit.log({ eventType: 'workspaceContext.set', workspaceId, context, timestamp })`

**Approval State Transitions:**

- `audit.log({ eventType: 'workspaceApproval.requested', workspaceId, policyPatch, timestamp })`
- `audit.log({ eventType: 'workspaceApproval.resolved', workspaceId, approvalId, status, reviewer, timestamp })`

**Quota Events:**

- `audit.log({ eventType: 'workspaceQuota.set', workspaceId, dailyLimit, weeklyLimit, mode, timestamp })`
- `audit.log({ eventType: 'workspaceQuota.usageRecorded', workspaceId, increment, totalDaily, totalWeekly, timestamp })`
- `audit.log({ eventType: 'workspaceQuota.exceeded', workspaceId, limit, mode, action, timestamp })`

**Capture Completion Signals:**

- `log.info('capture.response', { platform, responseId, contentLength, ingestionStatus, timestamp })` on response ingestion
- `log.error('capture.timeout', { platform, timeout, timestamp })` on capture timeout
- `ipcRenderer.send('capture:done', { platform, responseId, status })` from browser preload

**Account Switching:**

- `log.info('account.switch', { fromId, toId, vscodeRestartInitiated, timestamp })`
- `log.error('account.switch.failed', { toId, reason, timestamp })`

**Health & Status Indicators:**

- `log.info('health.status', { accountId, daemonRunning, daysSinceRotation, tokenExpiryDays, timestamp })` on health check
- `log.info('daemon.paused | daemon.resumed', { timestamp })` on daemon state change

**Routing History Persistence:**

- `log.info('routing.history.written', { entryId, workspaceId, provider, reason, serializedSize, timestamp })`
- `log.info('routing.history.filtered', { filter, matchCount, timestamp })` on dashboard query

**Audit Log Verification:**

- `log.info('audit.verified', { entryCount, hashChainValid, verification.ok, timestamp })` on audit verification
- `log.warn('audit.tamper_detected', { entryCount, firstInvalidHash, timestamp })` on verification failure
