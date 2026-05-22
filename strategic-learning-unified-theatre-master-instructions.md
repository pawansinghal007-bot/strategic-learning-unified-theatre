# strategic-learning-unified-theatre — Master Instructions & Vision Guide

> **Purpose**: This document is the authoritative brief for any AI agent or developer
> continuing work on strategic-learning-unified-theatre. Read this before any development session.
> Keep it updated at the end of every sprint using `strategic-learning-unified-theatre handoff close`.
> **Last Updated**: 2026-05-22 — Sprint 12 Complete. 244 tests passing.

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

**Current Status (May 2025)**: R1–R5 modules fully implemented. Core rotation engine with 79 passing tests. 
Browser bridge capturing responses. Experience DB with embeddings and mistake tracking operational. 
Electron UI for VS Code integration started.

---

## Codebase Location

```
E:\VS Code Agent\Solution\
```

All source files live here. The tool is installed via `npm link` and runs as `strategic-learning-unified-theatre`.

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
- Test baseline: **BLOCKED — 26 failing test suites as of 2026-05-23**. Must fix before Sprint 13 begins.

---

## ⛔ CURRENT BLOCKER: Test Suite Regression

**Status**: 26 test suites failing (as of 2026-05-23, end of Sprint 12 work session).  
**Impact**: Sprint 13 cannot begin until the full test suite passes.  
**Root cause**: Unknown — full test suite run shows failures in unrelated suites (not Sprint 11 or 12 tests).  
**Hardware note**: Local inference on this machine can take 30 min–several hours per response. Do not pause progress due to latency; treat it as a cost until hardware upgrade.

**Required before Sprint 13 analysis starts**:
1. Run full test suite and categorize 26 failures
2. Triage each failure (unrelated to Sprint 12, or regression?)
3. Fix regressions or document as out-of-scope
4. Restore to 244+ passing baseline
5. Update `strategic-learning-unified-theatre-master-instructions.md` with new baseline

---

## 📋 Sprint 13 Readiness Checklist

| Item | Status | Notes |
|------|--------|-------|
| Test baseline verified (244 passing) | ❌ **BLOCKED** | 26 suites failing — must fix first |
| Sprint 12 complete | ✅ Yes | Passive learning collector deployed |
| experience.db data readiness check | ❓ Not done yet | Will do after test fix |
| SPRINT-13-ANALYSIS.md written | ❌ Not started | After test fix + db check |
| Any Sprint 13 code written | ❌ Correctly not started | Analysis first, then code |

---

✅ Sprint 12 — VS Code Passive Learning — COMPLETE (2026-05-21)

- Implemented `VscodeContextCollector` in `vscode-extension/collector.js` to capture file saves (`vscode-edit`), diagnostics (`vscode-diagnostic` / `vscode-diagnostic-recurring`), git commits (`vscode-git`), and task exit errors (`vscode-task-error`).
  Project: strategic-learning-unified-theatre at C:\SW Development\VS Code Agent\Solution
  Instructions: Read C:\SW Development\VS Code Agent\Solution\docs\README.md and
            C:\SW Development\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md
- E2E smoke verification: `smoke-test-sprint12.js` executed locally — 12/12 smoke checks passed.
- Privacy: unit tests verify `.env` and `*.key` are not staged; `.gitignore` includes `.env` and config includes hard-exclude patterns.
- Test baseline: 244 tests passing (local baseline after Sprint 12 commits).

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

## Recommended Next Architecture: Persistent AI Project Memory

Keep `strategic-learning-unified-theatre-master-instructions.md` small and stable:
- architecture
- coding standards
- command conventions
- module map
- long-term rules

Move dynamic state into local DB tables:
- `sprint_state`
  - `sprint_id`
  - `status`
  - `current_goal`
  - `blockers`
  - `next_steps`
  - `updated_at`
- `architectural_decisions`
  - `id`
  - `title`
  - `rationale`
  - `decision`
  - `superseded_by`
  - `created_at`
- `implementation_memory`
  - `subsystem`
  - `summary`
  - `important_files`
  - `constraints`
  - `known_issues`
- `handoff_state`
  - `sprint_id`
  - `resume_prompt`
  - `last_completed_step`
  - `pending_tasks`
  - `last_agent_output`
- `test_baselines`
  - `date`
  - `passing_count`
  - `failing_count`
  - `notes`
- `important_commands`
  - `category`
  - `powershell_command`
  - `notes`
- `ai_lessons_learned`
  - `problem`
  - `fix`
  - `prevention_rule`

Change the handoff/resume flow:
- OLD: AI rereads huge markdown files.
- NEW: `strategic-learning-unified-theatre handoff resume` generates a compact state snapshot from DB:
  - active sprint
  - current architecture decisions
  - current blockers
  - recent failures
  - next pending actions
  - relevant files only

Result:
- dramatically fewer tokens
- faster resumes
- fewer repeated mistakes
- less context drift
- more deterministic continuation

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
| `src/llm/prompt-generator.js` | Context-aware prompt assembly |
| `src/llm/mistake-tracker.js` | Mistake capture + rubric promotion |
| `electron-tray/main.js` | Electron system tray UI |
| `scripts/install.js` | Cross-platform service registration |

---

## Test Status

From the last test run (`npm test` — May 22, 2026):

**Status**: ✅ **244 tests passing, no failing test files**

### Confirmed Passing Tests ✅
- ✅ `tests/store.test.js` — 4 tests PASSING
- ✅ `tests/e2e/rotation.test.js` — 1 test PASSING
- ✅ `tests/test-runner.test.js` — 1 test PASSING
- ✅ All idea store, switcher, local-llm, browser-bridge, agent-handoff, VS Code collector, and ingest-staged tests PASSING

---

## Immediate Next Steps (Priority Order)

### P0 — Maintain full passing suite ✅
**Status**: All tests are currently passing.
- Run `npm test` after any substantive change to confirm the suite remains green.
- Keep working on R5 browser-response ingestion and local-LLM feedback loop.

### P1 — Wire browser responses into R5 ingestion (THE KEY FEEDBACK LOOP) ✅
This is the most important missing piece for the self-improvement vision.

Currently: browser responses are saved to `~/.vscode-rotator/browser-responses/*.md`
but they are NOT automatically ingested into the experience DB.

**What needs to happen**:
1. Add `~/.vscode-rotator/browser-responses/` to the storage monitor's watched paths
   (or handle it directly in `browser-bridge.js` post-save)
2. After every `browser send` or `browser compare`, call `llm ingest` on the new response file
3. Tag ingested browser responses with `source_type: "llm-response"` and `platform: "chatgpt|claude|..."` in the documents table
4. In `prompt-generator.js`, retrieve recent relevant LLM responses (not just static docs) as context

**Why this matters**: Without this wire, the local LLM only learns from static documents.
With it, every response from ChatGPT or Claude becomes training context for future prompts.

### P2 — Response quality tagging ✅ COMPLETE (May 20, 2026)
After ingesting a browser response, prompt the user to tag it:
```
strategic-learning-unified-theatre browser responses tag <filename> --quality good|bad|partial --notes "..."
```
Store this in `documents` table as metadata. Use quality=bad to automatically create a mistake record.

**Implementation**:
- `tagResponse()` function added to `src/browser-bridge.js` with full validation
- CLI command: `browser responses tag <filename> --quality [good|bad|partial] --notes "..."`
- Database persistence: `quality` and `notes` fields in documents table
- Mistake auto-creation: `quality=bad` creates mistake record via `MistakeTracker`
- 5 new tests in `tests/browser-bridge.test.js` validating tagging, persistence, and mistake creation
- **Test count**: 99 tests (↑3 from previous) — all passing ✅

### P3 — Conversation thread ingestion ✅ COMPLETE
Currently only single responses are captured. Add:
```
strategic-learning-unified-theatre browser capture --platform chatgpt --thread
```
This captures the full back-and-forth of a conversation (not just one response) and
chunks it as a conversation transcript. Hugely more valuable for the local LLM than single responses.

**Implementation (Sprint update):**
- `captureThread()` implemented in `src/browser-bridge.js` to scrape full conversations and write atomic thread files.
- Thread frontmatter now includes `platform`, `captured_at`, `type: thread`, and `turn_count`.
- Per-turn chunking implemented in `src/llm/document-ingester.js` (source_type: `thread-turn`, per-turn `metadata`).
- CLI: `strategic-learning-unified-theatre browser capture --platform <platform> --thread` with auto-ingest.
- Auto-ingestion wired in `src/commands/browser.js` via `captureAndIngest()` helper.
- 3 new tests added — all passing.

### P4 — Self-prompt loop ✅ COMPLETE (May 20, 2026)
`strategic-learning-unified-theatre llm enhance --goal "..."` is fully wired.

**Implementation**:
- `logEnhanceCycle()` and `ratePromptHistory()` added to `experience-db.js`
- `prompt_history` table extended with `rating` and `cycle_ts` columns (non-breaking ALTER TABLE)
- Low-rating (≤ 2) auto-creates a mistake record and promotes to rubric via `ratePromptHistory()`
- Duplicate mistake creation removed from CLI path (`llm.js`) — single source of truth in DB layer
- `--auto`, `--rate`, `--platform` flags supported on `strategic-learning-unified-theatre llm enhance`
- 3 new tests in `tests/local-llm.test.js` — all passing
- **Test count**: 113 tests — ALL PASSING ✅

## Upcoming Sprints
- **Sprint 13 — LoRA Fine-Tuning Pipeline**
  - Based on `Solution\sprints\SPRINT-13-PLAN.md`.
  - Goal: export quality training examples from `experience.db`, orchestrate LoRA adapter training, manage adapter versions, and load GGUF adapters in `src/llm/inference.js`.
  - Start with a readiness audit of `experience.db`, JSONL export design, toolchain decision, adapter manager, scheduler integration, and inference loader support.
- **Sprint 14 — Adapter Quality Improvement / Sidebar Views**
  - No standalone `SPRINT-14-PLAN.md` file exists yet in `Solution\sprints/`.
  - Candidate options from `Solution\sprints\SPRINT-13-PLAN.md` and `Next Sprints.md`:
    - Option A: Adapter Quality Improvement Loop — curate higher-quality training pairs, re-run fine-tuning, and benchmark adapter quality.
    - Option B: VS Code Sidebar Views — build Ideas Tree and Related Context panels in the extension.
    - Option C: Active Suggestions — proactively surface related documents while coding.
  - Recommended order: Option A first, then Option B, then Option C.
- **Sprint 15 — Persistent AI Project Memory**
  - Move sprint_state, architectural_decisions, implementation_memory, handoff_state, test_baselines, important_commands, and ai_lessons_learned into DB.
  - Implement `strategic-learning-unified-theatre handoff resume` snapshot generation from DB state.
  - Keep master instructions focused on architecture, conventions, module map, and long-term rules.

### Next priority
- Continue with Sprint 13 LoRA fine-tuning readiness and adapter pipeline planning.

---

## Self-Improvement Growth Plan (Sprints 7–11)

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

## How to Start a New Agent Session

Paste this block at the top of your prompt:

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Instructions: Read E:\VS Code Agent\Solution\docs\README.md and
              E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md
              before writing any code.
Architecture: 6 core sprints complete + 5 enhancement modules (R1–R5).
Failing tests: none — full suite passing.
Current priority: [PASTE SPRINT GOAL HERE]
Active sprint: [PASTE FROM: strategic-learning-unified-theatre handoff list]
```
### Example Sprint 13 Prompt
```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Instructions: Read E:\VS Code Agent\Solution\docs\README.md and
              E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md
              before writing any code.
Architecture: 6 core sprints complete + 5 enhancement modules (R1–R5).
Failing tests: none — full suite passing.
Current priority: Implement Sprint 13 LoRA Fine-Tuning Pipeline planning and readiness.
Active sprint: Sprint 13 — LoRA Fine-Tuning Pipeline
```

### Example Sprint 14 Prompt
```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Instructions: Read E:\VS Code Agent\Solution\docs\README.md and
              E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md
              before writing any code.
Architecture: 6 core sprints complete + 5 enhancement modules (R1–R5).
Failing tests: none — full suite passing.
Current priority: Prepare Sprint 14 strategy for Adapter Quality Improvement or VS Code Sidebar Views.
Active sprint: Sprint 14 — Adapter Quality Improvement / Sidebar Views
```
---

## End-of-Sprint Checklist

Before ending any agent session:

1. `npm test` — confirm no new failures
2. `strategic-learning-unified-theatre handoff update <id> --tokens-used <n>`
3. `strategic-learning-unified-theatre handoff close <id> --status paused|complete`
4. `strategic-learning-unified-theatre log show --tail 20` — verify events journaled
5. Update this file if any architecture changed
6. Copy the `resumePrompt` from `strategic-learning-unified-theatre handoff resume <id>` — paste at the start of the next session

---

*Last updated: 2026-05-22 | Sprint: Sprint 12 ✅ COMPLETE | Status: 244 tests passing, all green*

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


