# strategic-learning-unified-theatre — Master Instructions & Vision Guide

> **Purpose**: This document is the authoritative brief for any AI agent or developer
> continuing work on strategic-learning-unified-theatre. Read this before any development session.
> Keep it updated at the end of every sprint using `strategic-learning-unified-theatre handoff close`.
> **Last Updated**: 2026-05-24 — Sprint 12.1 Complete. 264 tests passing (default run).

## Deployed (Archived)

The following features and changes have been confirmed deployed and are preserved here for history; they are kept in place for auditability and must not be removed.

- Sprint 12 — VS Code Passive Learning: `VscodeContextCollector` implemented and wired in `vscode-extension/collector.js` (captures file saves, diagnostics, git commits, task errors).  (Deployed: 2026-05-19)
- New CLI commands: `strategic-learning-unified-theatre llm ingest-staged`, `strategic-learning-unified-theatre.togglePassiveLearning` (Deployed: 2026-05-19)
- Atomic staging pipeline: 30s flush, atomic tmp->rename with secure perms (Deployed: 2026-05-19)
- Master instructions: handoff snapshot pattern added (Deployed: 2026-05-19)

> Notes: These entries are archived (kept for history). Use the `handoff` commands and snapshots to track active sprint state; remove items from active TODO lists in other sprint docs rather than deleting history here.
---

## Vision Statement

**strategic-learning-unified-theatre is becoming a self-improving local development intelligence portal.**

The long-term goal is a system where:

1. You send prompts to online LLMs (ChatGPT, Claude, Gemini, Perplexity) via the browser bridge
2. Their responses are automatically ingested into a local experience database
3. A local LLM (running on your machine, no cloud required) learns from those responses
4. That local LLM generates better and better prompts for your next session
5. Mistakes are tracked, rubrics are promoted, and the system gets smarter every sprint
6. You never lose context between AI sessions — the handoff tracker ensures continuity
7. All of this is accessible from a single CLI, a system tray, and eventually a VS Code extension

**In one sentence**: Every conversation with an online LLM makes your local LLM smarter,
and your local LLM makes your next online LLM session more effective.

**Current Status (May 2026)**: R1–R5 modules fully implemented. Core rotation engine with 79 passing tests.
Browser bridge capturing responses. Experience DB with embeddings and mistake tracking operational.
Shared experience DB daemon deployed to `~/.vscode-rotator/experience.db` and currently running via `node ./src/cli.js daemon start`.
Electron UI for VS Code integration started.

---

## Completed Sprints

| Sprint | Theme | Outcome | Test baseline | Date |
|---|---|---|---|---|
| Sprint 7 | Response Feedback Loop | Complete | 118/118 | 2026-05-20 |
| Sprint 8 | Conversation Threading | Complete | 99/99 | 2026-05-20 |
| Sprint 9 | Self-Prompt Enhancement Loop | Complete | 118/118 | 2026-05-20 |
| Sprint 10 | Knowledge Graph + VS Code Ext | Complete | 139/139 | 2026-05-20 |
| Sprint 11 | Embedded Browser + Passive Capture | Complete | 139/139 | 2026-05-20 |
| Sprint 12 | VS Code Passive Learning | Complete | 244/244 | 2026-05-21 |
| Sprint 12.1 | Browser Capture v2 / Native Host | Complete | 263/264 | 2026-05-24 |
| Sprint 13 | Browser-to-Experience Bridge + LoRA Readiness | Complete | 264/264 | 2026-05-24 |

---

## Codebase Location

```
E:\VS Code Agent\Solution\
```

All source files live here. The tool is installed via `npm link` and runs as `strategic-learning-unified-theatre`.

Additional Browser Capture v2 assets, extensions, and native-host files are stored under:

```
C:\SW Development\VS Code Agent\files\
```

---

## Architecture (Current State — Post Sprint 6 + R1–R5)

```
VS Code Editor (file saves · diagnostics · git commits · task errors)
        ↓  [VscodeSignalCollector — vscode-extension/collector.js]
  ~/.vscode-rotator/vscode-signals/<ts>-vscode-signals.md  (YAML staging)
        ↓  [`llm ingest-staged` — src/commands/llm.js]
        ↓
  [R5 Document Ingester — src/llm/document-ingester.js]
        ↓
  Experience DB → ~/.vscode-rotator/experience.db

## Dependency Policy

- `node-llama-cpp` is critical local runtime infrastructure and must live in `dependencies`, not `optionalDependencies`.
- On Windows, `npm` can silently skip optional native dependencies when Visual Studio C++ Build Tools are missing, node-gyp fails, Python/CMake versions mismatch, or ABI compatibility fails.
- This causes the local Phi3 runtime to appear configured while inference is actually unavailable, which breaks Sprint 12/13 verification.
- The CLI now validates this explicitly before enabling local LLM flows and fails with actionable remediation:
  `node-llama-cpp is required for local inference. Install Visual Studio Build Tools (Desktop development with C++) and rerun: npm install`
- Required Windows prerequisites:
  - Visual Studio Build Tools 2022
  - Desktop development with C++
  - MSVC v143
  - Windows SDK
  - Python <= 3.11 preferred
  - CMake tools

> **Hardware constraint note:** Current local inference on this machine is the only valid path for now, even if it takes 30 minutes to several hours per response. Do not pause the work or reset the sprint because of slow local inference—treat it as an acceptable cost until the hardware is upgraded.
>
> The team will continue with the local-only workflow and document latency impacts in sprint notes rather than delaying progress for better hardware.

Online LLMs (ChatGPT · Claude · Gemini · Perplexity)
        ↕  [R4 Browser Bridge — src/browser-bridge.js]
        ↓
  ```
  C:\SW Development\VS Code Agent\Solution\
  ```

  From the repository root, run tests with:
  ```powershell
  npm --prefix .\Solution test
  ```
  Or from inside the `Solution\` folder:
  ```powershell
  cd "C:\SW Development\VS Code Agent\Solution"
  npm test
  ```

  To run the Ollama integration test (requires local Ollama/runtime), run:
  ```powershell
  cd "C:\SW Development\VS Code Agent\Solution"
  npm run test:integration
  ```

  Response capture → ~/.vscode-rotator/browser-responses/
        ↓
  [R5 Document Ingester — src/llm/document-ingester.js]
        ↓
  Experience DB → ~/.vscode-rotator/experience.db  (SQLite)
     ├── sprints       (R2 handoff tracker)
     ├── documents     (chunked + embedded)
     ├── mistakes      (auto-promoted to rubric at recurrence ≥ 2)
     ├── rubric_rules  (prepended to every generate-prompt call)
     ├── ingestion_log (diff-based; avoids full rescans)
     └── prompt_history (rated 1–5 for quality feedback)
        ↓
  [R5 Prompt Generator — src/llm/prompt-generator.js]
     { "path": "C:\\SW Development\\VS Code Agent", "label": "VSCodeAgent", "recursive": true }
  Structured prompt → back to online LLM or browser bridge
```

## 🚀 TOKEN REDUCTION FUNCTION: Snapshot-Based Handoffs

### ⚠️ MANDATORY FOR ALL FUTURE DEVELOPMENT

**Starting May 2026: All handoffs MUST use `strategic-learning-unified-theatre ai snapshot` instead of rereading master instructions or markdown files.**

```bash
# Instead of: Read persistent AI memory foundation.md (8,000+ tokens)
# Use this:
strategic-learning-unified-theatre ai snapshot
```

---

## ✅ Sprint 12 — VS Code Passive Learning — COMPLETE (2026-05-21)

- Implemented `VscodeContextCollector` in `vscode-extension/collector.js` to capture file saves (`vscode-edit`), diagnostics (`vscode-diagnostic` / `vscode-diagnostic-recurring`), git commits (`vscode-git`), and task exit errors (`vscode-task-error`).
  Project: strategic-learning-unified-theatre at C:\SW Development\VS Code Agent\Solution
  Instructions: Read C:\SW Development\VS Code Agent\Solution\docs\README.md and
            C:\SW Development\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md
- E2E smoke verification: `smoke-test-sprint12.js` executed locally — 12/12 smoke checks passed.
- Privacy: unit tests verify `.env` and `*.key` are not staged; `.gitignore` includes `.env` and config includes hard-exclude patterns.
- Test baseline: ✅ **264 tests passing (default run) as of 2026-05-24**. The long-running Ollama inference test has been reclassified as an integration test and excluded from the default run.

  - **Integration test:** `tests/llm/ollama-inference.test.js` → run separately with:
    ```powershell
    cd "C:\SW Development\VS Code Agent\Solution"
    npm run test:integration
    ```
    This integration run yields: 3 passed | 1 skipped (mocked child_process path tested; full inference requires running Ollama locally).

---

## ✅ TEST REGRESSION RESOLVED (2026-05-23)

**Status**: FIXED — default run now 264 tests passing.  
**Root cause**: `vitest.config.js` had `environment: "node"` instead of `environment: "jsdom"` for React component tests (16 TrainingStatus tests).  
**Fix applied**: Updated `vitest.config.js` to use jsdom environment; all React component tests now pass.  
**Integration note**: The long-running Ollama inference test (`tests/llm/ollama-inference.test.js`) was reclassified as an integration test and excluded from the default run. Run it separately with `npm run test:integration` when Ollama is available.  
**Impact**: Sprint 13 can proceed; default test baseline is stable.

**Summary of resolution**:
1. ✅ Run full test suite: identified jsdom configuration issue
2. ✅ Triaged failures: 16 were React component tests needing jsdom
3. ✅ Fixed regression: updated vitest.config.js
4. ✅ Verified baseline: 264 tests passing (default run)
5. ✅ Updated master instructions with new baseline

---

## ✅ Sprint 13 — BC2 Sync, Training Export, LoRA Readiness — COMPLETE (2026-05-24)

**P0 (BC2 Sync):** Implemented `src/commands/bc2-sync.js` (115 lines) with full CLI options (--capture-db, --base-dir, --since, --platform, --dry-run, --schedule). Verified against 212 real BC2 messages from capture.db; all synced with preserved metadata (bc2_message_id stable key, bc2_session_id, platform, timestamps). Idempotent rerun confirmed (212→0 skipped). ✅ 3/3 tests passing.

**P1 (Training Export):** Implemented `src/llm/training-exporter.js` (150+ lines) with JSONL output, user/assistant pairing by session/thread, quality/platform filters, atomic writes (chmod 600). Validated: 212 BC2 messages → 1 paired prompt-response example (0.47% conversion). ✅ 1/1 test passing.

**P2 (LoRA Readiness Analysis):** Created `Solution/sprints/SPRINT-13-ANALYSIS.md` with 9 sections: Executive Summary (C=Postpone decision), Hardware Constraints (16GB RAM, CPU-only, Python 3.14 risk), Dataset Size (production: 0 docs; test: 212 BC2→1 pair), Toolchain Options (llama.cpp/Axolotl/Unsloth vs CPU/Python/Windows), Runtime Estimate (8-12h for 50 pairs), Go/No-Go Criteria, Decision (Postpone—min 50 pairs required), Next Steps (thread capture instead of BC2), Risks (Python 3.14 compat, 212→1 pair diagnosis). ✅ All sections written with verified data.

**Decision:** Postpone LoRA fine-tuning. Current state: 1 paired example from 212 messages (insufficient for training). Must collect ≥50 paired examples via thread capture before LoRA pipeline proceeds. Python 3.14 incompatible with Axolotl/Unsloth; llama.cpp finetune untested. Revisit Sprint 14+ when paired count ≥10 (micro-experiment) or ≥50 (full pipeline).

**Test Baseline:** ✅ **267 tests passing | 1 skipped (no regressions)**. P0/P1 integration complete.

**Handoff:** Registered Sprint 13 ID `b51ba9c1-232c-490f-854a-8bc5ef9cf6eb`. Recorded 85K token usage. Added lesson: "P2 Decision: LoRA postponed due to insufficient paired data (1 pair from 212 BC2 messages). Recommend thread capture instead of BC2 sync for training data generation."

**Refer to:** `Solution/sprints/SPRINT-13-ANALYSIS.md` (decision document) | `Solution/sprints/SPRINT-13-PROMPT.md` (original requirements)

---

---

✅ Sprint 12 — VS Code Passive Learning — COMPLETE (2026-05-21)

- Implemented `VscodeContextCollector` in `vscode-extension/collector.js` to capture file saves (`vscode-edit`), diagnostics (`vscode-diagnostic` / `vscode-diagnostic-recurring`), git commits (`vscode-git`), and task exit errors (`vscode-task-error`).
  Project: strategic-learning-unified-theatre at C:\SW Development\VS Code Agent\Solution
  Instructions: Read C:\SW Development\VS Code Agent\Solution\docs\README.md and
            C:\SW Development\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md
- E2E smoke verification: `smoke-test-sprint12.js` executed locally — 12/12 smoke checks passed.
- Privacy: unit tests verify `.env` and `*.key` are not staged; `.gitignore` includes `.env` and config includes hard-exclude patterns.
- Test baseline: ✅ **263/264 tests passing (2026-05-24, resolved)**. Single timeout on long-running Ollama test (unrelated to Sprint 12).

## ✅ Sprint 12.1 — Browser Capture v2 / Native Host — COMPLETE (2026-05-24)

- Implemented Browser Capture v2 native host and normalized capture schema in `files/bc2-native-host/`.
- Added WAL mode, proper foreign keys, `browser_sessions`, `page_events`, `chat_sessions`, `chat_messages`, `login_audit`, `site_adapters`, and FTS indexes for page events and chat messages.
- Added Argon2id password hashing for local login, an account creation flow, login audit trail, and in-memory session tokens.
- Added per-site AI chat adapters for ChatGPT, Claude.ai, Gemini, and Perplexity.
- Added stream deduplication for assistant reply chunks and upserts until `final=true`.
- Added popup UI with native host status indicator and local login/register flow.
- REST API fully functional at `http://localhost:7070` via `files/bc2-native-host/db-api/api.py`.

**Integration Testing (May 24, 2026) — ✅ COMPLETE & VALIDATED**:
- ✅ Flask REST API running on `http://localhost:7070` with all endpoints working
- ✅ Database file initialized and capturing events: `C:\Users\PawanSinghal\AppData\Roaming\BrowserCapture\capture.db`
- ✅ **Page events captured**: 68 total (ChatGPT, Claude, GitHub, YouTube, etc.)
- ✅ **Chat messages captured**: 13 total (user test message + assistant responses)
- ✅ **Browser sessions**: 53 active sessions
- ✅ **All API endpoints working**:
  - `GET /health` → 200 OK (API health check)
  - `GET /events?limit=N` → 200 OK (list page events)
  - `GET /events/<id>` → 200 OK (single event details)
  - `GET /events/stats` → 200 OK (statistics: total_pages, total_messages, total_sessions, by_site, top_urls)
  - `GET /events/search?q=query` → 200 OK (search across events)
  - `GET /events/recent-context?n=N` → 200 OK (formatted chat context for LLM)
  - `POST /ollama/ask` → 200 OK (RAG with Ollama, requires local Ollama running)
- ✅ Integration test scripts: `Solution/test-bc2-integration.js`, `Solution/BC2-INTEGRATION-GUIDE.js`, `BC2-INTEGRATION-CHECKLIST.md`
- ✅ API debugging and fixes: corrected schema mismatch (events → page_events, captured_text → text_value)

**Setup (One-Time)**:
1. Run `install.bat` as Administrator — installs Python deps including `argon2-cffi`, `flask`, and `flask-cors`.
2. Load the Firefox extension via `about:debugging` -> This Firefox -> Load Temporary Add-on -> `files/bc2-fixed-firefox/manifest.json`.
3. Load the Brave extension via `brave://extensions` -> Developer mode -> Load unpacked -> `files/bc2-fixed-brave`.
4. Copy the Brave extension ID into `files/bc2-fixed-native/brave_host_manifest.json`, then rerun installer.
5. Open extension popup, create account, log in.
6. Navigate to ChatGPT or Claude and send test messages — they are captured automatically.
7. Verify via: `curl http://localhost:7070/events/stats`

**Operational (Ongoing)**:
- Python API server: `python C:\BrowserCapture\db-api\api.py` (runs on localhost:7070)
- Automatic capture: Just send messages in ChatGPT/Claude while logged into extension
- Query captured data: Any endpoint above (no auth required)
- LLM integration: `curl -X POST http://localhost:7070/ollama/ask` with context (requires Ollama running separately)

**Baseline**: 263/264 tests passing (core repo current baseline; no regressions introduced by Sprint 12.1).

Refer to `Solution/sprints/SPRINT-12-CODING-LOG.md` for full E2E details and the handoff snapshot.

**Impact**:
- **Token savings**: 90–95% reduction per handoff (8,000 tokens → 500 tokens)
- **Faster context loading**: Plain text summary, not prose
- **Reduced mistakes**: Focused state, not scattered markdown
- **Deterministic continuation**: DB state is source of truth, not memory

**What the snapshot includes**:
- Current sprint name + status
- Active blockers (last 3)
- Latest test baseline (pass/fail counts)
- Latest 5 lessons learned
- Latest 3 architectural decisions
- Pending tasks (next 5 items)

### How It Works

1. **During sprint**: Commands like `strategic-learning-unified-theatre ai decisions add` and `strategic-learning-unified-theatre ai lessons add` store state in SQLite.
2. **At handoff**: `strategic-learning-unified-theatre ai snapshot` queries the DB and prints a compact summary.
3. **Next session**: Copy the snapshot into the prompt context instead of the entire master instructions.
4. **Result**: Token budget freed up for actual work context instead of baseline overhead.

---

## State Management Policy — Permanent Rule

### Source of truth during a sprint
The database is the single source of truth for all active sprint state.
Write the following there as they happen — never into this file mid-sprint:
- Active sprint status and current goal
- Blockers and their resolution
- Architectural decisions (title, rationale, outcome)
- Lessons learned (problem, fix, prevention rule)
- Test baselines (date, passing count, failing count, notes)
- Handoff notes and resume prompts

CLI commands for writing state during a sprint:
  strategic-learning-unified-theatre ai decisions add "<title>: <decision>"
  strategic-learning-unified-theatre ai lessons add "<problem> → <fix> → <rule>"
  strategic-learning-unified-theatre handoff update <id> --tokens-used <n>

### Source of truth at sprint close
Update this file exactly once per sprint, at close only.
The sprint-close update must contain:
  1. One-line sprint summary added to the Completed Sprints table
  2. Final test baseline (passing/total, date)
  3. Any durable architectural change to the Architecture or Module Map sections
  4. Any new constraint or rule that applies permanently to all future sprints

Do not append sprint task lists, tick-boxes, "What Changed" logs, or
per-sprint lesson lists to this file. Those live in the database.

### Snapshot rule
Every handoff snapshot must reference the DB sprint ID, not copy prose
from this file. Use:
  strategic-learning-unified-theatre ai snapshot
to generate the compact context block for the next session.

### Continuous documentation rule
Documentation is maintained continuously. Active sprint state, lessons,
decisions, and test baselines live in the database during the sprint.
The master instructions file is updated at sprint close only with durable
architecture, stable rules, and audit-relevant summaries. Product-facing
documentation should be maintained in dedicated docs and refreshed
whenever durable outcomes change.

### Enforcement
If this file grows beyond 400 lines, the next sprint's first task is cleanup.
Current line count must be checked and recorded at every sprint close.

## Recommended Runtime Pattern for Local LLM
To compensate for slow local inference, deploy the experience database as an active local service.
- Run a local daemon/service that:
  - ingests VS Code signals, browser responses, and training feedback continuously
  - stores metadata in `experience.db`
  - computes embeddings incrementally in the background
  - maintains a searchable retrieval index
- Keep training/adaptation off the hot path:
  - collect and stage examples during normal use
  - run fine-tuning / adapter generation when the machine is idle
  - update the active adapter once training completes

Supporting modules:
- **R1 Storage Monitor** — watches drives/folders, produces `storage-snapshot.json` that R5 diffs for incremental ingestion
- **R2 Agent Handoff** — sprint manifest JSON; resume prompts so no context is lost between AI sessions
- **R3 Idea Store** — project ideas as Markdown files, auto-exported into prompt context
- **S1–S6 Core** — encrypted account store, switcher, watcher daemon, VS Code profiles, git monitor, OS keychain, Electron tray

### Source Types Reference

- `vscode-edit` — file save preview, debounced 10 minutes per file
- `vscode-diagnostic` — compiler/linter errors only, not warnings
- `vscode-diagnostic-recurring` — same diagnostic seen at least twice; also routes to `MistakeTracker`
- `vscode-git` — git commit hash, message, and changed-file summary
- `vscode-task-error` — VS Code task exits with non-zero code

---

## Module Map

| File | Purpose |
|------|---------|
| `src/store.js` | Encrypted account store (AES-256-GCM) |
| `src/encrypt.js` | Encryption primitives |
| `src/switcher.js` | Auth file swap + VS Code restart |
| `src/lock.js` | Concurrent-switch prevention |
| `src/vscode.js` | VS Code process control |
| `src/paths.js` | Auth file path resolution per agent type |
| `src/health.js` | Token/quota health probes |
| `src/scorer.js` | Account scoring (quota + recency) |
| `src/scheduler.js` | Cooldown management |
| `src/watcher.js` | Daemon loop — auto-rotation |
| `src/daemon-runner.js` | Detached daemon process |
| `src/profile-manager.js` | VS Code profile create/link/apply |
| `src/workspace.js` | .code-workspace profile binding |
| `src/journal.js` | Append-only PROGRESS.md journal |
| `src/test-runner.js` | Robot Framework test orchestrator and TDD helper |
| `src/git-monitor.js` | Git status / uncommitted change alerts |
| `src/reporter.js` | Daily summary generation |
| `src/config.js` | Config file load/save |
| `src/ai-memory/memory-db.js` | Persistent AI memory SQLite foundation |
| `src/secret-store.js` | OS keychain via keytar |
| `src/agent-handoff.js` | Sprint manifest + resume prompt generation |
| `src/idea-store.js` | Markdown idea files with YAML front-matter |
| `src/browser-bridge.js` | Playwright multi-LLM browser communicator |
| `electron-ui/browser-pane.cjs` | Embedded browser pane wrapper using WebContentsView/BrowserView |
| `electron-ui/ipc/capture-handlers.cjs` | IPC handler module for passive browser capture events |
| `electron-ui/preload-browser.cjs` | Browser-pane preload script for DOM observation and capture forwarding |
| `src/browser-selectors.js` | Selector registry for ChatGPT/Claude/Gemini/Perplexity capture |
| `renderer/BrowserPanel.jsx` | React embedded browser pane UI component |
| `renderer/TrainingStatus.jsx` | React capture status / training badge component |
| `vscode-extension/collector.js` | VS Code passive signal collector (edits, diagnostics, git, task errors) — VscodeSignalCollector |
| `src/storage-monitor.js` | Drive/folder watcher + snapshot for R5 |
| `src/local-llm.js` | Local LLM orchestrator |
| `src/llm/inference.js` | node-llama-cpp wrapper |
| `src/llm/experience-db.js` | SQLite operations |
| `src/llm/embeddings.js` | onnxruntime-node / all-MiniLM-L6-v2 |
| `src/llm/document-ingester.js` | Incremental ingestion via R1 snapshot |
| `src/commands/bc2-sync.js` | BC2 to experience.db bridge — syncs capture.db chat messages |
| `src/llm/training-exporter.js` | JSONL export of prompt/response pairs from experience.db |
| `src/llm/prompt-generator.js` | Context-aware prompt assembly |
| `src/llm/mistake-tracker.js` | Mistake capture + rubric promotion |
| `electron-tray/main.js` | Electron system tray UI |
| `scripts/install.js` | Cross-platform service registration |

---

## Test Status

Default baseline: 264 tests passing on the default suite. The long-running Ollama inference test is excluded from `npm test` and runs separately via:

```powershell
npm run test:integration
```

---

## Data Locations

### Sprint 7 — Response Feedback Loop 🔄 ✅ COMPLETE (2026-05-20)
**Goal**: Wire browser responses into R5 so every online LLM interaction enhances the local model's context.

Deliverables:
- Auto-ingest browser responses after capture
- Quality tagging CLI (`browser responses tag`)
- Bad-quality auto-creates mistake record
- `source_type` and `platform` metadata in documents table
- Updated `prompt-generator.js` to retrieve LLM-response chunks as context

### Sprint 8 — Conversation Capture & Threading ✅ COMPLETE (2026-05-20)
**Sprint 8 handoff ID:** `494032cd-cfd6-4738-b26a-a06b93a1b527`
**Goal**: Capture full conversation threads (not single responses) and store as structured transcripts.

Deliverables:
- `browser capture --thread` command
- Transcript chunker that preserves Q&A structure
- `conversation_threads` table in experience DB
- Thread-aware retrieval in prompt generator (prefer threads over single responses for deep topics)

### ✅ Sprint 9 — Self-Prompt Enhancement Loop — COMPLETE (2026-05-20)
**Summary**: Implemented autonomous enhancement scheduling and test coverage for the self-prompt loop.

Implementation highlights:
- `src/config.js` — added `enhanceSchedule` to `DEFAULT_CONFIG` (nullable by default)
- `src/watcher.js` — enhancement timer loop in `start()` (60s poll, `intervalMs` cadence, thrash guard), `_spawnEnhance()` helper (ESM `import('node:child_process')` + spawn CLI), and `stop()` cleanup for `enhanceTimer`
- Tests: `tests/watcher.test.js` (5 unit tests) and `tests/e2e/enhance-schedule.test.js` (2 e2e tests) added and passing
- Handoff updated & closed: `2c706a77-52da-4dec-921d-7eb067dabe2c`

Deliverables (completed):
- `llm enhance --goal "..."` command
- Auto-sends generated prompt to browser bridge
- Captures + ingests response in one flow
- Full cycle logged to `prompt_history`
- Daemon-driven enhancement schedule via `enhanceSchedule` in `config.json`

### ✅ Sprint 10 — Knowledge Graph & VS Code Extension — COMPLETE (2026-05-20)
**Summary**: Implemented knowledge graph export, related search reporting, and test coverage for the new LLM workflows. The VS Code extension remains scaffolded only, with no extension tests added yet.

Implementation highlights:
- `src/llm/embeddings.js` — added `kMeans(vectors, k, maxIter)` and `clusterDocuments(db, k)`
- `src/llm/experience-db.js` — added `relatedTo(queryEmbedding, opts)`
- `src/llm/prompt-generator.js` — added `findRelated(question, opts)`
- `src/llm/knowledge-graph.js` — added `buildGraph(db, ideaDir, outputPath)`
- `src/commands/llm.js` — added `llm topics`, `llm related --to`, and `llm export-knowledge-graph`
- `vscode-extension/` remains scaffold only; no new tests required for extension scaffolding
- Test coverage: added `tests/llm/embeddings.test.js`, `tests/llm/related.test.js`, and extended `tests/knowledge-graph.test.js`
- Handoff updated & closed: `4b0b7cc8-72e6-4db0-a485-3ad113cd4feb`

Deliverables completed:
- Topic clustering on document embeddings (k-means, exposed as `llm topics`)
- `llm related --to "your question"` — find related past sprints, ideas, and responses
- Export knowledge graph as JSON for visualization
- CLI handoff completed for Sprint 10

### Sprint 11 — Embedded Browser & Passive Training Capture
**Status**: ✅ CLOSED — Coding Complete
**Sprint ID**: `88f877a2-d9cd-42db-91dc-8e8faea7b305`
**Goal**: Replace the external Playwright browser with an Electron-embedded WebContentsView so every LLM conversation the user has passively trains the local model — zero manual capture steps.

Deliverables:
- `electron-ui/browser-pane.cjs` — BrowserPane class wrapping WebContentsView, persistent session per platform, navigation controls (back/forward/reload, URL bar, platform switcher tabs)
- `electron-ui/ipc/capture-handlers.cjs` — IPC handler receiving `capture:response` events from content scripts; calls DocumentIngester and writes atomically to `browser-responses/`
- `electron-ui/preload-browser.cjs` — isolated preload for the embedded browser pane; injects DOM observer using selectors from `browser-selectors.json`; fires `capture:response` via `ipcRenderer.send` when a response completes
- `src/browser-selectors.js` — add/update selectors for ChatGPT, Claude, Gemini, Perplexity response completion detection (streaming-end sentinel)
- `electron-ui/renderer/BrowserPanel.jsx` — React component: platform tab bar, embedded pane placeholder, training status bar (last captured, docs ingested this session, total DB docs)
- `electron-ui/renderer/TrainingStatus.jsx` — subscribes to IPC events, shows live capture count badge

Architecture change:
User browses LLM in embedded Electron pane
        ↓  [preload-browser.cjs DOM observer]
  capture:response IPC event
        ↓  [capture-handlers.cjs]
  `browser-responses/<ts>-<platform>.md`  (atomic write)
        ↓  [DocumentIngester — existing R5]
  experience.db documents table
        ↓  [PromptGenerator — existing R5]
  Better prompts next session

Constraints:
- Persistent per-platform Chromium session: `session.fromPartition('persist:platform-<name>')`
- Content script must be injected via `webContents.executeJavaScript` after `did-stop-loading`, not via `<webview>` tag (security)
- Use `WebContentsView` not deprecated `BrowserView` if Electron version ≥ 28; fallback to `BrowserView` for older
- No new npm packages — Electron APIs only
- All IPC handlers follow existing pattern in `electron-ui/ipc/handlers.cjs`
- Atomic writes + `chmod 600` on all captured response files

---

## Configuration Reference

`~/.vscode-rotator/config.json` — all keys with defaults:

```json
{
  "pollIntervalMs": 30000,
  "cooldownMs": 300000,
  "remainingThreshold": 20,
  "authPaths": { "other": null },
  "watchedRepos": [],
  "gitPollIntervalMs": 60000,
  "storagePaths": [
    { "path": "C:\\SW Development\\VS Code Agent", "label": "VSCodeAgent", "recursive": true }
  ],
  "storageIndexMaxAgeDays": 30,
   "browserResponsesIngest": true,
   "enhanceSchedule": {
      "enabled": false,
      "intervalMs": 604800000,
      "goals": [
         "Improve error handling patterns",
         "Refactor async utilities for readability"
      ]
   },
  "llm": {
    "model": "phi3",
    "contextWindow": 4096,
    "temperature": 0.3,
    "topP": 0.9,
    "embeddingModel": "all-MiniLM-L6-v2"
  }
}
```

---

## Data Locations

| Data | Path |
|------|------|
| Account store | `~/.vscode-rotator/accounts.enc` |
| OS secrets | OS keychain (keytar), service `strategic-learning-unified-theatre` |
| Daemon log | `~/.vscode-rotator/daemon.log` |
| Progress journal | `~/.vscode-rotator/PROGRESS.md` |
| Sprint manifests | `~/.vscode-rotator/sprints/` |
| Ideas (global) | `~/.vscode-rotator/ideas/` |
| Ideas (project) | `<project-root>/.vscode-rotator/ideas/` |
| Browser profiles | `~/.vscode-rotator/browser-profiles/<platform>/` |
| Browser responses | `~/.vscode-rotator/browser-responses/` |
| Training exports | `~/.vscode-rotator/training-exports/` |
| VS Code learning signals | `~/.vscode-rotator/vscode-signals/` |
| Prompt library | `~/.vscode-rotator/prompt-library.json` |
| Browser selectors | `~/.vscode-rotator/browser-selectors.json` |
| Storage index | `~/.vscode-rotator/storage-index.json` |
| Storage snapshot | `~/.vscode-rotator/storage-snapshot.json` |
| Experience DB | `~/.vscode-rotator/experience.db` |
| LLM models | `~/.vscode-rotator/models/` |
| Config | `~/.vscode-rotator/config.json` |

---

## Constraints (Non-Negotiable)

- Node.js 18+, ESM modules, no build step
- No GPU required — CPU-only inference
- No cloud API calls from local-llm module
- No plaintext secrets in logs (grep for authBlob, token, password, secret)
- All test files use vitest
- Lock files cleaned on process exit and uncaughtException
- chmod 700 on `~/.vscode-rotator/`, chmod 600 on all files inside
- Atomic writes (temp → fsync → rename) for all auth file operations

---

## Documentation Rule

For any library, framework, or package question:
1. Use Context7 to resolve the library ID first
2. Fetch version-specific docs before generating code
3. Never guess APIs — always verify with Context7
4. Place the trigger at the end

For best results, place the use context7 trigger phrase at the end of your prompt. This is because the model processes intent first, then the instruction to fetch docs acts as a final gate before generating code.

**Setup (One Command)**
```bash
npx ctx7 setup
```
This authenticates via OAuth, generates an API key, and installs the appropriate skill. You can choose between CLI + Skills or MCP mode. Use `--cursor`, `--claude`, or `--opencode` to target a specific agent.

**Manual MCP config (e.g., for Claude Desktop):**
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

---

## How to Start a New Agent Session

Run this first to get compact context without reloading this file:
  strategic-learning-unified-theatre ai snapshot

Or paste this block at the top of your prompt:

  Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
  Instructions: Read E:\VS Code Agent\Solution\docs\README.md before writing any code.
  Snapshot: <paste output of: strategic-learning-unified-theatre ai snapshot>
  Current priority: [PASTE SPRINT GOAL HERE]
  Active sprint: [PASTE FROM: strategic-learning-unified-theatre handoff list]
  Use Context7 to resolve library IDs before generating code; place `use context7` at the end.

---

## End-of-Sprint Checklist

Before ending any agent session:

1. `npm test` — confirm no new failures
2. `strategic-learning-unified-theatre ai decisions add "<decision>"` — record arch decisions
3. `strategic-learning-unified-theatre ai lessons add "<lesson>"` — record prevention rules
4. `strategic-learning-unified-theatre handoff update <id> --tokens-used <n>`
5. `strategic-learning-unified-theatre handoff close <id> --status paused|complete`
6. `strategic-learning-unified-theatre ai snapshot` — generate compact context for next session
7. At sprint close, update affected files under `docs/` if durable product,
   architecture, security, positioning, or launch messaging changed.
   Avoid adding sprint logs or temporary task notes to those files.
8. Update this file at sprint close only:
   - Add one row to Completed Sprints table
   - Update test baseline in Test Status section
   - Update Module Map and Data Locations if architecture changed
   - Do not append sprint task lists or lesson logs
9. Count lines in this file:
   `(Get-Content "E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md").Count`
   Target: under 400 lines. If over, add P0 cleanup task to next sprint.

---

## Windows PowerShell Execution Rules
- Use Windows PowerShell-compatible commands only.
- Do not use bash/sh/zsh syntax or Linux/macOS-only commands.
- Always quote paths containing spaces.
- Use `Set-Location` or `cd` with quoted paths for directory changes.
- Use `;` for sequential commands instead of `&&`.
- Prefer `Get-ChildItem`, `Remove-Item`, `Copy-Item`, `Move-Item`, `Get-Content`, and `Select-String`.
- Avoid assuming GNU utilities or `sqlite3` are installed on Windows.
- Prefer single-line PowerShell commands that can be copy-pasted directly.

## What's Changed Since Last Update (May 20, 2025)

### ✅ Major Milestones Achieved
1. **All Previously Failing Tests Now Passing** ✅
   - `tests/store.test.js` — 4 tests PASSING (previously timing out)
   - `tests/e2e/rotation.test.js` — 1 test PASSING (previously timing out)
   
2. **R1–R5 Enhancement Modules All Fully Implemented** ✅
   - R1: `storage-monitor.js` — watches drives/folders, produces snapshot.json for incremental ingestion
   - R2: `agent-handoff.js` — sprint manifest JSON, resume prompts, no context loss between sessions
   - R3: `idea-store.js` — complete Markdown idea system with YAML front-matter (30+ tests passing)
   - R4: `browser-bridge.js` — multi-LLM browser communicator (Playwright-based)
   - R5: Complete LLM/Experience DB stack:
     - `llm/inference.js` — node-llama-cpp wrapper for local model execution
     - `llm/experience-db.js` — SQLite operations with sprints, documents, mistakes, rubric_rules tables
     - `llm/embeddings.js` — onnxruntime-node / all-MiniLM-L6-v2 vector embeddings
     - `llm/document-ingester.js` — incremental ingestion via R1 snapshot (diff-based, no rescans)
     - `llm/prompt-generator.js` — context-aware prompt assembly with vector search
     - `llm/mistake-tracker.js` — mistake capture + auto-promotion to rubric at recurrence ≥ 2

3. **CLI Commands Now Complete** ✅
   - `strategic-learning-unified-theatre handoff` — sprint management, resume prompts
   - `strategic-learning-unified-theatre idea` — create, list, tag, export ideas
   - `strategic-learning-unified-theatre browser` — capture, send, compare LLM responses
   - `strategic-learning-unified-theatre storage` — monitor and index local storage
   - `strategic-learning-unified-theatre llm` — inference, ingest, generate, mistakes

4. **Electron UI Layer Added** ✅
   - `electron-ui/main.cjs` — new UI framework (cross-platform window, IPC bridge)
   - `electron-ui/preload.cjs` — secure context isolation
   - `electron-ui/ipc/` — IPC message handlers
   - `vite.config.js`, `tailwind.config.js` — React/Vite build pipeline
   - `renderer/` — React components for UI

5. **Test Coverage Massive** ✅
   - 139 tests passing
   - Test files: store, e2e/rotation, idea-store, switcher, local-llm, browser-bridge, agent-handoff, lock, storage-monitor, workspace, git-monitor, scorer, test-runner, llm/embeddings, llm/related, knowledge-graph
   - All core modules tested

### ✅ P2 Response Quality Tagging — COMPLETE
- `tagResponse()` added to browser-bridge.js with validation (good|bad|partial)
- CLI: `strategic-learning-unified-theatre browser responses tag <filename> --quality X --notes "..."`
- Quality metadata stored in `documents` table
- Automatic mistake record creation when quality=bad
- 5 new tests covering tagging, persistence, and mistake creation
- Test count: **96 tests (↑17 from P2 work)** — ALL PASSING

### ✅ P3 Conversation Thread Ingestion — COMPLETE
- `captureThread()` in `src/browser-bridge.js` (Playwright, full turn scraping)
- Per-turn chunking in `src/llm/document-ingester.js` (source_type: thread-turn)
- CLI: `strategic-learning-unified-theatre browser capture --platform <platform> --thread`
- Auto-ingestion after capture wired in `src/commands/browser.js`
- 3 new tests — all passing
- Test count: 99 tests

### ✅ P8 Conversation Capture & Threading — COMPLETE (2026-05-20)
- `src/llm/prompt-generator.js` — `getThreadContext()` replaces `getThreadsByPlatform()`; thread-turn 1.2× relevance boost added; context order: threads → llm-responses → docs
- `tests/local-llm.test.js` — 4 new tests validating thread retrieval and prompt context ordering; file now has 20 passing tests
- Final total test count: 139 tests passing ✅

### ✅ P4 Self-Prompt Enhancement Loop — COMPLETE
- `logEnhanceCycle()` added to `experience-db.js` — logs goal, platform, prompt text, response file, timestamp
- `ratePromptHistory(id, rating)` added — persists rating; rating ≤ 2 auto-creates mistake + rubric rule
- CLI: `strategic-learning-unified-theatre llm enhance --goal "..." [--platform X] [--auto] [--rate]`
- Duplicate mistake logic removed from `llm.js` (now handled entirely in DB layer)
- 3 new tests in `tests/local-llm.test.js`
- Test count: **118 tests** — ALL PASSING ✅
- No active sprint was open at close time; start a new sprint for P5/Sprint 8 work

### ✅ P1 Browser Response Auto-Ingestion — COMPLETE (Previous Session)
- Response files automatically ingested via R5 document-ingester.js
- Platform detection and source_type metadata
- Integration with experience.db documents table

### ✅ Sprint 7 Response Feedback Loop — COMPLETE (2026-05-20)
- `sendPrompt()` atomic write: temp → fsync → rename → chmod 600
- `tagResponse()` quality="bad" always creates a mistake record (notes optional)
- `recentLlmResponseChunks()` returns quality-ordered results: good → null → partial → bad
- `buildContext()` in `prompt-generator.js` surfaces llm-response chunks automatically via updated ordering
- `comparePrompts()` confirmed safe — does not ingest compare reports
- Test count: 118 tests passing

### ✅ No Current Issues
- Full test suite passes: 244/244 tests
- Sprint 12 passive learning unit and ingest-staged coverage is complete.

### ✅ Sprint 12 — VS Code Passive Learning — COMPLETE (2026-05-21)
**Goal**: Passively capture file saves, diagnostics, git commits, and task errors from VS Code.
Buffer signals in memory, flush to YAML staging files, ingest via `llm ingest-staged`.

**Deliverables**:
- `vscode-extension/collector.js` — VscodeSignalCollector class (399 lines):
  - `stageSignal(signal)` — capture vscode-edit, vscode-diagnostic, vscode-git, vscode-task-error signals
  - `flush()` — write staged signals to YAML markdown files in ~/.vscode-rotator/vscode-signals/
  - `ingestStagedSignals()` — parse staging files and ingest chunks via DocumentIngester + MistakeTracker
  - `activate(vscode)` — register VS Code event listeners (onDidSaveTextDocument, onDidChangeDiagnostics)
  - Hard-exclude list blocks .env, *.key, *.pem, *.p12, **/secrets/**, **/credentials/** unconditionally
  - Allowed extensions: .js, .ts, .jsx, .tsx, .py, .md, .json, .yaml, .yml, .txt
  - Per-file debounce: 10 minutes (configurable)
  - Periodic flush: 30 seconds (configurable)
- `vscode-extension/extension.js` — wired collector initialization and event activation (152 lines)
  - Persistent collector instance created on extension activate
  - Disposable pattern for cleanup on deactivate
  - Manual flush via `strategic-learning-unified-theatre.ingestStagedSignals` command
- `src/commands/llm.js` — `llm ingest-staged` now parses multi-signal YAML staging files, deletes successful staged files, retains failed staged files, and exports testable helpers.
- Recurring diagnostics auto-route to `MistakeTracker.addMistake()` during staged ingestion.
- `DocumentIngester.ingestFile()` preserves staged signal metadata and tags.
- Unit tests cover collector config, hard exclusions, debouncing, diagnostics, git/task signals, flushing, package command contribution, and ingest-staged behavior.
- Test count: 244 tests passing ✅

### 📊 Module Maturity Summary
| Module | Status | Tests | Notes |
|--------|--------|-------|-------|
| Core S1–S6 | ✅ STABLE | 79 pass | Encrypted store, rotation, daemon, profiles, secrets, tray, installer |
| R1: Storage Monitor | ✅ COMPLETE | 4 pass | Full fs watcher + snapshot generation |
| R2: Handoff Tracker | ✅ COMPLETE | 3 pass | Sprint manifests + resume prompts |
| R3: Idea Store | ✅ COMPLETE | 30 pass | Full CRUD + YAML + export pipeline |
| R4: Browser Bridge | ✅ COMPLETE | 41 pass | Multi-LLM (ChatGPT, Claude, Gemini, Perplexity) |
| R5: LLM & Experience DB | ✅ COMPLETE | 27 pass | Embeddings, inference, ingestion, prompt generation, mistake tracking, enhance loop (P4) |
| Electron UI / VS Code Extension | 🟡 IN PROGRESS | 38 pass | Core commands stable. Passive learning active (Sprint 12). LoRA fine-tuning next (Sprint 13). |
| R6: Embedded Browser | 🔜 NEXT | 0 | WebContentsView pane, passive DOM capture, auto-ingest on every LLM response |
| LoRA Fine-Tuning | 🔜 NEXT | 0 | Planned adapter export/training/versioning pipeline |
| Electron UI | 🟡 IN PROGRESS | Not yet | Window, IPC, preload; renderer components being built |
| Test Runner | 🔴 BROKEN | 0 pass | Robot Framework integration syntax error |

---


