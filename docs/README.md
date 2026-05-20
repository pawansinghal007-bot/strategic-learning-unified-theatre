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

## Robot Framework Test Runner

A new Robot Framework scaffold is available for system-level and regression testing.

Use the runner commands from `src/test-runner.js` or the provided npm scripts:

- `npm run test:robot:functional`
- `npm run test:robot:nonfunctional`
- `npm run test:robot:regression`
- `npm run test:robot:all`
- `npm run test:tdd`

The current scaffold includes:

- `src/test-runner.js` — runner and TDD helper
- `robot.config.json` — default runner configuration
- `robot/README.md` — Robot suite guidance and layout
- `robot/` — expected Robot directory structure for future tests

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

## Idea Store

Sprint 2 adds a lightweight idea management system. Ideas are stored as structured Markdown files with YAML front-matter, readable by any text editor or agent.

### Storage

- **Project scope:** `<project-root>/.vscode-rotator/ideas/<YYYY-MM-DD>-<slug>.md`
- **Global inbox:** `~/.vscode-rotator/ideas/<YYYY-MM-DD>-<slug>.md` (fallback if no `.git`)

### File Format

Each idea is a Markdown file with YAML front-matter:

```markdown
---
id: 550e8400-e29b-41d4-a716-446655440000
created: 2026-05-19T14:30:00.000Z
project: myproject
tags: ["feature", "ui"]
status: inbox|active|parked|done
priority: 1|2|3
linkedSprint: <sprintId or null>
---

# Idea Title

Free-form markdown body. Can include code blocks, lists, links, etc.
```

### CLI Commands

#### Add an idea

```bash
vscode-rotator idea add [--project <name>] [--tag <tag>] [--priority 1]
```

Prompts for title and body. Opens `$EDITOR` if available, otherwise accepts inline input.

#### List ideas

```bash
vscode-rotator idea list [--project <name>] [--tag <tag>] [--status inbox]
```

Shows a table of matching ideas with ID, project, status, priority, tags, and creation date.

#### View an idea

```bash
vscode-rotator idea view <id>
```

Outputs the raw Markdown file (front-matter + body).

#### Link to a sprint

```bash
vscode-rotator idea link <id> --sprint <sprintId>
```

Associates an idea with an active sprint for tracking.

#### Mark as done

```bash
vscode-rotator idea done <id>
```

Changes the idea status to `done`.

#### Export for prompts

```bash
vscode-rotator idea export [--project <name>] [--status active]
```

Concatenates ideas into a single Markdown block suitable for pasting into an agent prompt.

Output format:
```markdown
## Active ideas for myproject

### Feature Title [priority: 1]
Feature description and context...

---

### Bug Title [priority: 2]
Bug details and reproduction steps...
```

**Constraints:**
- Output trimmed to ~4000 tokens (roughly 16KB)
- Individual idea bodies capped at 500 chars if total exceeds limit
- Separator: `---` between ideas

### Usage Example

```bash
# Create an idea interactively
vscode-rotator idea add --project myapp --tag "backend" --priority 1

# List all active ideas for my project
vscode-rotator idea list --project myapp --status active

# Link to current sprint
vscode-rotator idea link 550e8400-e29b-41d4-a716-446655440000 --sprint ${SPRINT_ID}

# Export for pasting into a prompt
vscode-rotator idea export --project myapp --status active
```

### VS Code Extension Integration (Future)

A future VS Code extension can:

1. **Browse ideas** by reading `.vscode-rotator/ideas/*.md` directly from the filesystem
2. **Create ideas** by writing Markdown files with valid YAML front-matter
3. **Show status badges** in the editor based on `status` field
4. **Quick-link ideas** to sprints via command palette
5. **Export and paste** directly to agent prompts

The filesystem-first approach means any tool—Obsidian, VS Code extension, shell script—can read and write ideas without installing special tooling.

## Browser Bridge

Sprint 3 adds a multi-LLM browser communicator using Playwright. Send prompts to ChatGPT, Claude.ai, Perplexity, and Gemini, capture responses, and compare outputs.

### Storage & Configuration

- **Browser profiles:** `~/.vscode-rotator/browser-profiles/<platform>/` (persistent login state)
- **Responses:** `~/.vscode-rotator/browser-responses/<timestamp>-<platform>.md`
- **Prompt library:** `~/.vscode-rotator/prompt-library.json`
- **Selector overrides:** `~/.vscode-rotator/browser-selectors.json` (user-customizable)

### Initial Setup

```bash
# Install Playwright (already in package.json)
npm install

# Log in to each platform (saves storage state for future automation)
vscode-rotator browser login --platform chatgpt
vscode-rotator browser login --platform claude
vscode-rotator browser login --platform perplexity
vscode-rotator browser login --platform gemini
```

### Send Prompt to Single Platform

```bash
vscode-rotator browser send --platform chatgpt --prompt "Explain quantum computing"
```

Or read from file:

```bash
vscode-rotator browser send --platform claude --file my-prompt.md
```

Options:
- `--browser chromium|firefox` — browser engine (default: chromium)
- `--headless` — run without UI
- `--dry-run` — show what would be sent without opening browser

### Compare Prompts Across Platforms

Send the same prompt to multiple platforms sequentially (with 3-second delays):

```bash
vscode-rotator browser compare \
  --prompt "What is machine learning?" \
  --platforms chatgpt,claude,perplexity,gemini
```

Generates: `~/.vscode-rotator/browser-responses/<timestamp>-compare.md`

### Prompt Library

Store and reuse templated prompts:

#### Add a prompt

```bash
vscode-rotator browser prompts add \
  --name "Code Review" \
  --template "Review this code:\n\n{{code}}" \
  --tag "development" \
  --platform chatgpt \
  --platform claude
```

Or from file:

```bash
vscode-rotator browser prompts add \
  --name "API Design" \
  --file api-prompt-template.md \
  --tag "architecture"
```

#### List prompts

```bash
vscode-rotator browser prompts list
```

#### View a prompt

```bash
vscode-rotator browser prompts view <id>
```

#### Run a templated prompt

```bash
vscode-rotator browser prompts run <id> \
  --platform chatgpt \
  --var code="function add(a,b){return a+b;}" \
  --var style="professional"
```

The template `{{variable}}` placeholders are substituted with `--var key=value` flags.

#### Delete a prompt

```bash
vscode-rotator browser prompts delete <id>
```

### Response Management

#### List recent responses

```bash
vscode-rotator browser responses list [--platform chatgpt] [--limit 20]
```

#### View a response

```bash
vscode-rotator browser responses view <filename>
```

#### Clear old responses

```bash
vscode-rotator browser responses clear [--platform claude] [--older-than-days 30]
```

#### Show responses directory

```bash
vscode-rotator browser responses dir
```

### Adapter Selectors

Each platform adapter defines CSS selectors for finding UI elements. If selectors break due to UI changes, override them in `~/.vscode-rotator/browser-selectors.json`:

```json
{
  "chatgpt": {
    "inputBox": "textarea[placeholder*='Message']",
    "sendButton": "button[aria-label*='Send']",
    "responseContainer": "div[class*='prose']"
  },
  "claude": {
    "inputBox": "textarea[placeholder*='Message']",
    "sendButton": "button[aria-label*='Send']",
    "responseContainer": "div[class*='markdown']"
  }
}
```

When a selector fails, the error message points to this file:

```
Error: Input selector not found: "textarea[placeholder*='Message']"
Check ~/.vscode-rotator/browser-selectors.json
```

### Rate Limiting

To avoid bot detection:
- Minimum 3-second delay between sends to the same platform
- Sequential (not parallel) execution during `compare`
- Use `--headless false` (default) so the browser UI is visible for CAPTCHAs

### Example Workflows

#### Compare AI models on a coding problem

```bash
vscode-rotator browser compare \
  --prompt "Write a function to merge two sorted arrays in O(n) time" \
  --platforms chatgpt,claude,gemini
```

#### Save and reuse code review template

```bash
# First time: create template
vscode-rotator browser prompts add \
  --name "Code Quality Check" \
  --template "Review this for:\n1. Security issues\n2. Performance\n3. Maintainability\n\nCode:\n\n{{code}}" \
  --tag "qa"

# Later: run with different code
vscode-rotator browser prompts run <id> \
  --platform chatgpt \
  --var code="$(cat my-function.js)"
```

#### Batch comparison with prompt file

```bash
cat > batch-prompt.md << EOF
# Architecture Review

Evaluate this proposed system design:
- Microservices vs monolith
- Database choice
- Caching strategy

Design:
{{design}}
EOF

vscode-rotator browser prompts add \
  --name "Architecture Review" \
  --file batch-prompt.md

vscode-rotator browser prompts run <id> \
  --platform chatgpt \
  --var design="$(cat arch-proposal.txt)" && \
vscode-rotator browser prompts run <id> \
  --platform claude \
  --var design="$(cat arch-proposal.txt)" && \
vscode-rotator browser prompts run <id> \
  --platform perplexity \
  --var design="$(cat arch-proposal.txt)"
```

### Troubleshooting Browser Issues

**Playwright install fails:**
```bash
npm install --legacy-peer-deps  # Resolve vite peer conflicts
npm install @playwright/test --save-dev  # Ensure browsers are installed
npx playwright install chromium firefox
```

**Selector not found:**
- Check the actual page in your browser's DevTools
- Update `~/.vscode-rotator/browser-selectors.json`
- Open an issue with the platform name and new selector

**CAPTCHA blocking:**
- Use `--headless false` (default) and complete CAPTCHA manually
- The browser stays open waiting for your interaction

**Storage state not persisting:**
- Ensure you ran `vscode-rotator browser login --platform <name>` first
- Check `~/.vscode-rotator/browser-profiles/<platform>/storage-state.json` exists
- Try logging in again if cookies expired

## Storage Monitor

Sprint 4 adds a local storage monitor for development files and documents. It watches configured drives or folders, keeps a 30-day dev-status index, and maintains a snapshot that Sprint 5 can diff for incremental LLM document ingestion.

### Configuration

Add monitored paths to `~/.vscode-rotator/config.json`:

```json
{
  "storagePaths": [
    { "path": "D:\\Projects", "label": "D-Projects", "recursive": true },
    { "path": "E:\\Archive\\MyProduct", "label": "Product Archive", "recursive": true }
  ],
  "storageIndexMaxAgeDays": 30
}
```

On Windows, the monitor skips common system locations such as `Windows`, `Program Files`, `$Recycle.Bin`, and `pagefile.sys`.

### Files

- `~/.vscode-rotator/storage-index.json` stores date-keyed change entries for tracked files.
- `~/.vscode-rotator/storage-snapshot.json` stores the latest file map consumed by Sprint 5.

Snapshot schema:

```json
{
  "lastScan": "2026-05-19T10:30:00.000Z",
  "paths": {
    "D:\\Projects\\app\\README.md": {
      "size": 1234,
      "ts": "2026-05-19T10:30:00.000Z",
      "ingestible": true
    }
  }
}
```

Ingestible document extensions are `.md`, `.txt`, `.pdf`, `.docx`, `.yaml`, and `.yml`. Development-status extensions are `.js`, `.ts`, `.py`, `.json`, `.sh`, `.ps1`, `.cs`, `.java`, `.go`, `.rs`, `.cpp`, and `.h`.

### CLI Commands

```bash
vscode-rotator storage watch
vscode-rotator storage status
vscode-rotator storage index
```

- `storage watch` starts a foreground chokidar watcher and debounces changes for 2 seconds.
- `storage status` shows the last 20 indexed changes with path, event, time, and ingestible flag.
- `storage index` forces a full re-index and regenerates `storage-snapshot.json`.

## Local Dev-LLM

Sprint 5 adds a local, offline prompt-generation loop:

- experience DB: `~/.vscode-rotator/experience.db`
- model directory: `~/.vscode-rotator/models/`
- ingestion source: R1 `storage-snapshot.json`
- sprint source: R2 `~/.vscode-rotator/sprints/*.json`
- idea source: R3 `.vscode-rotator/ideas/*.md`

Typical setup:

```bash
vscode-rotator llm setup --model phi3
vscode-rotator storage index
vscode-rotator llm ingest
vscode-rotator llm import-sprints
vscode-rotator llm generate-prompt --goal "Add REST endpoint for account health" --platform chatgpt
```

The storage watcher also triggers one-off ingestion for changed ingestible files while `vscode-rotator storage watch` is running.

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
