# Sprint 12 — VS Code Passive Learning: Teach the Local LLM From Your Editor
## Three AI Agent Prompts

> **Always read `strategic-learning-unified-theatre-master-instructions.md` before starting any prompt.**
> Max tokens per prompt: 150K | Project root: `E:\VS Code Agent\Solution\`
> Current baseline: **139 tests passing**, all green.
> Prerequisite: Sprint 11A (Core Extension Commands) must be complete.

---

## ⚠️ Architecture Honest Note (Read This First)

The local LLM (phi3 via `node-llama-cpp`) **cannot update its weights at runtime** — it
is inference-only. "Learning" in this sprint means making the model's **context window
smarter via RAG** (Retrieval-Augmented Generation), which is already how `experience.db`
works. Every VS Code signal captured here becomes a document that gets embedded,
stored, and retrieved when the prompt generator assembles context.

**Result**: The model doesn't retrain — but it answers with *your codebase's vocabulary,
your error history, your git decisions, and your active working context*. That is
functionally equivalent to learning, without GPU or fine-tuning.

---

## What VS Code Knows That the LLM Currently Doesn't

| VS Code Signal | Source API | Value to LLM |
|---|---|---|
| Files you edit & save | `workspace.onDidSaveTextDocument` | Active working context |
| Git commits + messages | `git` extension API / `child_process` | Decision history & patterns |
| Terminal output (errors) | `window.createTerminal` + PTY | Errors hit → auto-mistake records |
| Diagnostics (lint/TS errors) | `languages.getDiagnostics()` | Recurring problems → rubric rules |
| Active file + open tabs | `window.activeTextEditor`, `window.tabGroups` | Current mental context |
| Test run results | Output channel parse / task events | Pass/fail per module |
| Workspace folder structure | `workspace.findFiles` | Project shape & conventions |

All 7 signals feed into the existing `experience.db` `documents` table via `document-ingester.js`.
No new tables needed. New `source_type` values are added: `vscode-edit`, `vscode-diagnostic`,
`vscode-git`, `vscode-terminal-error`, `vscode-test-result`.

---

---

## PROMPT 1 — Analysis: What Can We Capture and How?

> **Goal**: Audit the VS Code extension APIs available, verify the ingestion pipeline can
> accept new source types, and define the exact capture contract before writing any code.

---

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Read BEFORE doing anything:
  - E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md   (full file — authoritative)
  - E:\VS Code Agent\Solution\vscode-extension\extension.js  (Sprint 11A result)
  - E:\VS Code Agent\Solution\src\llm\document-ingester.js   (ingestion pipeline)
  - E:\VS Code Agent\Solution\src\llm\experience-db.js       (DB schema + insert ops)
  - E:\VS Code Agent\Solution\src\llm\embeddings.js          (embedding model)
  - E:\VS Code Agent\Solution\src\llm\prompt-generator.js    (how context is retrieved)
  - E:\VS Code Agent\Solution\src\browser-selectors.js       (source_type examples)

Sprint: Sprint 12 — VS Code Passive Learning
Status: 139 tests passing. Extension has 6 core commands (Sprint 11A).
Task: ANALYSIS ONLY. Answer all 7 questions below. Write output to
      E:\VS Code Agent\Solution\sprints\SPRINT-12-ANALYSIS.md.

---

QUESTION 1 — Experience DB Ingestion Contract
  Read `document-ingester.js` and `experience-db.js` carefully.

  a. What is the exact function signature used to insert a document chunk?
     (e.g. ingestDocument(content, metadata) — capture all fields)
  b. What fields does the `documents` table have? List all columns.
  c. What `source_type` values currently exist in the codebase?
     (grep for source_type across src/ and tests/)
  d. Is there a maximum chunk size enforced? What happens if content > that size?
  e. Does the ingester deduplicate? How? (hash? path? both?)
     We must NOT re-ingest the same file-save event repeatedly.
  f. Can ingestDocument be called from the extension process (different Node.js process
     from the CLI)? Or must it always go through `runCli(['llm', 'ingest', ...])`?
     Document the correct call path.

QUESTION 2 — File Edit Signal
  VS Code API: `vscode.workspace.onDidSaveTextDocument`

  a. What data is available on the TextDocument object?
     (fileName, languageId, getText(), lineCount, isDirty, uri.fsPath — confirm all)
  b. We want to ingest only meaningful saves (not node_modules, not .git, not binary).
     Define the filter rules:
       - Which file extensions should be included? (suggest: .js .ts .jsx .tsx .py .md .json .yaml)
       - Which path patterns should be excluded? (node_modules, .git, dist, *.min.js)
       - Minimum file size? Maximum? (suggest: > 10 bytes, < 100 KB)
  c. What should the ingested chunk look like?
     Suggest a template. Example:
       [source_type: vscode-edit]
       file: src/llm/inference.js (javascript, 142 lines)
       saved: 2026-05-21T14:32:00Z
       ---
       <first 50 lines of file OR full file if < 60 lines>
  d. How often should the same file be re-ingested on repeat saves?
     Suggest a debounce / cooldown strategy (e.g. max once per 10 minutes per file path).

QUESTION 3 — Diagnostic Signal (Lint / TypeScript Errors)
  VS Code API: `vscode.languages.getDiagnostics()`

  a. What is the structure of a Diagnostic object?
     (severity, message, range, source, code — confirm all fields)
  b. We only want `DiagnosticSeverity.Error` (not Warning/Info/Hint). Confirm the enum values.
  c. How do we listen for diagnostic changes?
     (API: `vscode.languages.onDidChangeDiagnostics` — confirm signature and event payload)
  d. A recurring error (same message, same file, ≥ 2 occurrences) should auto-create a
     mistake record via `mistake-tracker.js`. Review that module:
       - What is the function signature to record a mistake?
       - Does it deduplicate by message text? If not, we must deduplicate in the collector.
  e. Define what a diagnostic chunk should look like in the documents table:
       [source_type: vscode-diagnostic]
       file: src/llm/inference.js
       severity: error
       message: "Cannot find name 'embeddings'"
       count: 3   ← occurrences seen this session
       first_seen / last_seen timestamps

QUESTION 4 — Git Signal
  We want to capture git commit messages and changed file lists when the user commits
  from within VS Code (or from terminal while VS Code is open).

  a. Does VS Code expose a Git extension API? If yes, what is the import path?
     (hint: `vscode.extensions.getExtension('vscode.git')`)
  b. What events does the Git API expose?
     (look for: onDidCommit, repositories, state.onDidChange)
  c. Fallback: if Git API is unavailable, we can poll `git log -1 --format="%H|%s|%ai"`
     every 60 seconds via `child_process`. Define exact command + output parse.
  d. What should a git chunk look like?
       [source_type: vscode-git]
       commit: a1b2c3d
       message: "Add retry logic to fetchData"
       files_changed: src/fetcher.js, src/utils.js
       timestamp: 2026-05-21T14:35:00Z

QUESTION 5 — Terminal Error Signal
  We want to detect when a terminal command exits with a non-zero code and capture
  the last N lines of output as an error context document.

  a. Does VS Code expose terminal output programmatically?
     (As of VS Code 1.80, `window.onDidWriteTerminalData` exists behind a proposed API —
      confirm if it's available in stable or only in proposed API builds.)
  b. If the terminal write API is unavailable: what is the fallback?
     (Suggest: parse the Output channel for the extension's own CLI errors — at minimum,
      capture runCli() errors from Sprint 11A commands and auto-ingest them.)
  c. Define minimum viable terminal capture: if the full PTY stream is unavailable,
     what error signals CAN we reliably capture from the extension context?
     (hint: task execution events via `tasks.onDidEndTaskProcess`)

QUESTION 6 — Privacy & Performance Constraints
  a. File content ingestion: we will be reading and embedding workspace files.
     What safeguards are needed?
       - Should the user explicitly opt-in (config flag: "vscodeLearn": true)?
       - Should there be a file allowlist/blocklist in config.json?
       - Should secrets (env files, .env, *.key, *.pem) be hard-excluded regardless of config?
  b. Embedding cost: all-MiniLM-L6-v2 runs on CPU. How long does it take to embed
     a 60-line file on this machine? (Run a quick benchmark if possible.)
     Is batching needed, or is per-save embedding fast enough?
  c. DB growth: how many documents are in experience.db today?
     At ~5 file saves/hour × 8 hours = 40 docs/day, how long until the DB becomes unwieldy?
     Is there a pruning strategy (e.g. keep only last 30 days of vscode-edit docs)?

QUESTION 7 — Collector Architecture Decision
  Two implementation options:

  OPTION A — In-process (extension.js)
    The extension registers all event listeners directly in extension.js.
    On each event, it calls runCli(['llm', 'ingest-raw', '--content', chunk, '--source', type]).
    Pro: simple. Con: spawns a Node process per event — expensive at high frequency.

  OPTION B — In-process with batched write
    The extension accumulates events in memory and flushes to a staging file
    (~/.vscode-rotator/vscode-signals/<timestamp>.md) every N seconds.
    A background CLI call ingests the staging file.
    Pro: low overhead. Con: slight delay before signals are queryable.

  OPTION C — Direct DB write via imported module
    Import experience-db.js and document-ingester.js directly into extension.js
    (possible since both are ESM and extension can use dynamic import()).
    Pro: no subprocess per event. Con: ESM/CJS boundary must be managed carefully.

  Recommendation: Which option is most consistent with the existing architecture?
  Consider: the CLI already spawns for all 6 Sprint 11A commands. Is a debounced
  batch write (Option B) the right balance?
  Document your recommendation with rationale.

---

DELIVERABLE
  Write `SPRINT-12-ANALYSIS.md` in `E:\VS Code Agent\Solution\sprints\` with:
    - Answers to all 7 questions (headers Q1–Q7)
    - "Architecture Decision" section: chosen option + rationale
    - "Privacy Rules" section: exact list of hard-excluded file patterns
    - "New source_type Values" section: all 5 new types with chunk templates
    - "Blockers" section: anything unresolved
    - "Safe to Proceed" verdict

---

⛔ DO NOT START CODING. Analysis and documentation only.
```

---

---

## PROMPT 2 — Coding: Build the VS Code Passive Collector

> **Goal**: Implement the VS Code Context Collector — a passive listener inside the
> extension that captures editor signals and feeds them into the experience DB.

---

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Read BEFORE doing anything:
  - E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md        (full file)
  - E:\VS Code Agent\Solution\sprints\SPRINT-12-ANALYSIS.md       (REQUIRED — answers from Prompt 1)
  - E:\VS Code Agent\Solution\vscode-extension\extension.js       (Sprint 11A — base to extend)
  - E:\VS Code Agent\Solution\src\llm\document-ingester.js
  - E:\VS Code Agent\Solution\src\llm\experience-db.js

Sprint: Sprint 12 — VS Code Passive Learning
Baseline: 139 tests passing. Do NOT break the existing suite.
Task: Implement VscodeContextCollector class + wire into extension.js.
      Log all decisions to E:\VS Code Agent\Solution\sprints\SPRINT-12-CODING-LOG.md.

---

ARCHITECTURE OVERVIEW (implement exactly as specified below)

  New file: `vscode-extension/collector.js`
  Role: VscodeContextCollector class — registers all VS Code event listeners,
        batches captured signals, and flushes to staging files for CLI ingestion.
  Extension.js change: instantiate collector in `activate()`, dispose in `deactivate()`.
  CLI change: add `llm ingest-staged` command that reads all files in
              `~/.vscode-rotator/vscode-signals/` and ingests them, then deletes them.

---

STEP 1 — Create `vscode-extension/collector.js`

  Export class: VscodeContextCollector

  Constructor:
    constructor(outputChannel, config)
      - outputChannel: VS Code OutputChannel (for logging)
      - config: { enabled, flushIntervalMs, maxFileSizeBytes, excludePatterns,
                  hardExcludePatterns, debounceMs, stagingDir }
      - stagingDir default: path.join(os.homedir(), '.vscode-rotator', 'vscode-signals')
      - flushIntervalMs default: 30000 (30 seconds)
      - debounceMs default: 600000 (10 minutes per file — prevent re-ingest spam)

  Method: activate(context)
    Registers all listeners. Push disposables to context.subscriptions.
    If config.enabled is false: log "strategic-learning-unified-theatre: passive learning disabled" and return.

  Method: deactivate()
    Clear flush interval. Flush any remaining buffered signals synchronously (best-effort).

  Internal: this._buffer = []   ← array of { source_type, content, metadata }
  Internal: this._lastSeen = Map<filePath, timestamp>   ← debounce tracker

  LISTENER 1 — File Save (source_type: 'vscode-edit')
    Register: vscode.workspace.onDidSaveTextDocument(doc => this._onFileSave(doc))

    _onFileSave(doc):
      1. Check doc.uri.scheme === 'file' (not untitled/git/output)
      2. Apply hard-exclude patterns (see Privacy Rules from SPRINT-12-ANALYSIS.md):
           .env, *.key, *.pem, *.p12, *.pfx, *.secret, id_rsa, id_ed25519, *.enc
           node_modules/*, .git/*, dist/*, build/*, *.min.js, *.min.css
         If matched: return silently (never log or ingest these)
      3. Apply soft-exclude patterns (from config.excludePatterns):
           If matched: return silently
      4. Check debounce: if this._lastSeen.get(filePath) within debounceMs: return
      5. Read file size: if > config.maxFileSizeBytes (default 100 KB): skip + log warning
      6. Build chunk:
           const lines = doc.getText().split('\n')
           const preview = lines.slice(0, 60).join('\n')  // max 60 lines
           const content = [
             `[source_type: vscode-edit]`,
             `file: ${relativePath} (${doc.languageId}, ${doc.lineCount} lines)`,
             `saved: ${new Date().toISOString()}`,
             `---`,
             preview
           ].join('\n')
      7. Push to this._buffer: { source_type: 'vscode-edit', content, metadata: { filePath, languageId } }
      8. Update this._lastSeen.set(filePath, Date.now())
      9. outputChannel.appendLine(`[collector] queued edit: ${relativePath}`)

  LISTENER 2 — Diagnostics (source_type: 'vscode-diagnostic')
    Register: vscode.languages.onDidChangeDiagnostics(e => this._onDiagnosticsChange(e))

    _onDiagnosticsChange(event):
      1. For each uri in event.uris:
           const diags = vscode.languages.getDiagnostics(uri)
           const errors = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error)
           if errors.length === 0: continue
      2. Build chunk per file (group all errors for that file):
           const content = [
             `[source_type: vscode-diagnostic]`,
             `file: ${uri.fsPath}`,
             `timestamp: ${new Date().toISOString()}`,
             `error_count: ${errors.length}`,
             `---`,
             ...errors.map(d => `ERROR line ${d.range.start.line + 1}: ${d.message}`)
           ].join('\n')
      3. Track recurring errors in this._errorCounts = Map<"filePath:message", count>
           If count >= 2: also push a separate mistake-candidate chunk:
             { source_type: 'vscode-diagnostic-recurring', content, metadata: { filePath, message } }
      4. Push to buffer + log

  LISTENER 3 — Git Commits (source_type: 'vscode-git')
    Attempt: const gitExt = vscode.extensions.getExtension('vscode.git')?.exports
    If gitExt available:
      gitExt.getAPI(1).repositories.forEach(repo => {
        repo.state.onDidChange(() => this._onGitStateChange(repo))
      })
    Fallback (if gitExt unavailable):
      Poll every 60s with child_process: `git log -1 --format="%H|%s|%ai" --no-merges`
      executed from workspace root. Compare last seen commit hash to detect new commits.

    _onGitStateChange(repo) or _onGitPoll(stdout):
      1. Parse: hash, subject, timestamp
      2. Get changed files: repo.state.indexChanges.map(c => c.uri.fsPath) OR
         fallback: `git diff-tree --no-commit-id -r --name-only <hash>`
      3. Build chunk:
           [source_type: vscode-git]
           commit: <hash_short>
           message: <subject>
           files_changed: <comma-separated relative paths>
           timestamp: <ISO>
      4. Push to buffer

  LISTENER 4 — Task Exit Errors (source_type: 'vscode-task-error')
    Register: vscode.tasks.onDidEndTaskProcess(e => this._onTaskEnd(e))
      Only capture if e.exitCode !== 0 AND e.exitCode !== undefined

    _onTaskEnd(event):
      Build chunk:
        [source_type: vscode-task-error]
        task: ${event.execution.task.name}
        exit_code: ${event.exitCode}
        timestamp: ${new Date().toISOString()}
      Push to buffer + log

  FLUSH METHOD — _flush()
    If this._buffer.length === 0: return
    const filename = `${Date.now()}-vscode-signals.md`
    const stagingPath = path.join(this._stagingDir, filename)
    const fileContent = this._buffer.map(b => b.content).join('\n\n---\n\n')
    Write atomically: temp file → fsync → rename (match existing project conventions)
    chmod 600 the written file
    Clear this._buffer = []
    Log: outputChannel.appendLine(`[collector] flushed ${n} signals → ${filename}`)
    Then call: runCli(['llm', 'ingest-staged'])  ← triggers ingestion of staging dir

  Flush schedule: setInterval(() => this._flush(), this.flushIntervalMs) in activate()

---

STEP 2 — Add `llm ingest-staged` CLI command

  File: `E:\VS Code Agent\Solution\src\commands\llm.js`

  New sub-command: `ingest-staged`
    - Reads all *.md files from `~/.vscode-rotator/vscode-signals/`
    - For each file: calls DocumentIngester with source_type detection
      (parse [source_type: X] from first line of each chunk)
    - After successful ingestion: delete the staging file
    - On error: leave staging file in place (retry next flush)
    - Log count of chunks ingested to stdout

  Source type → ingestion metadata mapping:
    vscode-edit              → source_type: 'vscode-edit',   tags: ['editor', 'file-save']
    vscode-diagnostic        → source_type: 'vscode-diagnostic', tags: ['error', 'diagnostic']
    vscode-diagnostic-recurring → also call MistakeTracker.recordMistake(message, filePath)
    vscode-git               → source_type: 'vscode-git',    tags: ['git', 'commit']
    vscode-task-error        → source_type: 'vscode-task-error', tags: ['error', 'task']

---

STEP 3 — Wire into extension.js

  In activate(context):
    const config = loadCollectorConfig()  // reads from vscode config or config.json
    const collector = new VscodeContextCollector(outputChannel, config)
    collector.activate(context)

  In deactivate():
    collector.deactivate()

  Add new command: `strategic-learning-unified-theatre.togglePassiveLearning`
    Title: "Toggle Passive Learning"
    Action: flip config.vscodeLearn boolean in config.json via runCli(['config', 'set', 'vscodeLearn', value])
    Show info toast: "Passive learning [enabled/disabled]. Restart extension to apply."

  Add command to package.json contributes.commands.

---

STEP 4 — Config schema update

  File: `E:\VS Code Agent\Solution\src\config.js`

  Add to DEFAULT_CONFIG:
    "vscodeLearn": {
      "enabled": false,            ← opt-in, off by default
      "flushIntervalMs": 30000,
      "debounceMs": 600000,
      "maxFileSizeBytes": 102400,
      "excludePatterns": ["**/test/**", "**/fixtures/**"],
      "hardExcludePatterns": [     ← never overridden by user
        "**/.env*", "**/*.key", "**/*.pem", "**/*.secret",
        "**/node_modules/**", "**/.git/**", "**/dist/**"
      ]
    }

---

STEP 5 — Smoke Test

  Enable passive learning:
    strategic-learning-unified-theatre config set vscodeLearn.enabled true

  In VS Code (F5 dev host or real window):
  [ ] Open a .js file, make a small edit, save → check output channel logs "[collector] queued edit"
  [ ] After 30s flush: check `~/.vscode-rotator/vscode-signals/` — file should appear then disappear
  [ ] Check `~/.vscode-rotator/experience.db` — new rows with source_type='vscode-edit' present
  [ ] Introduce a TypeScript error → check diagnostic chunk queued in output channel
  [ ] Make a git commit → check git chunk queued
  [ ] Run `strategic-learning-unified-theatre llm related --to "the file you edited"` → should surface it

  Document results in SPRINT-12-CODING-LOG.md.

---

ACCEPTANCE CRITERIA (all must pass before Prompt 3):
  ✅ collector.js exists, < 400 lines, clean ESM
  ✅ Hard-exclude list blocks .env, *.key, *.pem silently — verified with a test .env save
  ✅ Debounce prevents re-ingesting the same file within 10 minutes
  ✅ Flush writes atomic temp→rename staging file, chmod 600
  ✅ `llm ingest-staged` command ingests + deletes staging files
  ✅ New vscode-edit rows visible in experience.db after a file save + flush
  ✅ togglePassiveLearning command appears in Command Palette
  ✅ extension.js remains < 500 lines (collector is a separate file)
  ✅ 139 existing tests still pass (run npm test)

---

⛔ DO NOT WRITE UNIT TESTS OR RUN E2E TESTS YET. Coding and smoke tests only.
```

---

---

## PROMPT 3 — Testing & Docs: Prove It Learns, Then Lock It In

> **Goal**: Write unit tests for VscodeContextCollector and `ingest-staged`.
> Run full regression. Verify the end-to-end learning loop works. Update master instructions.

---

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Read BEFORE doing anything:
  - E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md        (full file — authoritative)
  - E:\VS Code Agent\Solution\sprints\SPRINT-12-ANALYSIS.md
  - E:\VS Code Agent\Solution\sprints\SPRINT-12-CODING-LOG.md
  - E:\VS Code Agent\Solution\vscode-extension\collector.js       (Prompt 2 output)
  - E:\VS Code Agent\Solution\src\commands\llm.js                 (includes ingest-staged)
  - E:\VS Code Agent\Solution\tests\                              (existing test patterns)

Sprint: Sprint 12 — VS Code Passive Learning
Baseline: 139 tests passing. Goal: finish at ≥ 164 tests passing (25 new).
Task: Unit tests, E2E learning loop verification, regression, docs update, sprint close.

---

STEP 1 — Unit Tests: `tests/vscode-collector.test.js`

  Framework: vitest. Mock vscode module (same pattern as Sprint 11A extension tests).
  Mock fs/promises for staging file writes. Mock child_process for runCli calls.
  Target: ≥ 20 tests covering collector behaviour.

  ── Constructor & Config (3 tests) ─────────────────────────────────────────
  1. When config.enabled=false: activate() registers no listeners and returns early
  2. Default config values apply when config fields are missing
  3. stagingDir defaults to ~/.vscode-rotator/vscode-signals/

  ── File Save Listener (6 tests) ────────────────────────────────────────────
  4. .env file save → silently skipped, NOT pushed to buffer
  5. *.key file save → silently skipped
  6. node_modules/ file → silently skipped
  7. Valid .js file save → chunk pushed to buffer with correct source_type header
  8. Same file saved twice within debounceMs → only one chunk buffered
  9. File > maxFileSizeBytes → skipped with warning logged to outputChannel

  ── Diagnostic Listener (4 tests) ───────────────────────────────────────────
  10. DiagnosticSeverity.Warning → ignored (not pushed to buffer)
  11. DiagnosticSeverity.Error → chunk pushed with correct format
  12. Same error seen ≥ 2 times → recurring mistake chunk also pushed
  13. Multiple errors in same file → grouped in single chunk

  ── Git Listener (2 tests) ──────────────────────────────────────────────────
  14. Git state change with new commit → chunk pushed with hash, message, files_changed
  15. Git fallback poll: `git log -1` stdout parsed correctly into chunk fields

  ── Task Error Listener (2 tests) ───────────────────────────────────────────
  16. Task exits with code 0 → NOT pushed to buffer
  17. Task exits with code 1 → chunk pushed with task name and exit_code

  ── Flush (3 tests) ─────────────────────────────────────────────────────────
  18. Empty buffer → _flush() does NOT write any file
  19. Buffer with 3 signals → staging file written with signals separated by `---`
  20. After flush: buffer is cleared and runCli(['llm', 'ingest-staged']) is called

  ── Additional: `llm ingest-staged` CLI command (5 tests in tests/llm.test.js) ──
  21. Staging dir empty → command exits 0, logs "0 chunks ingested"
  22. Staging file with 2 chunks → both ingested, file deleted
  23. Ingestion error on one chunk → file retained, error logged, exit 0 (non-fatal)
  24. source_type: vscode-diagnostic-recurring → MistakeTracker.recordMistake called
  25. source_type: vscode-edit → document inserted with correct tags ['editor', 'file-save']

  Run npm test and confirm:
    - All 25 new tests pass
    - All 139 pre-existing tests still pass
    - Total passing count ≥ 164

---

STEP 2 — E2E Learning Loop Verification (Manual)

  This is the most important test in the sprint: prove the full loop works.

  Setup:
    strategic-learning-unified-theatre config set vscodeLearn.enabled true
    rm -f ~/.vscode-rotator/vscode-signals/*   ← clean slate

  Loop test sequence (run in real VS Code, not dev host):

  ROUND 1 — Teach it something:
    a. Open `E:\VS Code Agent\Solution\src\llm\inference.js`
    b. Add a comment: `// SPRINT-12-MARKER: testing passive learning`
    c. Save the file
    d. Wait 35 seconds (flush interval + ingest)
    e. Run: strategic-learning-unified-theatre llm related --to "inference"
       → VERIFY: output references inference.js (source_type: vscode-edit)

  ROUND 2 — Teach it an error:
    a. Open any .ts file in the workspace
    b. Introduce a deliberate type error: `const x: number = "wrong"`
    c. Wait for VS Code to show the red squiggle (diagnostic fires)
    d. Wait 35 seconds for flush
    e. Run: strategic-learning-unified-theatre llm related --to "type error"
       → VERIFY: output references the diagnostic chunk

  ROUND 3 — Teach it a git decision:
    a. Make a small real change (add a comment to any file)
    b. Commit: git commit -am "Sprint 12: test passive git capture"
    c. Wait 35 seconds
    d. Run: strategic-learning-unified-theatre llm related --to "Sprint 12"
       → VERIFY: output includes the commit message

  ROUND 4 — Prove the LLM uses it:
    a. Run: strategic-learning-unified-theatre llm ask "What was the last file I edited in VS Code?"
       → VERIFY: response references inference.js (context from experience.db)
    b. Run: strategic-learning-unified-theatre llm ask "Have I had any TypeScript errors recently?"
       → VERIFY: response mentions the type error from Round 2

  Document all 4 round results in SPRINT-12-CODING-LOG.md under "E2E Learning Loop Results".
  Note: Round 4 depends on phi3 being installed. If not, document "Model not installed — Rounds 1–3
  verify ingestion pipeline; Round 4 deferred until model is available."

---

STEP 3 — Privacy Verification

  Confirm hard-exclude never leaks secrets:
  [ ] Create a temp file: `echo "SECRET_KEY=abc123" > /tmp/test.env`
      Open it in VS Code, save it → output channel must NOT show "[collector] queued"
  [ ] Create `test.pem` in workspace root, save → silently skipped
  [ ] Confirm NO .env content appears in experience.db:
        sqlite3 ~/.vscode-rotator/experience.db "SELECT content FROM documents WHERE source_type='vscode-edit' AND content LIKE '%SECRET%'"
        → must return 0 rows
  Document results in coding log.

---

STEP 4 — Regression: Full CLI Suite
  From E:\VS Code Agent\Solution\:
    npm test
  Confirm: ≥ 164 tests passing, 0 failing.

---

STEP 5 — Update Master Instructions
  File: `E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md`

  5a. Add entry under "What's Changed":
  ```
  ### ✅ Sprint 12 — VS Code Passive Learning — COMPLETE (<today's date>)
  - VscodeContextCollector added to vscode-extension/collector.js
  - Captures: file saves, TypeScript/lint errors, git commits, task exit errors
  - Hard-exclude list blocks secrets (.env, *.key, *.pem) unconditionally
  - 10-minute debounce per file prevents re-ingest spam
  - 30-second flush cycle writes atomic staging files → ingest-staged CLI
  - New CLI command: `strategic-learning-unified-theatre llm ingest-staged`
  - Opt-in via config: vscodeLearn.enabled (default: false)
  - E2E learning loop verified: file save → DB → `llm related` returns result
  - Test count: <final number> tests passing ✅
  ```

  5b. Update Architecture diagram — add new layer above the existing diagram:
  ```
  VS Code Editor (file saves · diagnostics · git commits · task errors)
          ↓  [VscodeContextCollector — vscode-extension/collector.js]
    ~/.vscode-rotator/vscode-signals/<ts>-vscode-signals.md  (staging)
          ↓  [`llm ingest-staged` CLI command]
  ```
  Then the existing diagram continues from Experience DB downward.

  5c. Update Module Map table — add new row:
    | `vscode-extension/collector.js` | VS Code passive signal collector (edits, diagnostics, git, tasks) |

  5d. Update Module Maturity table:
    | Electron UI / VS Code Extension | 🟡 IN PROGRESS | <n> pass | Core commands stable (11A). Passive learning active (12). Sidebar views next (12B). |

  5e. Add new `source_type` values to "What's Changed" or a new "Source Types" section:
    vscode-edit, vscode-diagnostic, vscode-diagnostic-recurring, vscode-git, vscode-task-error

  5f. Update "Last Updated" line:
    `Last Updated: <today's date> — Sprint 12 Complete. <final count> tests passing.`

---

STEP 6 — Close Sprint & Handoff
  6a. strategic-learning-unified-theatre handoff update <sprint-id> --tokens-used <n>
  6b. strategic-learning-unified-theatre handoff close <sprint-id> --status complete
  6c. strategic-learning-unified-theatre handoff resume <sprint-id>
      Copy resumePrompt → paste at top of Sprint 13 document.

  6d. In SPRINT-12-CODING-LOG.md, append "Sprint 13 Recommended Scope":
    Option A: Sidebar views (Ideas Tree + Related Context panel) — visual layer
    Option B: Fine-tuning pipeline (LoRA adapter on phi3 using experience.db data) — true weight update
    Option C: Active suggestions (extension proactively surfaces related context as you type) — UX layer
    Document which of A/B/C is highest value given current system state.

---

FINAL ACCEPTANCE GATE:
  ✅ ≥ 25 new tests passing (collector + ingest-staged)
  ✅ 139 pre-existing tests still passing (no regression)
  ✅ Hard-exclude verified: .env and *.key never ingested
  ✅ E2E loop verified: save → flush → ingest → `llm related` returns the file
  ✅ strategic-learning-unified-theatre-master-instructions.md updated with new architecture diagram layer
  ✅ Sprint closed in handoff tracker
  ✅ Resume prompt for Sprint 13 captured
```

---

# Sprint 13 — LoRA Fine-Tuning Pipeline: Teaching the Local LLM From Experience
## Three AI Agent Prompts

> **Always read `strategic-learning-unified-theatre-master-instructions.md` before starting any prompt.**
> Max tokens per prompt: 150K | Project root: `E:\VS Code Agent\Solution\`
> Current baseline: **139+ tests passing**, all green.
> Prerequisite: Sprint 12 (VS Code Passive Learning) complete, or `experience.db`
> must contain ≥ 50 quality-tagged documents before fine-tuning is meaningful.

---

## ⚠️ Architecture Honest Notes (Read Before Any Prompt)

### What LoRA actually does
LoRA (Low-Rank Adaptation) does NOT retrain the base model. It trains a small set of
extra weight matrices (the "adapter") that are added on top of the frozen base model at
inference time. The base phi3 GGUF file never changes. The adapter is a separate file
(typically 10–50 MB vs the base model's 2–4 GB). node-llama-cpp loads both together.

### The conversion step everyone misses
Python LoRA trainers (unsloth, trl, transformers) produce adapters in PyTorch/safetensors
format. node-llama-cpp requires GGUF format. There is a mandatory conversion step:
  Python adapter (.safetensors) → llama.cpp convert script → adapter (.gguf)
This sprint must implement that conversion. Skipping it = non-loadable adapter.

### CPU vs GPU reality for phi3 (3.8B parameters)
  GPU (RTX 3060+):    ~20–60 minutes for 100 training pairs, rank 16
  CPU only:           ~6–20 HOURS for same dataset
The scheduler must run fine-tuning when the machine is idle (overnight).
Fine-tuning is triggered by the scheduler, NOT interactively.
A progress file is written so the user can check status without blocking.

### Minimum viable training dataset
LoRA on phi3 needs ≥ 50 high-quality instruction pairs to produce any signal.
Below that, the adapter will overfit and produce worse results than no adapter.
Prompt 1 MUST audit experience.db and give a go/no-go verdict on data readiness.
If data is insufficient, Prompt 1 outputs a data collection plan instead of proceeding.

### Phi3 instruction format (CRITICAL — wrong format = garbage adapter)
Phi3 uses this exact template. Any deviation produces a non-functional adapter:
  <|user|>
  {instruction}
  <|end|>
  <|assistant|>
  {response}
  <|end|>

Multi-turn (for thread-turn source_type):
  <|user|>{turn1_user}<|end|><|assistant|>{turn1_assistant}<|end|>
  <|user|>{turn2_user}<|end|><|assistant|>{turn2_assistant}<|end|>

---

## Data Sources Already in experience.db → Training Signal Mapping

| Table / source_type        | Training signal                        | Format          | Min quality gate          |
|----------------------------|----------------------------------------|-----------------|---------------------------|
| prompt_history (rating ≥ 4)| Good prompts → positive examples      | instruction/out | rating field ≥ 4          |
| prompt_history (rating ≤ 2)| Bad prompts → skip or negative signal  | skip            | never use as positive      |
| mistakes table             | Error patterns → "don't do this"      | system rules    | recurrence ≥ 2            |
| rubric_rules table         | Preferred behaviour → system prompt   | system prefix   | all rows                  |
| documents (quality=good)   | Domain knowledge → context pairs       | instruction/out | quality=good only          |
| documents (thread-turn)    | Conversation style → multi-turn pairs  | multi-turn      | source_type=thread-turn    |
| documents (vscode-edit)    | Your codebase vocabulary → context    | instruction/out | quality != bad             |
| documents (vscode-git)     | Decision history → rationale pairs    | instruction/out | no quality filter needed   |

---

---

## PROMPT 1 — Analysis: Is the Data Ready and What Will Training Cost?

> **Goal**: Audit experience.db for training data quality and volume. Define the exact
> JSONL format for phi3. Benchmark CPU fine-tuning time. Give a go/no-go verdict.
> Write everything to SPRINT-13-ANALYSIS.md before any code is written.

---

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Read BEFORE doing anything:
  - E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md     (full file — authoritative)
  - E:\VS Code Agent\Solution\src\llm\experience-db.js         (DB schema + all query functions)
  - E:\VS Code Agent\Solution\src\llm\prompt-generator.js      (how context is currently assembled)
  - E:\VS Code Agent\Solution\src\llm\inference.js             (node-llama-cpp wrapper — read carefully)
  - E:\VS Code Agent\Solution\src\llm\mistake-tracker.js       (mistake + rubric_rules schema)
  - E:\VS Code Agent\Solution\src\config.js                    (DEFAULT_CONFIG + enhanceSchedule pattern)
  - E:\VS Code Agent\Solution\src\watcher.js                   (enhanceTimer pattern to replicate)

Sprint: Sprint 13 — LoRA Fine-Tuning Pipeline
Baseline: 139+ tests passing. ANALYSIS ONLY this prompt.
Output file: E:\VS Code Agent\Solution\sprints\SPRINT-13-ANALYSIS.md

---

QUESTION 1 — Experience DB Schema Audit
  Open ~/.vscode-rotator/experience.db with sqlite3 (or read experience-db.js carefully).

  a. List ALL tables with their column names and types. Specifically confirm:
       - documents:     id, content, source_type, quality, platform, embedding, created_at, tags
       - mistakes:      id, message, file_path, recurrence, promoted_to_rubric, created_at
       - rubric_rules:  id, rule_text, source_mistake_id, created_at
       - prompt_history: id, goal, platform, prompt_text, response_file, rating, cycle_ts
       - sprints:       id, name, status, created_at, closed_at, tokens_used
     Correct any columns that differ from the above.

  b. For each table that will contribute training data, run a COUNT query and record:
       SELECT source_type, quality, COUNT(*) FROM documents GROUP BY source_type, quality;
       SELECT COUNT(*) FROM mistakes WHERE recurrence >= 2;
       SELECT COUNT(*) FROM rubric_rules;
       SELECT COUNT(*), AVG(rating) FROM prompt_history WHERE rating IS NOT NULL;
       SELECT COUNT(*) FROM prompt_history WHERE rating >= 4;
       SELECT COUNT(*) FROM prompt_history WHERE rating <= 2;

  c. Assess content quality of the top 10 documents by created_at DESC:
       For each: does the content field contain a complete, coherent piece of text?
       Or is it a truncated chunk, a filename only, or near-empty?
       Rate each: GOOD / PARTIAL / EMPTY.

  d. Go/No-Go data verdict:
       READY:     prompt_history has ≥ 50 rows with rating ≥ 4
                  OR documents has ≥ 100 rows with quality='good'
       PARTIAL:   25–49 good prompt_history rows OR 50–99 good documents
                  → proceed but note adapter quality may be low; re-run after more data
       NOT READY: < 25 usable rows total across all tables
                  → STOP. Output a data collection plan (see below) instead of proceeding.

  If NOT READY: write a "Data Collection Plan" section in SPRINT-13-ANALYSIS.md:
    - How many more sessions of `strategic-learning-unified-theatre llm enhance` are needed
    - Whether Sprint 12 passive learning needs more time
    - Recommended date to re-run this analysis
    Then STOP — do not answer Questions 2–6. Sprint 13 cannot proceed yet.

---

QUESTION 2 — JSONL Format Definition for Phi3

  Phi3 requires this EXACT instruction format. Deviation = garbage adapter.

  a. Confirm the phi3 model variant installed at ~/.vscode-rotator/models/:
       What is the filename? (e.g. phi-3-mini-4k-instruct.Q4_K_M.gguf)
       What is its quantisation level? (Q4_K_M, Q5_K_M, Q8_0, etc.)
       What is the file size in GB?

  b. Define the JSONL schema. Each line in the training file is one JSON object:
     {
       "id": "ph-001",                    ← unique ID for deduplication
       "source": "prompt_history",        ← which table/source_type it came from
       "messages": [
         { "role": "user",      "content": "<instruction text>" },
         { "role": "assistant", "content": "<response text>"    }
       ],
       "quality_score": 4,                ← rating or derived score (1–5)
       "tags": ["prompt-generation"]      ← from source_type or tags column
     }

  c. Define the formatted training string that the fine-tuner actually sees
     (converted from the JSONL above):
       <|user|>
       {messages[0].content}
       <|end|>
       <|assistant|>
       {messages[1].content}
       <|end|>

  d. For multi-turn thread-turn documents (source_type='thread-turn'):
     Show the exact format for a 2-turn conversation using phi3's multi-turn template.

  e. Define content length limits:
       - Minimum content length per message: 20 characters (skip shorter — likely garbage)
       - Maximum total sequence length: 2048 tokens (phi3 context is 4096; keep training
         sequences at ≤ 50% to leave room for the model to learn generation, not truncation)
       - How to estimate token count without a tokenizer:
         Use rough heuristic: 1 token ≈ 3.5 characters for English/code mixed content
         So max characters per training pair ≈ 7168 chars total

  f. Define quality filtering rules — which rows to INCLUDE:
       From prompt_history:     rating >= 4 (not null)
       From documents:          quality = 'good' OR (quality IS NULL AND source_type IN ('vscode-git','vscode-edit'))
       From mistakes:           recurrence >= 2 AND promoted_to_rubric = 1
       From rubric_rules:       ALL rows (these are your curated "always do this" rules)
       NEVER include:           quality = 'bad', or any content containing API keys,
                                tokens, passwords (regex screen before including)

---

QUESTION 3 — Toolchain Decision: llama.cpp finetune vs Python (unsloth/trl)

  Two options. Evaluate both and make a recommendation.

  OPTION A — llama.cpp built-in finetune binary (CPU-native, no Python)
    Location: needs to be compiled from llama.cpp source, or downloaded as pre-built binary
    Adapter output format: GGUF directly ← no conversion step needed
    CPU support: YES — this is its primary use case
    Command pattern:
      ./finetune \
        --model-base ~/.vscode-rotator/models/phi3.gguf \
        --lora-out   ~/.vscode-rotator/models/adapters/adapter-<date>.gguf \
        --train-data ~/.vscode-rotator/finetune/training.jsonl \
        --lora-r 16 \
        --lora-alpha 32 \
        --epochs 3 \
        --batch-size 1 \
        --learning-rate 3e-4 \
        --threads 8
    Pro: No Python. No GPU. Output is GGUF directly loadable by node-llama-cpp.
    Con: Must compile or obtain the binary. No progress callbacks — just stdout.

  OPTION B — Python unsloth / trl (faster, needs Python 3.10+)
    Requires: pip install unsloth transformers trl peft torch
    Adapter output: .safetensors format → MUST convert to GGUF via llama.cpp convert script
    GPU: optional (CPU works but very slow without unsloth's CPU optimisations)
    Pro: Better training quality, progress bars, loss curves, early stopping.
    Con: Python dependency. Extra conversion step. ~3–5 GB of Python packages.

  Evaluate for this machine:
    a. Is Python 3.10+ available? Run: python --version or python3 --version
    b. Is there a GPU? Run: nvidia-smi (or check Device Manager)
    c. Is the llama.cpp finetune binary available or compilable?
       Check: does llama.cpp source exist anywhere on disk?
       If not: is cmake + a C++ compiler (MSVC or MinGW) available to compile it?
    d. Based on a/b/c: which option is RECOMMENDED for this machine?
       Document the recommendation with clear rationale.

  Regardless of which tool is chosen, the strategic-learning-unified-theatre integration layer
  (the Node.js fine-tune runner) calls it as a child process and monitors its output.
  The choice of tool is an implementation detail hidden behind that runner.

---

QUESTION 4 — CPU Time Benchmark (Critical for Scheduler Design)

  We need a realistic time estimate before scheduling overnight runs.

  Method A (if llama.cpp finetune binary available):
    Run a dry-run / 1-epoch test with 10 training pairs on your exact hardware.
    Command: ./finetune --model-base <phi3.gguf> --train-data <10-pair-test.jsonl>
             --epochs 1 --batch-size 1 --threads <cpu-count> --lora-r 8
    Record: wall clock time for 1 epoch on 10 pairs.
    Extrapolate: estimated time for 100 pairs × 3 epochs.

  Method B (if binary not yet available):
    Use published benchmarks for phi3-mini LoRA on CPU:
      Reference: llama.cpp GitHub issues + reddit/r/LocalLLaMA CPU finetune reports
      Typical: 2–5 seconds per training step on modern CPU (no GPU), batch size 1
      For 100 pairs × 3 epochs = 300 steps: 600–1500 seconds = 10–25 minutes
      NOTE: This is optimistic. Real wall time including I/O is often 2–4× longer.
    Document which method was used and confidence level of the estimate.

  Output from this question:
    - Estimated time per 100 training pairs × 3 epochs (low / mid / high estimate)
    - Recommended finetuneSchedule.startHour (e.g. 2am — machine likely idle)
    - Recommended finetuneSchedule.maxDurationMs (kill if exceeds this — prevents runaway)
    - Whether incremental fine-tuning (starting from last adapter, not base model) is viable
      (if yes: subsequent runs will be faster as dataset grows)

---

QUESTION 5 — Adapter Versioning Strategy

  Each fine-tuning run produces a new adapter. We need a versioning scheme that:
    - Never overwrites a working adapter with a broken one (rollback needed)
    - Keeps disk usage bounded (not unlimited adapter accumulation)
    - Tells node-llama-cpp which adapter to load (the "active" adapter)

  Define the versioning scheme:
    a. File naming:
         ~/.vscode-rotator/models/adapters/adapter-YYYY-MM-DD-HHmm.gguf
         ~/.vscode-rotator/models/adapters/active -> symlink or pointer file
         ~/.vscode-rotator/models/adapters/adapter-manifest.json
           { "active": "adapter-2026-05-21-0200.gguf",
             "history": [ { "file": "...", "trained_at": "...", "pairs_used": 87,
                            "epochs": 3, "loss": 0.42, "promoted": true } ] }

    b. Promotion policy:
         A new adapter is NOT immediately made active.
         It is first tested: run a set of benchmark prompts, compare output quality score.
         Only if quality_score >= previous adapter's score: promote to active.
         (Quality scoring defined in Question 6.)

    c. Retention policy:
         Keep last 5 adapters on disk. Delete oldest when 6th is created.
         Never delete the currently active adapter.
         Never delete an adapter that is < 24 hours old (let it soak).

    d. Fallback policy:
         If node-llama-cpp fails to load the active adapter:
           → fall back to previous adapter
           → if no previous: fall back to base model (no adapter)
           → log the failure to daemon.log + create a mistake record

---

QUESTION 6 — Quality Scoring: How Do We Know the Adapter Helped?

  We need an automated way to decide if a new adapter is better than the previous one.
  This must be runnable without human judgment (the scheduler runs unattended).

  Define a benchmark suite: a fixed set of 10 test prompts that represent
  real usage of strategic-learning-unified-theatre. These should NOT be in the training data.

  Suggested benchmark prompts (customise to actual project usage):
    1. "What error handling patterns have I used most in this codebase?"
    2. "Summarise the last sprint goal and its outcome."
    3. "What TypeScript errors have I seen most frequently?"
    4. "Generate a prompt for implementing retry logic in fetchData."
    5. "What files have I edited most this week?"
    6. "What rubric rules apply to async error handling?"
    7. "What was the last git commit message and what files changed?"
    8. "List the top 3 ideas I have stored."
    9. "What mistakes have been promoted to rubric rules?"
    10. "How should I structure a new CLI command in this codebase?"

  Scoring method (automated — no human needed):
    Run each prompt with: (a) base model only, (b) base model + new adapter.
    For each response, score on:
      - Length: responses < 20 words score 0 (model refused or hallucinated)
      - Relevance: does the response mention at least one known entity from experience.db?
                   (Check against a list of known file names, sprint names, rubric rule keywords)
      - Coherence: is it valid English/code? (simple check: no repeated token runs)
    Aggregate score: sum of relevance hits across all 10 prompts (max = 10).
    Promotion gate: new adapter score >= previous adapter score.

  Document:
    a. The 10 benchmark prompts (customised to this project)
    b. The exact scoring algorithm (relevance keyword list from experience.db)
    c. Where to store benchmark results:
         ~/.vscode-rotator/finetune/benchmark-results.json
         { "adapter": "adapter-2026-05-21-0200.gguf",
           "score": 7,
           "previous_score": 5,
           "promoted": true,
           "run_at": "..." }

---

DELIVERABLE
  Write `E:\VS Code Agent\Solution\sprints\SPRINT-13-ANALYSIS.md` containing:
    - Q1: DB audit results (row counts, content quality, go/no-go verdict)
    - Q2: JSONL schema + phi3 format templates + quality filter rules
    - Q3: Toolchain decision (llama.cpp finetune vs Python) with rationale
    - Q4: CPU benchmark results + scheduler time estimates
    - Q5: Adapter versioning scheme (naming, promotion, retention, fallback)
    - Q6: Benchmark suite (10 prompts + scoring algorithm)
    - "Architecture Decision" section: full pipeline summary diagram (ASCII)
    - "New Files to Create" section: list every new file this sprint will add
    - "Config Changes" section: new finetuneSchedule config keys
    - "Blockers" section: anything unresolved
    - "Safe to Proceed" verdict + data readiness verdict

---

⛔ DO NOT START CODING. Analysis and documentation only.
```

---

---

## PROMPT 2 — Coding: Build the Export, Train, Convert, and Version Pipeline

> **Goal**: Implement the full LoRA pipeline as a Node.js orchestrator that calls
> external tooling (llama.cpp finetune binary or Python). Build the JSONL exporter,
> fine-tune runner, adapter versioner, and new CLI commands.

---

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Read BEFORE doing anything:
  - E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md       (full file)
  - E:\VS Code Agent\Solution\sprints\SPRINT-13-ANALYSIS.md      (REQUIRED — all decisions live here)
  - E:\VS Code Agent\Solution\src\llm\experience-db.js
  - E:\VS Code Agent\Solution\src\llm\inference.js               (node-llama-cpp — understand Lm constructor options)
  - E:\VS Code Agent\Solution\src\llm\mistake-tracker.js
  - E:\VS Code Agent\Solution\src\commands\llm.js                (add new sub-commands here)
  - E:\VS Code Agent\Solution\src\config.js                      (add finetuneSchedule)
  - E:\VS Code Agent\Solution\src\watcher.js                     (replicate enhanceTimer pattern)

Sprint: Sprint 13 — LoRA Fine-Tuning Pipeline
Baseline: 139+ tests passing. Do NOT break existing suite.
Log all decisions to: E:\VS Code Agent\Solution\sprints\SPRINT-13-CODING-LOG.md

---

NEW FILES TO CREATE (from SPRINT-13-ANALYSIS.md "New Files" section):

  src/llm/finetune-exporter.js     ← exports experience.db → training.jsonl
  src/llm/finetune-runner.js       ← orchestrates train → convert → version → benchmark
  src/llm/adapter-manager.js       ← versioning, promotion, retention, fallback
  scripts/benchmark-adapter.js     ← runs 10 benchmark prompts, scores, writes results
  ~/.vscode-rotator/finetune/      ← runtime directory (created on first run)
    training.jsonl                 ← exported training data (overwritten each run)
    training-<date>.jsonl.bak      ← kept for debugging
    benchmark-results.json         ← cumulative benchmark history
    finetune.log                   ← detailed training log
    finetune.pid                   ← PID of running trainer (for status checks)
  ~/.vscode-rotator/models/adapters/
    adapter-manifest.json          ← active adapter + history

---

STEP 1 — Implement `src/llm/finetune-exporter.js`

  Export function: exportTrainingData(db, outputPath, opts = {})
    Parameters:
      db:         open better-sqlite3 DB handle (from experience-db.js pattern)
      outputPath: string — path to write training.jsonl
      opts: {
        minRating:        number  (default: 4),
        minRecurrence:    number  (default: 2),
        maxSeqChars:      number  (default: 7168),
        minContentChars:  number  (default: 20),
        secretPatterns:   RegExp[] (hard-coded, see below)
      }

  Secret screening (MANDATORY — run on EVERY content field before including):
    const SECRET_PATTERNS = [
      /[A-Za-z0-9+/]{40,}/,          // base64 blobs (tokens, keys)
      /sk-[A-Za-z0-9]{20,}/,          // OpenAI-style keys
      /ghp_[A-Za-z0-9]{36}/,          // GitHub PATs
      /password\s*[:=]\s*\S+/i,       // password = ...
      /secret\s*[:=]\s*\S+/i,         // secret = ...
      /-----BEGIN .* KEY-----/,        // PEM headers
    ]
    If ANY pattern matches either instruction or response: SKIP that pair entirely.
    Log: `[exporter] skipped row <id>: secret pattern matched`

  Collection logic — query each source in order, build pairs array:

  SOURCE A: prompt_history (best signal — human-rated)
    SELECT id, goal, prompt_text, rating FROM prompt_history
    WHERE rating >= opts.minRating AND prompt_text IS NOT NULL
    ORDER BY rating DESC, cycle_ts DESC
    Format as:
      instruction: `Generate a prompt for this goal: ${goal}`
      response:    `${prompt_text}`
    quality_score: rating

  SOURCE B: documents with quality='good' (domain knowledge)
    SELECT id, content, source_type, tags FROM documents
    WHERE quality = 'good' AND length(content) >= opts.minContentChars
    ORDER BY created_at DESC LIMIT 200
    Format as:
      instruction: `Summarise the following context and explain what it tells you about this codebase:\n${content.slice(0, 1500)}`
      response:    `This context comes from ${source_type}. ${deriveResponse(content)}`
    NOTE: deriveResponse() extracts the first meaningful paragraph/sentence as the response.
          For vscode-edit: use the first non-comment, non-blank line block.
          For vscode-git: use the commit message + files.
          For thread-turn: use the assistant turn directly.
    quality_score: 4 (default for quality='good')

  SOURCE C: rubric_rules (curated "always do this" behaviour)
    SELECT id, rule_text FROM rubric_rules ORDER BY created_at DESC
    Format as:
      instruction: `What is the correct approach for this situation in this codebase?`
      response:    `${rule_text}`
    quality_score: 5 (highest — these are curated rules)

  SOURCE D: mistakes with recurrence >= minRecurrence (negative examples → positive framing)
    SELECT id, message, file_path, recurrence FROM mistakes
    WHERE recurrence >= opts.minRecurrence AND promoted_to_rubric = 1
    Format as:
      instruction: `What mistake should be avoided when working with ${path.basename(file_path || 'this codebase')}?`
      response:    `Avoid this pattern: ${message}. This error has recurred ${recurrence} times and is tracked as a rubric rule.`
    quality_score: 3 (lower — negative example reframed as positive)

  SOURCE E: thread-turn documents (multi-turn format)
    SELECT id, content, source_type FROM documents
    WHERE source_type = 'thread-turn' AND quality != 'bad'
    ORDER BY created_at DESC LIMIT 50
    Parse content to extract user/assistant turns (delimited by turn markers from Sprint 8).
    Build multi-turn messages array (2+ messages alternating user/assistant).
    quality_score: 4

  After collecting all pairs:
    1. Deduplicate by content hash (md5 of instruction+response concatenated)
    2. Filter: total chars (instruction + response) <= opts.maxSeqChars
    3. Shuffle order (prevent source-ordering bias in training)
    4. Write as JSONL: one JSON object per line, schema from SPRINT-13-ANALYSIS.md Q2
    5. Log summary:
         [exporter] exported N pairs: A from prompt_history, B from documents,
                    C from rubric_rules, D from mistakes, E from threads
         [exporter] skipped M pairs: K too long, J secret-screened, L too short
    6. Return: { totalPairs, breakdown: {promptHistory, documents, rubric, mistakes, threads}, outputPath }

---

STEP 2 — Implement `src/llm/adapter-manager.js`

  Export class: AdapterManager

  Constructor: constructor(modelsDir, config)
    modelsDir: ~/.vscode-rotator/models/adapters/
    config: from finetuneSchedule config section

  Method: getActiveAdapterPath() → string | null
    Read adapter-manifest.json → return active adapter absolute path.
    If manifest missing or active file missing: return null (use base model only).

  Method: registerNewAdapter(adapterPath, metadata)
    metadata: { trainedAt, pairsUsed, epochs, finalLoss, toolchain }
    Add to manifest history. Mark as "pending" (not yet active).
    Apply retention: if history.length > 5, delete oldest non-active adapter file.
    Write manifest atomically (temp → fsync → rename).

  Method: promoteAdapter(adapterPath)
    Set manifest.active = adapterPath.
    Mark adapter as promoted=true in history.
    Write manifest atomically.
    Log: `[adapter-manager] promoted ${adapterPath} to active`

  Method: rollbackAdapter()
    If history has a previous promoted adapter: set it as active.
    Log: `[adapter-manager] rolled back to ${previousPath}`
    If no previous: set active = null (base model only).

  Method: listAdapters() → array
    Return manifest.history sorted by trainedAt DESC.

---

STEP 3 — Implement `src/llm/finetune-runner.js`

  Export function: runFinetune(opts = {})
    Parameters from config + SPRINT-13-ANALYSIS.md Q3 toolchain decision:
    {
      modelPath:     string  (base GGUF path — from config.llm.model resolved)
      trainingData:  string  (path to training.jsonl)
      outputDir:     string  (~/.vscode-rotator/models/adapters/)
      loraRank:      number  (default: 16)
      loraAlpha:     number  (default: 32)
      epochs:        number  (default: 3)
      learningRate:  number  (default: 3e-4)
      batchSize:     number  (default: 1)
      threads:       number  (default: os.cpus().length - 1, min 1)
      maxDurationMs: number  (from finetuneSchedule.maxDurationMs — kill if exceeded)
      toolchain:     'llamacpp' | 'python'  (from SPRINT-13-ANALYSIS.md Q3)
    }

  Internal flow:
    1. Validate: trainingData file exists + line count > 0
    2. Write finetune.pid with current process PID
    3. Generate output adapter filename: adapter-<YYYY-MM-DD-HHmm>.gguf (or .safetensors if python)
    4. Spawn trainer as child process (NOT inline — must be killable by maxDurationMs):

       IF toolchain = 'llamacpp':
         args = [
           '--model-base', modelPath,
           '--lora-out',   outputAdapterPath,
           '--train-data', trainingData,
           '--lora-r',     loraRank,
           '--lora-alpha', loraAlpha,
           '--epochs',     epochs,
           '--batch-size', batchSize,
           '--learning-rate', learningRate,
           '--threads',    threads
         ]
         spawn: <llamaCppFinetunebin> ...args

       IF toolchain = 'python':
         Write a temp Python script to ~/.vscode-rotator/finetune/run_lora.py
         (see Python script template below)
         spawn: python run_lora.py
         After completion: spawn llama.cpp convert script to produce .gguf adapter
           python <llama.cpp>/convert_lora_to_gguf.py \
             --input  <safetensors_dir> \
             --output <adapter.gguf> \
             --base   <phi3.gguf>

    5. Stream stdout/stderr → append to finetune.log line by line
       Parse for loss values: look for lines matching /loss[:\s]+([\d.]+)/i
       Track last_loss for metadata.

    6. Enforce maxDurationMs timeout:
         setTimeout(() => { childProcess.kill('SIGTERM'); reject(new Error('Finetune timeout')) }, maxDurationMs)

    7. On completion (exit code 0):
         - Verify output file exists + size > 1MB (sanity check — empty files = failed run)
         - Call AdapterManager.registerNewAdapter(outputPath, metadata)
         - Delete finetune.pid
         - Return: { success: true, adapterPath, finalLoss, durationMs, pairsUsed }

    8. On failure / timeout:
         - Log to finetune.log + daemon.log
         - Create a mistake record: MistakeTracker.recordMistake('Finetune failed: ' + error, 'finetune-runner.js')
         - Delete finetune.pid
         - Return: { success: false, error, durationMs }

  Python script template (written to run_lora.py at runtime if toolchain='python'):
    from unsloth import FastLanguageModel
    import json, os
    from datasets import Dataset
    from trl import SFTTrainer
    from transformers import TrainingArguments

    model_path = "{modelPath}"
    data_path  = "{trainingData}"
    output_dir = "{outputDir}/lora-temp"
    rank       = {loraRank}
    epochs     = {epochs}

    model, tokenizer = FastLanguageModel.from_pretrained(model_path, load_in_4bit=True)
    model = FastLanguageModel.get_peft_model(model, r=rank, lora_alpha={loraAlpha})

    with open(data_path) as f:
        rows = [json.loads(l) for l in f if l.strip()]

    def to_text(row):
        msgs = row['messages']
        return f"<|user|>\n{msgs[0]['content']}\n<|end|>\n<|assistant|>\n{msgs[1]['content']}\n<|end|>"

    dataset = Dataset.from_dict({"text": [to_text(r) for r in rows]})

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        dataset_text_field="text",
        args=TrainingArguments(output_dir=output_dir, num_train_epochs=epochs,
                               per_device_train_batch_size=1,
                               learning_rate={learningRate}, logging_steps=10,
                               save_strategy="no", report_to="none"),
    )
    trainer.train()
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print("TRAINING_COMPLETE")

---

STEP 4 — Implement `scripts/benchmark-adapter.js`

  Purpose: run the 10 benchmark prompts (from SPRINT-13-ANALYSIS.md Q6)
           against two configurations: (a) base model, (b) base + new adapter.
           Score both. Return comparison. Called by finetune-runner after training.

  Function: benchmarkAdapter(newAdapterPath, previousAdapterPath, opts)
    opts.benchmarkPrompts: string[]   (10 prompts from SPRINT-13-ANALYSIS.md Q6)
    opts.relevanceKeywords: string[]  (known entities from experience.db — file names,
                                       sprint names, rubric rule fragments)

  For each adapter (or null for base model):
    Load inference.js with that adapter path (or no adapter).
    For each benchmark prompt:
      response = await llm.ask(prompt, { maxTokens: 200 })
      score = scoreResponse(response, relevanceKeywords)
        where scoreResponse:
          if response.length < 70 chars: return 0         (refused/empty)
          if /(\w+\s+){5,}\1/.test(response): return 0   (repetition = hallucination)
          hits = relevanceKeywords.filter(kw => response.toLowerCase().includes(kw.toLowerCase()))
          return Math.min(hits.length, 3)                  // cap at 3 per prompt, max 30 total

    totalScore = sum of per-prompt scores

  Return:
    { newScore, previousScore, promoted: newScore >= previousScore,
      detail: [ { prompt, newResponse, newScore, prevResponse, prevScore } ] }

  Write results to ~/.vscode-rotator/finetune/benchmark-results.json (append, not overwrite).

---

STEP 5 — Add new CLI sub-commands to `src/commands/llm.js`

  `llm finetune`                     ← manual trigger (runs full pipeline now)
  `llm finetune --export-only`       ← only export JSONL, don't train
  `llm finetune --status`            ← check if a run is in progress (read finetune.pid)
  `llm finetune --benchmark`         ← run benchmark on current active adapter only
  `llm adapter list`                 ← list all adapters from manifest
  `llm adapter use <filename>`       ← manually promote a specific adapter to active
  `llm adapter rollback`             ← revert to previous active adapter

  For `llm finetune` (full run):
    1. Check if finetune.pid exists → if yes, show "Fine-tuning already running (PID X). Use --status."
    2. Call exportTrainingData() → log pair counts
    3. If totalPairs < 10: abort with "Insufficient training data (N pairs). Need ≥ 10. Run more sessions."
    4. Call runFinetune() → stream log lines to stdout with prefix [train]
    5. If success: call benchmarkAdapter() → log score comparison
    6. If promoted: "✓ New adapter promoted to active (score: X/30 vs previous: Y/30)"
    7. If not promoted: "⚠ New adapter NOT promoted (score: X/30 < previous: Y/30). Keeping previous."

  For `llm finetune --status`:
    If finetune.pid missing: "No fine-tuning in progress."
    If present: read PID, check if process is still running (kill -0 <pid>)
      If running: "Fine-tuning in progress (PID X). Tail the log:"
                  "  tail -f ~/.vscode-rotator/finetune/finetune.log"
      If not running (stale pid): "PID file found but process not running. Previous run may have crashed."
                                   "Check: ~/.vscode-rotator/finetune/finetune.log"

---

STEP 6 — Update `src/config.js` and `src/watcher.js`

  Config: add to DEFAULT_CONFIG:
    "finetuneSchedule": {
      "enabled": false,                      ← opt-in, off by default
      "intervalMs": 604800000,               ← weekly (same as enhanceSchedule default)
      "startHour": 2,                        ← run at 2am (machine likely idle)
      "maxDurationMs": 86400000,             ← max 24 hours (kill if exceeded)
      "minPairsRequired": 10,                ← skip if not enough data
      "loraRank": 16,
      "loraAlpha": 32,
      "epochs": 3,
      "learningRate": 0.0003,
      "toolchain": "llamacpp"                ← 'llamacpp' | 'python'
    }

  Watcher: replicate enhanceTimer pattern exactly — add finetuneTimer:
    In start():
      if (config.finetuneSchedule?.enabled) {
        this._startFinetuneTimer(config.finetuneSchedule)
      }

    _startFinetuneTimer(schedule):
      this.finetuneTimer = setInterval(async () => {
        const hour = new Date().getHours()
        if (hour !== schedule.startHour) return          // wait for right hour
        if (this._finetuneRunning) return                // thrash guard
        this._finetuneRunning = true
        try {
          await this._spawnFinetune(schedule)
        } finally {
          this._finetuneRunning = false
        }
      }, 60_000)  // check every minute

    _spawnFinetune(schedule):
      const { spawn } = await import('node:child_process')
      const child = spawn('node', [cliPath, 'llm', 'finetune'], { detached: true, stdio: 'ignore' })
      child.unref()
      this._journal(`[watcher] spawned finetune (PID ${child.pid})`)

    In stop(): clearInterval(this.finetuneTimer)

---

STEP 7 — Update `src/llm/inference.js` to load active adapter

  In the LLM constructor or the ask() method, before creating the LlamaCpp instance:
    const adapterPath = await adapterManager.getActiveAdapterPath()
    if (adapterPath && fs.existsSync(adapterPath)) {
      modelOptions.lora = adapterPath          ← node-llama-cpp lora option
      log(`[inference] loading adapter: ${adapterPath}`)
    } else {
      log('[inference] no adapter loaded — using base model only')
    }
  Wrap in try/catch: if adapter load fails → log error + rollback via AdapterManager + retry without adapter.

---

STEP 8 — Smoke Tests (manual, before writing any unit tests)

  [ ] strategic-learning-unified-theatre llm finetune --export-only
      → training.jsonl created at ~/.vscode-rotator/finetune/
      → inspect: are pairs in correct phi3 JSONL format?
      → inspect: are secrets screened? (grep for password, token, key)
      → inspect: are low-quality rows excluded? (check no rating < 4 entries)

  [ ] strategic-learning-unified-theatre llm adapter list
      → shows empty list (no adapters yet) — should not crash

  [ ] strategic-learning-unified-theatre llm finetune --status
      → "No fine-tuning in progress." — should not crash

  [ ] strategic-learning-unified-theatre llm finetune  (full run — only if data is READY from Prompt 1)
      → PID file created
      → finetune.log receiving output
      → after completion: adapter file exists in models/adapters/
      → benchmark-results.json updated
      → llm adapter list shows the new adapter

  [ ] strategic-learning-unified-theatre llm ask "What error handling patterns have I used?"
      → if adapter promoted: response should reference actual files/patterns from experience.db
         (qualitative check — does it seem more context-aware than before?)

  [ ] strategic-learning-unified-theatre llm adapter rollback
      → active adapter reverts to previous (or null if first run)

  Document all results in SPRINT-13-CODING-LOG.md.

---

ACCEPTANCE CRITERIA (before Prompt 3):
  ✅ finetune-exporter.js: secret screening blocks all 6 pattern types
  ✅ finetune-exporter.js: quality filter excludes rating < 4 and quality='bad'
  ✅ finetune-runner.js: maxDurationMs kills process if exceeded (tested with tiny timeout)
  ✅ adapter-manager.js: retention keeps ≤ 5 adapters, never deletes active
  ✅ All new CLI commands registered and non-crashing
  ✅ finetuneSchedule added to DEFAULT_CONFIG and watcher.js
  ✅ inference.js loads active adapter (or degrades gracefully if none/broken)
  ✅ 139+ pre-existing tests still passing (npm test — no regression)

---

⛔ DO NOT WRITE UNIT TESTS OR RUN E2E TESTS YET. Coding and smoke tests only.
```

---

---

## PROMPT 3 — Testing & Docs: Prove the Loop Closes and Lock It In

> **Goal**: Write unit tests for every new module. Run the full fine-tuning loop end-to-end
> and measure whether adapter quality is better than base model. Update master instructions.
> Close the sprint. This is the hardest verification sprint in the project.

---

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Read BEFORE doing anything:
  - E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md       (full file — authoritative)
  - E:\VS Code Agent\Solution\sprints\SPRINT-13-ANALYSIS.md
  - E:\VS Code Agent\Solution\sprints\SPRINT-13-CODING-LOG.md    (smoke test results)
  - E:\VS Code Agent\Solution\src\llm\finetune-exporter.js
  - E:\VS Code Agent\Solution\src\llm\finetune-runner.js
  - E:\VS Code Agent\Solution\src\llm\adapter-manager.js
  - E:\VS Code Agent\Solution\scripts\benchmark-adapter.js
  - E:\VS Code Agent\Solution\src\llm\inference.js               (updated with lora loading)
  - E:\VS Code Agent\Solution\src\watcher.js                     (updated with finetuneTimer)

Sprint: Sprint 13 — LoRA Fine-Tuning Pipeline
Baseline: 139+ tests passing. Goal: finish at ≥ 174 tests (35 new).
Task: Unit tests, E2E pipeline verification, quality measurement, docs, sprint close.

---

STEP 1 — Unit Tests

  All files use vitest. Follow existing test file patterns exactly.

  ── tests/llm/finetune-exporter.test.js (12 tests) ─────────────────────────

  Setup: create an in-memory SQLite DB (better-sqlite3 with ':memory:')
         with the same schema as experience.db.
         Seed it with controlled test rows.

  1.  Empty DB → exportTrainingData returns { totalPairs: 0 } without error
  2.  prompt_history row with rating=4 → included in JSONL output
  3.  prompt_history row with rating=3 → excluded from output
  4.  prompt_history row with rating=5 → included AND placed before rating=4 rows
  5.  document with quality='good' → included as instruction/response pair
  6.  document with quality='bad' → excluded
  7.  rubric_rule row → included with quality_score=5
  8.  mistake with recurrence=1 → excluded (below minRecurrence)
  9.  mistake with recurrence=2 AND promoted_to_rubric=1 → included
  10. Content containing 'sk-abc123456789012345678' (OpenAI key pattern) → screened + skipped
  11. Content containing 'password: mysecret123' → screened + skipped
  12. Pair where instruction+response > maxSeqChars → excluded from output
      AND pair where combined length is exactly maxSeqChars → included

  ── tests/llm/adapter-manager.test.js (10 tests) ────────────────────────────

  Setup: temp directory created before each test, cleaned after.

  13. getActiveAdapterPath() when no manifest exists → returns null (no crash)
  14. registerNewAdapter() creates manifest.json with correct schema
  15. registerNewAdapter() twice → second adapter added to history, both present
  16. promoteAdapter() updates manifest.active to the given path
  17. rollbackAdapter() with 2 promoted adapters → reverts to previous
  18. rollbackAdapter() with no previous adapter → sets active=null
  19. Retention: registering 6th adapter → oldest NON-active adapter file deleted
  20. Retention: active adapter never deleted even if it is the oldest
  21. listAdapters() returns history sorted by trainedAt DESC
  22. registerNewAdapter() writes manifest atomically (verify temp file cleanup)

  ── tests/llm/finetune-runner.test.js (8 tests) ─────────────────────────────

  Mock: child_process.spawn using vi.mock.
  Mock: fs.promises.writeFile, fs.promises.unlink.
  Mock: AdapterManager.registerNewAdapter.

  23. runFinetune() with empty trainingData file → rejects with "no training data"
  24. Spawned process exits code 0 AND output file exists → resolves with success=true
  25. Spawned process exits code 1 → resolves with success=false, error logged
  26. maxDurationMs exceeded → child process killed, rejects with timeout error
  27. PID file created at start, deleted on success
  28. PID file created at start, deleted on failure (cleanup always runs)
  29. Output adapter file < 1MB → treated as failed run (sanity check)
  30. toolchain='python' → Python script written to disk before spawn

  ── tests/llm/benchmark-adapter.test.js (5 tests) ───────────────────────────

  Mock: inference.js ask() function.

  31. Response < 70 chars → scoreResponse returns 0
  32. Response with repetition pattern → scoreResponse returns 0
  33. Response containing 2 relevance keywords → scoreResponse returns 2
  34. newScore >= previousScore → promoted=true in result
  35. newScore < previousScore → promoted=false in result

  Run npm test. Confirm:
    - All 35 new tests pass
    - All 139+ pre-existing tests still pass
    - Total count reported

---

STEP 2 — Watcher Integration Test

  Add 2 tests to existing tests/watcher.test.js:

  36. finetuneSchedule.enabled=false → no finetuneTimer created
  37. finetuneSchedule.enabled=true, current hour = startHour, not already running
      → _spawnFinetune called exactly once

  (These follow the exact same pattern as the existing enhanceSchedule watcher tests.)

---

STEP 3 — E2E Pipeline Verification (Manual — document every step)

  This is the most important test in the sprint. Run on real machine with real data.

  PRE-CHECK:
    [ ] npm test → confirm all passing before starting E2E
    [ ] sqlite3 ~/.vscode-rotator/experience.db "SELECT COUNT(*) FROM prompt_history WHERE rating >= 4"
        → must be ≥ 10 to proceed (ideally ≥ 50)
    [ ] ls ~/.vscode-rotator/models/ → confirm phi3 GGUF exists

  STAGE 1 — Export:
    strategic-learning-unified-theatre llm finetune --export-only
    [ ] Confirm: ~/.vscode-rotator/finetune/training.jsonl created
    [ ] Confirm: each line is valid JSON (node -e "require('fs').readFileSync('training.jsonl','utf8').split('\n').filter(Boolean).forEach(l=>JSON.parse(l))")
    [ ] Confirm: no lines contain secret patterns (grep -i "password\|sk-\|ghp_" training.jsonl → 0 results)
    [ ] Inspect 3 random lines: are they coherent instruction/response pairs?
    [ ] Record: total pair count

  STAGE 2 — Train (only if pair count ≥ 10):
    strategic-learning-unified-theatre llm finetune
    [ ] Confirm: finetune.pid created immediately
    [ ] Confirm: finetune.log receiving output (tail -f ~/.vscode-rotator/finetune/finetune.log)
    [ ] Confirm: process does not crash in first 60 seconds
    [ ] WAIT for completion (may take hours — record actual duration)
    [ ] Confirm: adapter file exists in ~/.vscode-rotator/models/adapters/
    [ ] Confirm: adapter file > 1 MB
    [ ] Confirm: finetune.pid deleted
    [ ] Confirm: finetune.log contains loss values (grep "loss" finetune.log)
    [ ] Record: final loss value, total duration

  STAGE 3 — Benchmark:
    strategic-learning-unified-theatre llm finetune --benchmark
    [ ] Confirm: benchmark-results.json updated
    [ ] Record: newScore, previousScore (or 0 if first run), promoted=true/false
    [ ] If promoted: confirm adapter-manifest.json active field updated

  STAGE 4 — Quality Check (qualitative):
    strategic-learning-unified-theatre llm ask "What error handling patterns have I used in this codebase?"
    [ ] Run WITHOUT adapter (temporarily: llm adapter rollback to null)
    [ ] Run WITH adapter (llm adapter use <new-adapter>)
    [ ] Compare: does the adapter response mention actual file names or patterns
                 from your codebase? Does it feel more grounded?
    [ ] Rate the difference: BETTER / SAME / WORSE — with brief notes

  STAGE 5 — Scheduler:
    In config.json: set finetuneSchedule.enabled=true, startHour=<current_hour+1>
    Run: strategic-learning-unified-theatre handoff list  (just to keep daemon running 60s)
    Wait until the scheduled hour → check daemon.log for "[watcher] spawned finetune"
    Reset startHour to 2 after verifying.

  Document ALL stage results in SPRINT-13-CODING-LOG.md under "E2E Pipeline Results".
  Include: actual training duration, pair count, benchmark scores, quality notes.
  This data becomes the baseline for measuring improvement in Sprint 14.

---

STEP 4 — Update Master Instructions
  File: E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md

  4a. Add to "What's Changed":
  ```
  ### ✅ Sprint 13 — LoRA Fine-Tuning Pipeline — COMPLETE (<today's date>)
  - finetune-exporter.js: exports experience.db → phi3-format JSONL training pairs
  - finetune-runner.js: orchestrates llama.cpp finetune / Python unsloth, enforces timeout
  - adapter-manager.js: versioned adapters with promotion gate, 5-adapter retention, rollback
  - benchmark-adapter.js: 10-prompt quality benchmark, automated promotion decision
  - CLI: `llm finetune`, `llm finetune --status`, `llm adapter list/use/rollback`
  - watcher.js: finetuneTimer (nightly schedule, startHour=2, thrash guard)
  - inference.js: loads active LoRA adapter at runtime, degrades gracefully if none
  - Secret screening: 6 regex patterns block API keys/passwords from training data
  - E2E verified: export → train → benchmark → promote → inference with adapter
  - Baseline benchmark score: <newScore>/30
  - Training duration: <actual duration> for <N> pairs × 3 epochs
  - Test count: <final number> tests passing ✅
  ```

  4b. Update Architecture diagram — add new pipeline branch:
  ```
  experience.db (prompt_history · documents · rubric_rules · mistakes)
          ↓  [finetune-exporter.js — quality filtered, secret screened]
    ~/.vscode-rotator/finetune/training.jsonl
          ↓  [finetune-runner.js — llama.cpp finetune / Python unsloth]
    ~/.vscode-rotator/models/adapters/adapter-<date>.gguf
          ↓  [adapter-manager.js — benchmark → promote/rollback]
    inference.js loads: base phi3.gguf + active adapter.gguf
          ↓
  Better responses than base model alone
  ```

  4c. Update Module Maturity table — add new rows:
    | `src/llm/finetune-exporter.js` | ✅ COMPLETE | <n> pass | DB → JSONL export, secret screening, quality filtering |
    | `src/llm/finetune-runner.js`   | ✅ COMPLETE | <n> pass | LoRA training orchestrator, timeout, PID tracking |
    | `src/llm/adapter-manager.js`   | ✅ COMPLETE | <n> pass | Versioning, promotion gate, rollback, 5-adapter retention |
    | `scripts/benchmark-adapter.js` | ✅ COMPLETE | <n> pass | 10-prompt quality benchmark, automated scoring |

  4d. Update Configuration Reference — add finetuneSchedule block to config.json example.

  4e. Add new Data Locations row:
    | LoRA training data   | `~/.vscode-rotator/finetune/training.jsonl` |
    | LoRA adapters        | `~/.vscode-rotator/models/adapters/`        |
    | Benchmark results    | `~/.vscode-rotator/finetune/benchmark-results.json` |
    | Fine-tune log        | `~/.vscode-rotator/finetune/finetune.log`   |

  4f. Update Constraints section — add:
    - LoRA adapter must be GGUF format for node-llama-cpp compatibility
    - Secret screening runs on ALL training data before export (non-negotiable)
    - finetuneSchedule.enabled defaults to false (opt-in only)
    - maxDurationMs enforced on all training runs (never run unbounded)

  4g. Update "Last Updated" line:
    `Last Updated: <today's date> — Sprint 13 Complete. <final count> tests passing.`

---

STEP 5 — Close Sprint & Handoff
  5a. strategic-learning-unified-theatre handoff update <sprint-id> --tokens-used <n>
  5b. strategic-learning-unified-theatre handoff close <sprint-id> --status complete
  5c. strategic-learning-unified-theatre handoff resume <sprint-id>
      Copy resumePrompt → save as first block of Sprint 14 prompt document.

  5d. Append to SPRINT-13-CODING-LOG.md — "Sprint 14 Options":

    OPTION A: Adapter Quality Improvement Loop
      Now that the pipeline exists, the next sprint focuses on training data quality.
      Goals: curate 50+ high-quality instruction pairs manually, re-run fine-tuning,
      measure benchmark improvement. This is the "make the adapter actually good" sprint.

    OPTION B: VS Code Sidebar Views (Sprint 11B, deferred)
      Ideas Tree panel + Related Context panel in the VS Code extension.
      Pure UI sprint — no ML work. High user-visible value.

    OPTION C: Active Suggestions (proactive context surfacing)
      While coding, the extension watches cursor position + open file,
      calls `llm related` in background, surfaces suggestions in a VS Code
      notification or status bar: "3 related documents found — click to view".

    Recommendation: run OPTION A next (data quality determines adapter value),
    then OPTION B (make the system usable every day), then OPTION C (delight layer).

---

FINAL ACCEPTANCE GATE (all must be true before declaring Sprint 13 complete):
  ✅ 35 new unit tests passing across 4 new test files
  ✅ 139+ pre-existing tests still passing (zero regression)
  ✅ Secret screening verified: grep finds zero secret-pattern content in training.jsonl
  ✅ Adapter versioning verified: rollback tested, retention tested
  ✅ E2E pipeline run documented: duration, pair count, benchmark score recorded
  ✅ inference.js loads adapter without crashing (or degrades gracefully with log)
  ✅ finetuneTimer in watcher.js fires at correct hour (scheduler test passing)
  ✅ strategic-learning-unified-theatre-master-instructions.md updated with architecture diagram change
  ✅ Baseline benchmark score recorded (the number Sprint 14 must beat)
  ✅ Sprint closed in handoff tracker
  ✅ Sprint 14 resume prompt captured
```

---

*Sprint 13 Prompts Generated: 2026-05-21*
*Prerequisite: experience.db must have ≥ 50 quality-rated rows (audit in Prompt 1 Q1)*
*Expected training duration: 6–20 hours CPU / 20–60 min GPU (phi3, 100 pairs, rank 16)*
*Next Sprint: 14 — Adapter Quality Improvement OR VS Code Sidebar Views*

