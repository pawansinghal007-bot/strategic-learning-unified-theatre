# Sprint 12 Plan — VS Code Passive Learning

## Goal
Build a passive VS Code signal collector that feeds active editor context into the local experience DB so the local LLM can learn from saves, diagnostics, git commits, terminal/task failures, and test results.

## Project root
`E:\VS Code Agent\Solution`

## Key objectives
- Add a VS Code extension collector in `vscode-extension/collector.js`
- Capture signals from:
  - `workspace.onDidSaveTextDocument`
  - `languages.onDidChangeDiagnostics`
  - `tasks.onDidEndTaskProcess`
  - Git commit state via `vscode.extensions.getExtension('vscode.git')` or fallback polling
- Buffer events and flush them as staging files to `~/.vscode-rotator/vscode-signals/`
- Add CLI command `strategic-learning-unified-theatre llm ingest-staged`
- Keep the existing extension separate from logic by placing collector code outside `extension.js`
- Require opt-in via config, and hard-exclude secrets like `.env`, `*.key`, and `*.pem`

## New source_type values
- `vscode-edit`
- `vscode-diagnostic`
- `vscode-git`
- `vscode-terminal-error`
- `vscode-test-result`

## Architecture
1. VS Code events fire in `vscode-extension/collector.js`
2. Collector buffers events and debounces per-file saves
3. Periodic flush writes atomic staging files
4. CLI `llm ingest-staged` reads staging files, ingests documents, then deletes files
5. Experience DB stores new document chunks in `documents`

## Filters and privacy
- Allow: `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.md`, `.json`, `.yaml`, `.yml`, optionally `.txt`
- Exclude paths: `node_modules`, `.git`, `dist`, `build`, `out`, `coverage`, `*.min.js`, `*.map`
- Hard exclude secrets: `.env`, `.env.*`, `*.key`, `*.pem`, `*.p12`, `*.crt`, `*.jks`, `*.pfx`, `**/secrets/**`, `**/credentials/**`
- Size bounds: > 10 bytes and < 100 KB per file
- Debounce: max once per 10 minutes per file save

## Acceptance criteria
- `vscode-extension/collector.js` exists and is clean ESM
- Collector handles file saves, diagnostics, git, and task exit errors
- Buffer flush writes atomic staging files with chmod 600
- `llm ingest-staged` ingests staged signals and deletes staging files
- Passive learning opt-in config exists
- Existing test suite remains passing

## Metrics and success
- Passive learning should add useful local context to `experience.db`
- New source types should be queryable via prompt generation
- No secret-staged files should be generated
- The collector should not re-ingest the same save more than once in 10 minutes

## Next sprint candidate
- Sprint 13: LoRA Fine-Tuning Pipeline
- Precondition: passive learning should be implemented and experience.db should contain quality-tagged data

