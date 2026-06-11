# Application & User Understanding

## Application Overview

The application is a cross-platform Electron and Node.js tool for secure VS Code account rotation, AI provider policy management, and embedded AI/browser workflow support.

Key capabilities include:

- Managing multiple AI and VS Code auth accounts with secure OS keychain fallback and encrypted local account storage (`README.md`, `src/accounts/store.js`, `src/accounts/secret-store.js`).
- A tray daemon and Electron dashboard for monitoring account health, active account state, and workspace/watch status (`README.md`, `electron-tray/main.js`, `electron-ui/main.cjs`).
- Embedded browser pane support for AI platforms such as ChatGPT, Claude, Gemini, and Perplexity, with response capture and ingestion (`electron-ui/browser-pane.cjs`, `electron-ui/preload-browser.cjs`, `electron-ui/ipc/capture-handlers.cjs`).
- Policy, quota, audit, and routing analytics for workspace-level AI governance (`electron-ui/preload.cjs`, `src/policies/workspace-policy.ts`, `src/internal/config.js`).

## User Personas

- Developer / AI-enabled coder
  - Uses the app to manage multiple auth identities, rotate VS Code sessions, and capture AI responses from browser-based platforms.
  - Evidence: `README.md` CLI commands for `add`, `use`, `health`, `daemon`, `hand off`, `browser/send`, `browser/prompts`; `electron-ui/preload.cjs` `rotator.accounts`, `rotator.switcher`, embedded browser APIs.
  - Confidence: High
  - Assumptions: The main intended user is a developer who frequently switches AI/VS Code accounts and uses AI tools directly.

- Security / compliance administrator
  - Uses dashboard policy controls, workspace approval, audit reports, and quota enforcement to govern AI access and provider routing.
  - Evidence: `electron-ui/preload.cjs` `providerPolicy`, `workspacePolicy`, `workspaceApproval`, `workspaceQuota`, `audit`; `src/policies/workspace-policy.ts`.
  - Confidence: Medium
  - Assumptions: These governance features are intended for operators or teams rather than only individual developers.

- QA / automation engineer
  - Uses the embedded Robot Framework runner, test file pickers, and audit/journal output for regression and quality checks.
  - Evidence: `electron-ui/preload.cjs` `robot.*` IPC methods; `README.md` mentions Robot Framework and `src/test-runner.js` integration.
  - Confidence: Medium
  - Assumptions: This persona is secondary but present because testing integration is exposed through the UI and CLI.

## Major Workflows

1. Account capture and secure storage
   - Add or capture a new account, store auth blobs in OS keychain or encrypted fallback, and keep account metadata in `~/.vscode-rotator/accounts.enc`.
   - Evidence: `electron-ui/ipc/handlers.cjs` `accounts:add`, `accounts:capture`; `src/accounts/secret-store.js`.
   - Confidence: High
   - Assumptions: `capture` is a user-triggered flow for signing into AI accounts.

2. Switch active VS Code account and restart VS Code with profile binding
   - Write auth blob to resolved auth path, close running VS Code processes, and relaunch with the selected profile.
   - Evidence: `src/accounts/switcher.js` `SwitcherService.switch`; `electron-ui/ipc/handlers.cjs` `switcher:switch`.
   - Confidence: High
   - Assumptions: The main flow is account rotation rather than only status display.

3. Run watcher daemon and control the tray app
   - Start the background watcher service, monitor account health and git/workspace warnings, and interact via tray menu actions.
   - Evidence: `README.md` `daemon start|stop|status|watch`; `electron-tray/main.js`; `electron-ui/main.cjs` watcher event forwarding.
   - Confidence: High
   - Assumptions: Daemon and tray are core operational surfaces rather than optional helpers.

4. Embedded browser AI platform use and response capture
   - Load AI platforms inside an embedded browser pane, detect platform pages, capture responses, and ingest them for local use.
   - Evidence: `electron-ui/browser-pane.cjs`, `electron-ui/preload-browser.cjs`, `electron-ui/preload.cjs` browser APIs, `electron-ui/ipc/capture-handlers.cjs`.
   - Confidence: High
   - Assumptions: The browser pane is used for direct AI platform interaction rather than just browsing.

5. Configure provider/workspace policy, routing analytics, and reports
   - Review and adjust provider policy presets, apply workspace-specific overrides, and inspect routing/analytics charts and exports.
   - Evidence: `electron-ui/preload.cjs` `providerPolicy`, `workspacePolicy`, `workspaceRouting`, `workspaceReport`.
   - Confidence: Medium
   - Assumptions: The main dashboard likely surfaces these controls as analytics and governance widgets.

6. Local LLM setup and ask
   - Setup a local model, run inference, and use it for prompt generation or assistant tasks.
   - Evidence: `electron-ui/preload.cjs` `llm.status`, `llm.setup`, `llm.ask`; `README.md` local Dev-LLM features.
   - Confidence: Medium
   - Assumptions: Local LLM is part of the desktop experience, even if it may also be CLI-driven.

## UI Surfaces

- System tray menu
  - Tray app displays current status, active account, sprint progress, and switch actions.
  - Evidence: `electron-tray/main.js` menu template and icon state logic.
  - Confidence: High

- Main Electron dashboard window
  - React/Vite-powered dashboard with secure preload bridge for `window.rotator`, governance namespaces, logs, and system health.
  - Evidence: `electron-ui/main.cjs`, `electron-ui/preload.cjs`, `vite.config.js`, `electron-ui/dist` output target.
  - Confidence: High

- Embedded browser pane for AI platforms
  - A browser view/pane that hosts ChatGPT, Claude, Gemini, and Perplexity using persisted session partitions.
  - Evidence: `electron-ui/browser-pane.cjs`, `electron-ui/preload-browser.cjs`.
  - Confidence: High

- Modals/pickers for file selection and config
  - Dialogs for selecting source files, robot files, repository directories, and login actions.
  - Evidence: `electron-ui/ipc/handlers.cjs` Uses `dialog.showOpenDialog` for `robot:pickSourceFile`, `robot:pickRobotFile`, `git:pickDir`.
  - Confidence: Medium

## Dashboard Capabilities

- Provider telemetry dashboard
  - Status, usage, reset health/usage, and routing history for AI providers.
  - Evidence: `electron-ui/preload.cjs` `providerTelemetry.*`; `electron-ui/ipc/provider-telemetry-handlers.cjs`.
  - Confidence: High

- Provider policy controls
  - Get policy, list presets, apply presets, allow/block providers, set manual provider, and reset.
  - Evidence: `electron-ui/preload.cjs` `providerPolicy.*`; `electron-ui/ipc/provider-policy-handlers.cjs`.
  - Confidence: High

- Workspace policy and context management
  - Get/set/clear workspace-specific policy, resolve effective policy, manage workspace context, and build prompts from context.
  - Evidence: `electron-ui/preload.cjs` `workspacePolicy.*`, `workspaceContext.*`; `src/policies/workspace-policy.ts`.
  - Confidence: Medium

- Workspace routing analytics
  - List routing events, summary, trends, timeline, analytics, buckets, global analytics, exports, provider comparison, and report saving.
  - Evidence: `electron-ui/preload.cjs` `workspaceRouting.*`, `workspaceReport.save`.
  - Confidence: High

- Audit and compliance reporting
  - List, verify, show latest audit items, export JSON, and produce HTML reports.
  - Evidence: `electron-ui/preload.cjs` `audit.*`; `electron-ui/ipc/audit-handlers.cjs`.
  - Confidence: Medium

- Workspace approval and quota management
  - Review approvals, resolve statuses, and inspect or adjust workspace quotas and usage.
  - Evidence: `electron-ui/preload.cjs` `workspaceApproval.*`, `workspaceQuota.*`; `src/governance/workspace-approvals.ts`, `src/governance/workspace-quotas.ts`.
  - Confidence: Medium

- Browser prompt library and response capture
  - Manage prompt templates, run prompts, list captured responses, and clear response stores.
  - Evidence: `electron-ui/preload.cjs` `browser.*`; `electron-ui/ipc/handlers.cjs` browser prompt methods.
  - Confidence: High

## Confidence Log

| Conclusion                                                                             | Evidence                                                                                                  | Confidence | Assumptions                                                                     |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| The app is a VS Code account rotator with AI policy/dashboard support.                 | `README.md`, `src/accounts/store.js`, `electron-ui/preload.cjs`, `electron-tray/main.js`                  | High       | The README and code are taken as authoritative.                                 |
| Security keychain + encrypted local store used for account secrets.                    | `src/accounts/secret-store.js`, `README.md`, `src/accounts/store.js`                                      | High       | The backup file path implies a fallback for systems without keytar.             |
| Main personas are developers, policy admins, and QA engineers.                         | `electron-ui/preload.cjs`, `src/policies/workspace-policy.ts`, `README.md`, `src/test-runner.js`          | Medium     | Persona inference based on exposed features rather than explicit user research. |
| Core workflow includes account capture and switch.                                     | `electron-ui/ipc/handlers.cjs`, `src/accounts/switcher.js`                                                | High       | These handlers directly implement the flow.                                     |
| Daemon/tray monitoring is a primary user flow.                                         | `README.md`, `electron-tray/main.js`, `electron-ui/main.cjs`                                              | High       | The tray app and daemon are first-class features.                               |
| Embedded browser pane captures AI responses.                                           | `electron-ui/browser-pane.cjs`, `electron-ui/preload-browser.cjs`, `electron-ui/ipc/capture-handlers.cjs` | High       | Explicit capture logic exists.                                                  |
| Dashboard supports provider telemetry, policies, audit, quotas, and routing analytics. | `electron-ui/preload.cjs`, `electron-ui/ipc/*-handlers.cjs`                                               | High       | Many IPC namespaces are dedicated to these capabilities.                        |
| UI is built as Electron dashboard + tray + embedded browser view.                      | `electron-ui/main.cjs`, `electron-ui/preload.cjs`, `electron-tray/main.js`                                | High       | Main and tray app code confirm this architecture.                               |
| Local LLM setup/ask is exposed through UI.                                             | `electron-ui/preload.cjs`, `README.md`                                                                    | Medium     | UI API exists, though exact dashboard placement is inferred.                    |
| Audit and workspace approval are dashboard capabilities.                               | `electron-ui/preload.cjs`, `src/governance/workspace-approvals.ts`, `src/audit/audit-log.ts`              | Medium     | These are exposed to renderer but may be more administrative than core.         |
