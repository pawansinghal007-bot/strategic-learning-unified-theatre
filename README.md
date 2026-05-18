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
- `vscode-rotator profile create|list|delete|link|apply|export|import` — manage VS Code profiles and workspace binding
- `vscode-rotator log show|clear` — view or clear the progress journal
- `vscode-rotator git-status [repoPath]` — inspect repo git status
- `vscode-rotator report generate [--date YYYY-MM-DD]` — generate a daily summary log

## Documentation

The full Sprint 6 guide is available in `docs/README.md`.

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
