# strategic-learning-unified-theatre

Cross-platform account rotation for VS Code with secure OS secret storage, a tray UI, a background watcher daemon, and profile-driven workspace binding.

## Requirements

- Node.js 18+

## Install

```bash
npm install
npm test
npm link
```

## Run

- `npm start` — launch the CLI
- `npm run tray` — launch the Electron tray app
- `npm run install-service` — register the watcher daemon as a background service on login

## CLI

```bash
npx strategic-learning-unified-theatre --help
```

Core commands:

- `strategic-learning-unified-theatre add` — add an account and store its secret in the OS keychain
- `strategic-learning-unified-theatre list` — list stored accounts
- `strategic-learning-unified-theatre remove <id>` — delete an account and purge its OS secret
- `strategic-learning-unified-theatre use <accountId> [--dry-run]` — switch to an account by writing its auth blob and launching VS Code
- `strategic-learning-unified-theatre status` — show store status and account summary
- `strategic-learning-unified-theatre health` — probe account health from stored secrets
- `strategic-learning-unified-theatre daemon start|stop|status|watch` — manage the watcher daemon
- `strategic-learning-unified-theatre handoff create|update|close|resume|list` — manage AI sprint handoff state locally
- `strategic-learning-unified-theatre idea add|list|view|link|done|export` — manage structured ideas as Markdown files
- `strategic-learning-unified-theatre browser send|compare|login|prompts|responses` — multi-LLM browser communicator
- `strategic-learning-unified-theatre llm setup|ask|ingest|generate-prompt|mistake|rubric|import-sprints|rate-prompt` — local Dev-LLM experience capture and prompt generation
- `strategic-learning-unified-theatre profile create|list|delete|link|apply|export|import` — manage VS Code profiles and workspace binding
- `strategic-learning-unified-theatre log show|clear` — view or clear the progress journal
- `strategic-learning-unified-theatre git-status [repoPath]` — inspect repo git status
- `strategic-learning-unified-theatre report generate [--date YYYY-MM-DD]` — generate a daily summary log

### Robot Framework Test Runner

A new Robot Framework scaffold has been added for integration and regression testing. The initial runner entrypoint is `src/test-runner.js`.

Use these npm scripts after installing Python and Robot Framework:

- `npm run test:robot:functional`
- `npm run test:robot:nonfunctional`
- `npm run test:robot:regression`
- `npm run test:robot:all`
- `npm run test:tdd`

## Testing & Quality Gates

- `npm test` — runs Vitest unit + static analysis suite
- `npm run coverage` — runs Vitest with V8 coverage; fails if any core module below 70%
- `npm run test:robot` — runs Robot Framework functional + regression suites
- `npm run test:ci` — full CI gate (coverage + verbose reporter)
- Coverage thresholds: 70% statements/branches on core modules (see `docs/coverage-baseline.md`)
- Enterprise flow dashboard: `docs/test-protection-dashboard.md`
- Regression policy: `tests/regression/` files are permanent — never remove
- CI: every push triggers `.github/workflows/test.yml`; release tags trigger `release.yml`

### Chaos & Resilience

- `npm run test:chaos` — full chaos suite (all three scenarios)
- `npm run test:chaos:kill-daemon` — daemon crash scenario only
- `npm run test:chaos:corrupt-config` — config corruption scenario only
- `npm run test:chaos:burst-load` — Robot burst load scenario only
- Nightly CI: `.github/workflows/chaos.yml` (02:00 UTC; also manually triggerable)
- Runbook: `docs/chaos-resilience-runbook.md`
- SLO definitions: `scripts/chaos/slo.js`

## Release & Updates

- Build installers with `npm run dist:win`, `npm run dist:linux`, or `npm run dist:all`.
- Update channels are configured in `config/update.json`:
  - `latest` = stable
  - `beta` = pre-release
- Health-check rollback is tracked through `health-state.json` in the user data folder.
  - When a downloaded update is marked pending, a startup health check runs.
  - If the check passes, the pending version becomes the new known good version.
  - If the check fails, rollback is requested and the app exits to allow recovery.
- Tagged releases matching `v*` trigger `.github/workflows/release.yml` automatically in CI.
- Enterprise release guidance is available in `docs/release-checklist-enterprise.md`.
- Update server is configured with the generic provider URL from `package.json` `build.publish`.

## Documentation

The full Sprint 2+ guide is available in `docs/README.md`.

## Storage

- Store path: `~/.vscode-rotator/accounts.enc`
- Encryption: AES-256-GCM
- Key derivation: `crypto.scryptSync(machineId, "strategic-learning-unified-theatre", 32)`

## Secret storage

- Uses OS keychain via `keytar`
- Secrets are stored under `strategic-learning-unified-theatre` with account ID keys

## Daemon

- PID file: `~/.vscode-rotator/daemon.pid`
- Log file: `~/.vscode-rotator/daemon.log`

## Tray UI

- Launch with `npm run tray`
- Status icon colors:
  - green = healthy
  - amber = cooldown
  - red = all accounts exhausted
- Actions: active account display, switch submenu, open log, quit

## IPC Contract

- Contract version: `1`
- Envelope format: `{ v, op, payload }`
- Envelope-based Sprint 15.4 channels route through `registerIpcHandlers()` in `src/main/ipc/ipcAdapter.ts`.
- `window.rotator` is the renderer surface; raw `ipcRenderer` is not exposed.

| channel string            | key name                | ops/events                         | payload shape                             | route                  | added in sprint |
| ------------------------- | ----------------------- | ---------------------------------- | ----------------------------------------- | ---------------------- | --------------- |
| `ipc:capture-response`    | `captureResponse`       | `captureResponse`                  | `{ responsePath: string }`                | envelope adapter       | Sprint 15.4     |
| `ipc:tray-command`        | `trayCommand`           | `trayCommand`                      | `{ command: string }`                     | envelope adapter       | Sprint 15.4     |
| `ipc:log-view`            | `logView`               | `logView`                          | object payload, shape to be typed further | envelope adapter       | Sprint 15.4     |
| `ipc:robot-runner-action` | `robotRunnerAction`     | `robotRunnerAction`                | `{ action: string }`                      | envelope adapter       | Sprint 15.4     |
| `health:get`              | `healthGet`             | aggregate health request           | none                                      | legacy invoke          | Sprint 15.2     |
| `log:event`               | `logEvent`              | structured log event               | log entry object                          | main-to-renderer event | Sprint 15.3     |
| `browser:switchPlatform`  | `browserSwitchPlatform` | switch embedded browser platform   | platform name string                      | legacy invoke          | Sprint 11       |
| `browser:setVisible`      | `browserSetVisible`     | toggle embedded browser visibility | boolean                                   | legacy invoke          | Sprint 11       |
| `browser:navigate`        | `browserNavigate`       | navigate embedded browser          | URL string                                | legacy invoke          | Sprint 11       |

## Config

`~/.vscode-rotator/config.json` (optional):

- `pollIntervalMs` (number): watcher poll interval
- `cooldownMs` (number): default cooldown when no reset time is known
- `remainingThreshold` (number): scorer threshold for quota bonus
- `authPaths.other` (string): auth path when `agentType=other`
- `watchedRepos` (string[]): repository paths to monitor for uncommitted/unpushed work
- `gitPollIntervalMs` (number): git monitor polling interval

## Agent Handoff Tracker

Use `strategic-learning-unified-theatre handoff` to capture sprint state and generate a resume prompt for the next AI agent.

Sprints are stored locally under `~/.vscode-rotator/sprints/` as JSON files named `<YYYY-MM-DD>-<sprintId>.json`.

Supported commands:

- `strategic-learning-unified-theatre handoff create --goal "..." [--agent <name>] [--model <string>] [--limit <n>]`
- `strategic-learning-unified-theatre handoff update <sprintId> [--tokens-used <n>] [--tokens-limit <n>] [--add-task "desc" --priority 1] [--complete-task <id>] [--add-blocker "desc"]`
- `strategic-learning-unified-theatre handoff close <sprintId> --status complete|paused|exhausted`
- `strategic-learning-unified-theatre handoff resume <sprintId>`
- `strategic-learning-unified-theatre handoff list`

Examples:

```bash
strategic-learning-unified-theatre handoff create --goal "Capture sprint state for next agent" --agent chatgpt --model gpt-4 --limit 2000
strategic-learning-unified-theatre handoff update 123e4567-e89b-12d3-a456-426614174000 --tokens-used 1800 --tokens-limit 2000 --add-task "Review current handoff tracker" --priority 1
strategic-learning-unified-theatre handoff update 123e4567-e89b-12d3-a456-426614174000 --complete-task a1b2c3d4 --add-blocker "Needs failing test details"
strategic-learning-unified-theatre handoff close 123e4567-e89b-12d3-a456-426614174000 --status paused
strategic-learning-unified-theatre handoff resume 123e4567-e89b-12d3-a456-426614174000
strategic-learning-unified-theatre handoff list
```

When a sprint is paused or exhausted, the resume prompt is generated automatically from completed tasks, pending tasks, blockers, changed files, and failing tests.

## Local Dev-LLM

The Local Dev-LLM module keeps an offline experience database at `~/.vscode-rotator/experience.db`. It ingests R1 storage snapshots, imports R2 sprint handoffs, reuses R3 ideas, tracks recurring mistakes, and generates structured prompts for browser agents.

Core commands:

- `strategic-learning-unified-theatre llm setup --model phi3` downloads/registers a local GGUF model and runs a smoke test.
- `strategic-learning-unified-theatre llm ask "Hello"` runs local inference.
- `strategic-learning-unified-theatre llm ingest [--force]` incrementally ingests ingestible files from `storage-snapshot.json`.
- `strategic-learning-unified-theatre llm ingest <file-or-folder>` ingests a one-off document path.
- `strategic-learning-unified-theatre llm generate-prompt --goal "Add REST endpoint for account health" --platform chatgpt`.
- `strategic-learning-unified-theatre llm mistake add --description "Forgot to await async call" --category api-misuse --fix "Added await"`.
- `strategic-learning-unified-theatre llm rubric list|enable <id>|disable <id>`.
- `strategic-learning-unified-theatre llm import-sprints` imports sprint history and test failures.
- `strategic-learning-unified-theatre llm rate-prompt <id> --rating 1-5`.

Native model and embedding packages are loaded lazily. If the model or native runtime is missing, the CLI exits cleanly with setup guidance instead of breaking unrelated rotator commands.

## Enterprise Configuration (Sprint 15.8)

IT administrators can enforce fleet-wide policy by dropping a JSON or YAML file at one of the following locations (or by pointing the application at a custom path using the `UNIFIED_THEATRE_ENTERPRISE_CONFIG` environment variable):

- `/etc/strategic-learning-unified-theatre/enterprise-policy.json`
- `/etc/strategic-learning-unified-theatre/enterprise-policy.yaml`
- Any path set via the `UNIFIED_THEATRE_ENTERPRISE_CONFIG` environment variable

The enterprise file overrides user configuration and is applied at startup. It is validated against the enterprise `Policy` schema; when present and valid it takes precedence over per-user settings.

Minimal JSON example:

```json
{
  "policy": {
    "apiVersion": "1",
    "allowedPlatforms": ["chatgpt", "claude"],
    "allowedModels": ["gpt-4o"],
    "features": {
      "localDbEnabled": false,
      "browserCaptureEnabled": true,
      "llmCommandsEnabled": true
    },
    "rateLimits": {
      "perPlatformPerMinute": 10
    }
  }
}
```

Policy keys and effects:

- `allowedPlatforms`: restricts which browser platforms can be used.
- `allowedModels`: restricts which LLM models can be used.
- `features.localDbEnabled`: if `false`, all local DB (`experience.db`) access is blocked.
- `features.browserCaptureEnabled`: if `false`, browser capture commands are blocked.
- `features.llmCommandsEnabled`: if `false`, LLM setup and `ask` commands are blocked.
- `rateLimits`: future enforcement for per-platform and per-model rate caps (example key: `perPlatformPerMinute`).
- `pluginSearchPaths`: override where plugins are loaded from.

Note: If the enterprise policy file is invalid (fails schema validation), startup will abort and the application will print a clear error listing all validation failures so administrators can correct the file before redeploying.
