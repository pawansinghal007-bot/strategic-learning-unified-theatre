# vscode-rotator

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
npx vscode-rotator --help
```

Core commands:

- `vscode-rotator add` — add an account and store its secret in the OS keychain
- `vscode-rotator list` — list stored accounts
- `vscode-rotator remove <id>` — delete an account and purge its OS secret
- `vscode-rotator use <accountId> [--dry-run]` — switch to an account by writing its auth blob and launching VS Code
- `vscode-rotator status` — show store status and account summary
- `vscode-rotator health` — probe account health from stored secrets
- `vscode-rotator daemon start|stop|status|watch` — manage the watcher daemon
- `vscode-rotator handoff create|update|close|resume|list` — manage AI sprint handoff state locally
- `vscode-rotator idea add|list|view|link|done|export` — manage structured ideas as Markdown files
- `vscode-rotator browser send|compare|login|prompts|responses` — multi-LLM browser communicator
- `vscode-rotator llm setup|ask|ingest|generate-prompt|mistake|rubric|import-sprints|rate-prompt` — local Dev-LLM experience capture and prompt generation
- `vscode-rotator profile create|list|delete|link|apply|export|import` — manage VS Code profiles and workspace binding
- `vscode-rotator log show|clear` — view or clear the progress journal
- `vscode-rotator git-status [repoPath]` — inspect repo git status
- `vscode-rotator report generate [--date YYYY-MM-DD]` — generate a daily summary log

### Robot Framework Test Runner

A new Robot Framework scaffold has been added for integration and regression testing. The initial runner entrypoint is `src/test-runner.js`.

Use these npm scripts after installing Python and Robot Framework:

- `npm run test:robot:functional`
- `npm run test:robot:nonfunctional`
- `npm run test:robot:regression`
- `npm run test:robot:all`
- `npm run test:tdd`

## Documentation

The full Sprint 2+ guide is available in `docs/README.md`.

## Storage

- Store path: `~/.vscode-rotator/accounts.enc`
- Encryption: AES-256-GCM
- Key derivation: `crypto.scryptSync(machineId, "vscode-rotator", 32)`

## Secret storage

- Uses OS keychain via `keytar`
- Secrets are stored under `vscode-rotator` with account ID keys

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

## Config

`~/.vscode-rotator/config.json` (optional):

- `pollIntervalMs` (number): watcher poll interval
- `cooldownMs` (number): default cooldown when no reset time is known
- `remainingThreshold` (number): scorer threshold for quota bonus
- `authPaths.other` (string): auth path when `agentType=other`
- `watchedRepos` (string[]): repository paths to monitor for uncommitted/unpushed work
- `gitPollIntervalMs` (number): git monitor polling interval

## Agent Handoff Tracker

Use `vscode-rotator handoff` to capture sprint state and generate a resume prompt for the next AI agent.

Sprints are stored locally under `~/.vscode-rotator/sprints/` as JSON files named `<YYYY-MM-DD>-<sprintId>.json`.

Supported commands:

- `vscode-rotator handoff create --goal "..." [--agent <name>] [--model <string>] [--limit <n>]`
- `vscode-rotator handoff update <sprintId> [--tokens-used <n>] [--tokens-limit <n>] [--add-task "desc" --priority 1] [--complete-task <id>] [--add-blocker "desc"]`
- `vscode-rotator handoff close <sprintId> --status complete|paused|exhausted`
- `vscode-rotator handoff resume <sprintId>`
- `vscode-rotator handoff list`

Examples:

```bash
vscode-rotator handoff create --goal "Capture sprint state for next agent" --agent chatgpt --model gpt-4 --limit 2000
vscode-rotator handoff update 123e4567-e89b-12d3-a456-426614174000 --tokens-used 1800 --tokens-limit 2000 --add-task "Review current handoff tracker" --priority 1
vscode-rotator handoff update 123e4567-e89b-12d3-a456-426614174000 --complete-task a1b2c3d4 --add-blocker "Needs failing test details"
vscode-rotator handoff close 123e4567-e89b-12d3-a456-426614174000 --status paused
vscode-rotator handoff resume 123e4567-e89b-12d3-a456-426614174000
vscode-rotator handoff list
```

When a sprint is paused or exhausted, the resume prompt is generated automatically from completed tasks, pending tasks, blockers, changed files, and failing tests.

## Local Dev-LLM

The Local Dev-LLM module keeps an offline experience database at `~/.vscode-rotator/experience.db`. It ingests R1 storage snapshots, imports R2 sprint handoffs, reuses R3 ideas, tracks recurring mistakes, and generates structured prompts for browser agents.

Core commands:

- `vscode-rotator llm setup --model phi3` downloads/registers a local GGUF model and runs a smoke test.
- `vscode-rotator llm ask "Hello"` runs local inference.
- `vscode-rotator llm ingest [--force]` incrementally ingests ingestible files from `storage-snapshot.json`.
- `vscode-rotator llm ingest <file-or-folder>` ingests a one-off document path.
- `vscode-rotator llm generate-prompt --goal "Add REST endpoint for account health" --platform chatgpt`.
- `vscode-rotator llm mistake add --description "Forgot to await async call" --category api-misuse --fix "Added await"`.
- `vscode-rotator llm rubric list|enable <id>|disable <id>`.
- `vscode-rotator llm import-sprints` imports sprint history and test failures.
- `vscode-rotator llm rate-prompt <id> --rating 1-5`.

Native model and embedding packages are loaded lazily. If the model or native runtime is missing, the CLI exits cleanly with setup guidance instead of breaking unrelated rotator commands.
