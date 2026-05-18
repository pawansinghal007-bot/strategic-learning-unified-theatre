# vscode-rotator Final Guide

vscode-rotator is a cross-platform account rotation utility for VS Code. Sprint 6 adds OS-level secret storage, a system tray UI, installer integration, and hardened daemon behavior.

## Architecture

- `src/store.js` — encrypted account store persisted in `~/.vscode-rotator/accounts.enc`
- `src/secret-store.js` — OS keychain storage via `keytar` for account secrets
- `src/watcher.js` — daemon loop that probes account health and rotates when needed
- `src/switcher.js` — performs auth file writes, closes VS Code, and opens the selected profile
- `src/daemon-runner.js` — detached daemon process with startup and shutdown hooks
- `electron-tray/main.js` — tray-only Electron UI for status, account switching, and log access
- `scripts/install.js` — cross-platform service registration helper

## Requirements

- Node.js 18+
- `npm install` to install dependencies
- Native build toolchain for `keytar`: `node-gyp` and platform-specific dependencies

## Installation

```bash
npm install
npm link
```

### Install daemon service

```bash
npm run install-service
```

This command links the package globally and registers the daemon on login using:

- Windows Task Scheduler on `win32`
- LaunchAgents on `darwin`
- `systemd --user` on `linux`

## CLI Reference

Use `npx vscode-rotator --help` for a complete command list. Key commands:

- `vscode-rotator add` — add an account and store its auth secret in the OS keychain
- `vscode-rotator list` — list stored accounts
- `vscode-rotator remove <id>` — remove an account and its keyed secret
- `vscode-rotator use <id>` — switch to an account by id
- `vscode-rotator daemon start|stop|status|watch` — manage the background daemon
- `vscode-rotator profile create|link|apply` — manage VS Code profiles and workspace binding

## Tray UI

Launch the tray app:

```bash
npm run tray
```

Tray features:

- Active account displayed as a disabled label
- `Switch to ▸` submenu for available accounts
- Daemon status and log access
- Icon reflects state:
  - green = healthy
  - amber = cooldown in progress
  - red = all accounts unavailable

## Troubleshooting

### `keytar` install failures

Install native build tools before installing dependencies:

- Windows: `npm install --global windows-build-tools` or Visual Studio Build Tools
- macOS: `xcode-select --install`
- Linux: `build-essential`, `python3`, and device-specific headers

### Permissions

The application enforces secure permissions on `~/.vscode-rotator` and its files.

### Daemon logs

Check `~/.vscode-rotator/daemon.log` for switch, cooldown, recover, and shutdown events.

## FAQ

### Why are secrets stored in the OS keychain?

The OS keychain protects auth blobs from disk exposure and avoids plaintext storage in repository-accessible files.

### How does rotation decide the next account?

The watcher probes health for each active account and chooses the best account using quota and recency heuristics.

### What happens if every account is on cooldown?

The daemon logs a `GIT_WARN`-style error and the tray icon turns red until an account recovers.
