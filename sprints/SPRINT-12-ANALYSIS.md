# Sprint 12 Analysis — VS Code Passive Learning

## Q1 — Experience DB Ingestion Contract

### a. Ingestion signature
- The active ingestion entry point is:
  - `DocumentIngester.ingestFile(filePath, { fileTs, source_type, platform, metadata, tags } = {})`
- The thread-specific entry point is:
  - `DocumentIngester.ingestThread(filePath, { platform } = {})`
- There is no `ingestDocument(...)` named function in the reviewed code.

### b. `documents` fields
`ExperienceDb.replaceDocumentsForFile()` writes document rows with these fields:
- `id`
- `filename`
- `chunk_index`
- `content`
- `embedding`
- `source_type`
- `platform`
- `metadata`
- `quality`
- `notes`
- `turn_index`
- `last_ingested`
- `file_ts`

### c. Current `source_type` values
The codebase already uses these values:
- `vscode-edit`
- `vscode-diagnostic`
- `vscode-diagnostic-recurring`
- `vscode-git`
- `vscode-task-error`
- `vscode-signal`
- `thread-turn`
- `llm-response`
- implicit extension-derived values such as `md`, `txt`, etc.

> The `experience-db.js` layer does not register source types explicitly. `source_type` is stored as a free-form string, so new values can be added without schema changes.

### d. Maximum chunk size
- The ingester chunks with `chunkText(text, { tokens = 512, overlap = 64 })`.
- Large content is split into 512-token chunks with 64-token overlap.
- There is no separate hard chunk-size limit in the ingester itself.
- For staged editor signals, the collector uses `vscodeLearn.maxFileSizeBytes` to skip oversized content.

### e. Deduplication
- Deduplication is primarily path-based.
- `ingestFile()` calls `ExperienceDb.replaceDocumentsForFile(absolute, chunksWithEmbeddings)`.
- `replaceDocumentsForFile()` removes all existing documents for the same `filename` before inserting new chunks.
- The ingestion log also tracks per-path ingestion with `upsertIngestionLog()`.
- For thread ingestion, `ingestThread()` skips previously ingested thread files via the ingestion log.
- The current collector also debounces repeated identical signal keys before staging.

### f. Extension vs CLI subprocess
- The extension can ingest directly via imported modules.
- `vscode-extension/collector.js` already imports `DocumentIngester` directly.
- The preferred direct extension path is:
  - `import { DocumentIngester } from "../src/llm/document-ingester.js"`
  - `const ingester = new DocumentIngester({ baseDir });`
  - `await ingester.initialize();`
  - `await ingester.ingestFile(filePath, { source_type: "vscode-edit", fileTs, platform });`
- Therefore ingestion does not need to be forced through `runCli(['llm', 'ingest', ...])`.

## Q2 — File Edit Signal

### a. TextDocument data available
From `vscode.workspace.onDidSaveTextDocument(doc)`:
- `doc.fileName`
- `doc.languageId`
- `doc.getText()`
- `doc.lineCount`
- `doc.isDirty`
- `doc.uri.fsPath`
- `doc.uri`

### b. Filter rules
#### Include extensions
- `.js`
- `.ts`
- `.jsx`
- `.tsx`
- `.py`
- `.md`
- `.json`
- `.yaml`
- `.yml`
- `.txt` (optional)

#### Exclude paths
- `**/node_modules/**`
- `**/.git/**`
- `**/dist/**`
- `**/build/**`
- `**/out/**`
- `**/coverage/**`
- `**/test-output/**`
- `**/*.min.js`
- `**/*.map`

#### Secrets hard exclusion
- `.env`
- `.env.*`
- `**/*.key`
- `**/*.pem`
- `**/*.p12`
- `**/*.crt`
- `**/*.jks`
- `**/*.pfx`
- `**/secrets/**`
- `**/credentials/**`
- any path containing `secret`

#### Size bounds
- Minimum: `> 10 bytes`
- Maximum: `< 100 KB`

### c. Suggested chunk format
```
[source_type: vscode-edit]
file: src/llm/inference.js (javascript, 142 lines)
saved: 2026-05-21T14:32:00Z
---
<first 50 lines of file OR full file if <= 60 lines>
```

### d. Repeat save policy
- Recommend max one ingest per file path every **10 minutes**.
- If saved again during that window, defer to the next flush.
- Existing collector debounce is already the right model.

## Q3 — Diagnostic Signal

### a. Diagnostic structure
A `Diagnostic` object typically includes:
- `severity`
- `message`
- `range`
- `source`
- `code`
- `relatedInformation`
- `tags`

### b. Only errors
- Ingest only `DiagnosticSeverity.Error`.
- Enum values are:
  - `Error = 0`
  - `Warning = 1`
  - `Information = 2`
  - `Hint = 3`

### c. Event listener
- Use `vscode.languages.onDidChangeDiagnostics((event) => { ... })`.
- Payload exposes `event.uris`.
- The current collector already uses this API.

### d. MistakeTracker contract
- Signature: `MistakeTracker.addMistake({ description, category, fix_applied, root_cause, recurrence_count, ... })`
- Dedup is semantic, not raw-text-only.
- The collector must dedupe identical diagnostics by file+message before calling `addMistake`.

### e. Diagnostic chunk example
```
[source_type: vscode-diagnostic]
file: src/llm/inference.js
severity: error
message: "Cannot find name 'embeddings'"
count: 3
first_seen: 2026-05-21T14:28:00Z
last_seen: 2026-05-21T14:32:00Z
range: [12,4]-[12,14]
---
Cannot find name 'embeddings'.
```

## Q4 — Git Signal

### a. Git API import
- Use `vscode.extensions.getExtension('vscode.git')`.

### b. Git events
- The repo does not currently wire Git extension events.
- Existing code is CLI/poll-based, not event-based.

### c. Fallback command
- `git log -1 --format="%H|%s|%ai"`
- Parse into commit hash, message, and timestamp.

### d. Git chunk example
```
[source_type: vscode-git]
commit: a1b2c3d
message: "Add retry logic to fetchData"
files_changed:
  - src/fetcher.js
  - src/utils.js
timestamp: 2026-05-21T14:35:00Z
```

## Q5 — Terminal Error Signal

### a. API availability
- `window.onDidWriteTerminalData` is not part of the reviewed stable code.
- It remains a proposed API and cannot be counted on here.

### b. Fallback capture
- Use `vscode.tasks.onDidEndTaskProcess` for non-zero exits.
- Capture CLI/output-channel errors from the extension itself.
- Record task command, exit code, and last available output.

### c. Minimum viable capture
- `command`
- `exit_code`
- `timestamp`
- last available error output
- label as `vscode-terminal-error` if raw terminal text is unavailable

## Q6 — Privacy & Performance Constraints

### a. Safeguards
- Require opt-in via `vscodeLearn.enabled` in `src/config.js`.
- Use `vscodeLearn.allowedExtensions` for allowlist control.
- Hard exclude secret file patterns regardless of config.

### b. Embedding cost
- Present backend is `deterministic-hash` fallback.
- 60-line sample embedding time: **5 ms**.
- Initialization time: **~3566 ms**.
- Per-save embedding is fast for the current fallback.
- If `onnxruntime-node` is enabled later, batching should be reconsidered.

### c. DB growth
- Current `experience.db` counts:
  - `documents`: 0
  - `sprints`: 0
  - `mistakes`: 1
  - `ingestion_log`: 0
- At 40 docs/day, 30 days → ~1200 docs.
- Because each doc stores a 768-d embedding, pruning is recommended.

### Recommended pruning
- Keep last 30 days of `vscode-edit` docs.
- Retain `vscode-diagnostic-recurring` docs indefinitely.
- Keep `vscode-task-error` / `vscode-terminal-error` docs for 60–90 days.
- Preserve high-quality `thread-turn` / `llm-response` docs longer.

## Q7 — Collector Architecture Decision

### Option evaluation
- `Option A`: too expensive for save-heavy workflows.
- `Option C`: minimal overhead but higher extension complexity.
- `Option B`: best balance.

### Recommendation
- Choose **Option B — in-process with batched write**.

### Rationale
- It matches the current `vscode-extension/collector.js` design.
- It avoids one Node process per editor event.
- It preserves local ingestion and a staging/flush boundary.
- It is the best match for passive VS Code learning.

## Architecture Decision
- Implement passive VS Code learning as a **batched staging pipeline**.
- Stage signals in `~/.vscode-rotator/vscode-signals`.
- Flush staged documents through `DocumentIngester.ingestFile()`.
- Treat `source_type` as flexible metadata rather than a rigid registry.

## Privacy Rules
Hard exclude these patterns without exception:
- `**/.env`
- `**/.env.*`
- `**/*.key`
- `**/*.pem`
- `**/*.p12`
- `**/*.crt`
- `**/*.jks`
- `**/*.pfx`
- `**/secrets/**`
- `**/credentials/**`
- `**/*secret*.*`

## New source_type Values
- `vscode-edit`
- `vscode-diagnostic`
- `vscode-git`
- `vscode-terminal-error`
- `vscode-test-result`

## Blockers
- No stable terminal output API is available in current extension runtime.
- Git extension event wiring is not implemented.
- `experience.db` currently has no document chunks yet.
- The embedding layer is on the deterministic-hash fallback, not ONNX/real embedding.

## Safe to Proceed
- **Verdict: YES — safe to proceed.**
- The repo already supports a batched signal collector.
- The remaining work is to implement the capture contracts and wire them into the existing ingestion pipeline.
