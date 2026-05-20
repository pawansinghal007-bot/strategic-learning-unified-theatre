# vscode-rotator — Master Instructions & Vision Guide

> **Purpose**: This document is the authoritative brief for any AI agent or developer
> continuing work on vscode-rotator. Read this before any development session.
> Keep it updated at the end of every sprint using `vscode-rotator handoff close`.
> **Last Updated**: 2026-05-20 — Post Sprint 7 COMPLETE. 113 tests passing.

---

## Vision Statement

**vscode-rotator is becoming a self-improving local development intelligence portal.**

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

All source files live here. The tool is installed via `npm link` and runs as `vscode-rotator`.

---

## Architecture (Current State — Post Sprint 6 + R1–R5)

```
Online LLMs (ChatGPT · Claude · Gemini · Perplexity)
        ↕  [R4 Browser Bridge — src/browser-bridge.js]
        ↓
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
        ↓
  Structured prompt → back to online LLM or browser bridge
```

Supporting modules:
- **R1 Storage Monitor** — watches drives/folders, produces `storage-snapshot.json` that R5 diffs for incremental ingestion
- **R2 Agent Handoff** — sprint manifest JSON; resume prompts so no context is lost between AI sessions
- **R3 Idea Store** — project ideas as Markdown files, auto-exported into prompt context
- **S1–S6 Core** — encrypted account store, switcher, watcher daemon, VS Code profiles, git monitor, OS keychain, Electron tray

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
| `src/secret-store.js` | OS keychain via keytar |
| `src/agent-handoff.js` | Sprint manifest + resume prompt generation |
| `src/idea-store.js` | Markdown idea files with YAML front-matter |
| `src/browser-bridge.js` | Playwright multi-LLM browser communicator |
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

From the last test run (`npm test` — May 2026):

**Status**: ✅ **113 tests passing, no failing test files**

### Confirmed Passing Tests ✅
- ✅ `tests/store.test.js` — 4 tests PASSING
- ✅ `tests/e2e/rotation.test.js` — 1 test PASSING
- ✅ `tests/test-runner.test.js` — 1 test PASSING
- ✅ All idea store, switcher, local-llm, browser-bridge, agent-handoff tests PASSING

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
vscode-rotator browser responses tag <filename> --quality good|bad|partial --notes "..."
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
vscode-rotator browser capture --platform chatgpt --thread
```
This captures the full back-and-forth of a conversation (not just one response) and
chunks it as a conversation transcript. Hugely more valuable for the local LLM than single responses.

**Implementation (Sprint update):**
- `captureThread()` implemented in `src/browser-bridge.js` to scrape full conversations and write atomic thread files.
- Thread frontmatter now includes `platform`, `captured_at`, `type: thread`, and `turn_count`.
- Per-turn chunking implemented in `src/llm/document-ingester.js` (source_type: `thread-turn`, per-turn `metadata`).
- CLI: `vscode-rotator browser capture --platform <platform> --thread` with auto-ingest.
- Auto-ingestion wired in `src/commands/browser.js` via `captureAndIngest()` helper.
- 3 new tests added — all passing.

### P4 — Self-prompt loop ✅ COMPLETE (May 20, 2026)
`vscode-rotator llm enhance --goal "..."` is fully wired.

**Implementation**:
- `logEnhanceCycle()` and `ratePromptHistory()` added to `experience-db.js`
- `prompt_history` table extended with `rating` and `cycle_ts` columns (non-breaking ALTER TABLE)
- Low-rating (≤ 2) auto-creates a mistake record and promotes to rubric via `ratePromptHistory()`
- Duplicate mistake creation removed from CLI path (`llm.js`) — single source of truth in DB layer
- `--auto`, `--rate`, `--platform` flags supported on `vscode-rotator llm enhance`
- 3 new tests in `tests/local-llm.test.js` — all passing
- **Test count**: 113 tests — ALL PASSING ✅

---

## Self-Improvement Growth Plan (Sprints 7–10)

### Sprint 7 — Response Feedback Loop 🔄 ✅ COMPLETE (2026-05-20)
**Goal**: Wire browser responses into R5 so every online LLM interaction enhances the local model's context.

Deliverables:
- Auto-ingest browser responses after capture
- Quality tagging CLI (`browser responses tag`)
- Bad-quality auto-creates mistake record
- `source_type` and `platform` metadata in documents table
- Updated `prompt-generator.js` to retrieve LLM-response chunks as context

### Sprint 8 — Conversation Capture & Threading 🔄 IN PROGRESS
**Sprint 8 handoff ID:** `494032cd-cfd6-4738-b26a-a06b93a1b527`
**Goal**: Capture full conversation threads (not single responses) and store as structured transcripts.

Deliverables:
- `browser capture --thread` command
- Transcript chunker that preserves Q&A structure
- `conversation_threads` table in experience DB
- Thread-aware retrieval in prompt generator (prefer threads over single responses for deep topics)

### Sprint 9 — Self-Prompt Enhancement Loop
**Goal**: Let the system generate its own improvement questions and complete the feedback loop autonomously.

Deliverables:
- `llm enhance --goal "..."` command
- Auto-sends generated prompt to browser bridge
- Captures + ingests response in one flow
- Full cycle logged to prompt_history
- Weekly enhancement schedule via daemon (`enhanceSchedule` in config.json)

### Sprint 10 — Knowledge Graph & VS Code Extension
**Goal**: Surface the accumulated knowledge visually and inside VS Code.

Deliverables:
- Topic clustering on document embeddings (k-means, exposed as `llm topics`)
- `llm related --to "your question"` — find related past sprints, ideas, and responses
- Basic VS Code extension: sidebar showing active sprint, ideas, and "ask local LLM" panel
- Export knowledge graph as JSON for visualization

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
    { "path": "E:\\VS Code Agent", "label": "VSCodeAgent", "recursive": true }
  ],
  "storageIndexMaxAgeDays": 30,
  "browserResponsesIngest": true,
  "enhanceSchedule": null,
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
| OS secrets | OS keychain (keytar), service `vscode-rotator` |
| Daemon log | `~/.vscode-rotator/daemon.log` |
| Progress journal | `~/.vscode-rotator/PROGRESS.md` |
| Sprint manifests | `~/.vscode-rotator/sprints/` |
| Ideas (global) | `~/.vscode-rotator/ideas/` |
| Ideas (project) | `<project-root>/.vscode-rotator/ideas/` |
| Browser profiles | `~/.vscode-rotator/browser-profiles/<platform>/` |
| Browser responses | `~/.vscode-rotator/browser-responses/` |
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
Project: vscode-rotator at E:\VS Code Agent\Solution
Instructions: Read E:\VS Code Agent\Solution\docs\README.md and
              E:\VS Code Agent\vscode-rotator-master-instructions.md
              before writing any code.
Architecture: 6 core sprints complete + 5 enhancement modules (R1–R5).
Failing tests: none — full suite passing.
Current priority: [PASTE SPRINT GOAL HERE]
Active sprint: [PASTE FROM: vscode-rotator handoff list]
```

---

## End-of-Sprint Checklist

Before ending any agent session:

1. `npm test` — confirm no new failures
2. `vscode-rotator handoff update <id> --tokens-used <n>`
3. `vscode-rotator handoff close <id> --status paused|complete`
4. `vscode-rotator log show --tail 20` — verify events journaled
5. Update this file if any architecture changed
6. Copy the `resumePrompt` from `vscode-rotator handoff resume <id>` — paste at the start of the next session

---

*Last updated: 2026-05-20 | Sprint: Post Sprint 7 COMPLETE | Status: 113 tests passing, all green*

---

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
   - `vscode-rotator handoff` — sprint management, resume prompts
   - `vscode-rotator idea` — create, list, tag, export ideas
   - `vscode-rotator browser` — capture, send, compare LLM responses
   - `vscode-rotator storage` — monitor and index local storage
   - `vscode-rotator llm` — inference, ingest, generate, mistakes

4. **Electron UI Layer Added** ✅
   - `electron-ui/main.cjs` — new UI framework (cross-platform window, IPC bridge)
   - `electron-ui/preload.cjs` — secure context isolation
   - `electron-ui/ipc/` — IPC message handlers
   - `vite.config.js`, `tailwind.config.js` — React/Vite build pipeline
   - `renderer/` — React components for UI

5. **Test Coverage Massive** ✅
   - 102 tests passing
   - Test files: store, e2e/rotation, idea-store, switcher, local-llm, browser-bridge, agent-handoff, lock, storage-monitor, workspace, git-monitor, scorer, test-runner
   - All core modules tested

### ✅ P2 Response Quality Tagging — COMPLETE
- `tagResponse()` added to browser-bridge.js with validation (good|bad|partial)
- CLI: `vscode-rotator browser responses tag <filename> --quality X --notes "..."`
- Quality metadata stored in `documents` table
- Automatic mistake record creation when quality=bad
- 5 new tests covering tagging, persistence, and mistake creation
- Test count: **96 tests (↑17 from P2 work)** — ALL PASSING

### ✅ P3 Conversation Thread Ingestion — COMPLETE
- `captureThread()` in `src/browser-bridge.js` (Playwright, full turn scraping)
- Per-turn chunking in `src/llm/document-ingester.js` (source_type: thread-turn)
- CLI: `vscode-rotator browser capture --platform <platform> --thread`
- Auto-ingestion after capture wired in `src/commands/browser.js`
- 3 new tests — all passing
- Test count: 99 tests

### ✅ P4 Self-Prompt Enhancement Loop — COMPLETE
- `logEnhanceCycle()` added to `experience-db.js` — logs goal, platform, prompt text, response file, timestamp
- `ratePromptHistory(id, rating)` added — persists rating; rating ≤ 2 auto-creates mistake + rubric rule
- CLI: `vscode-rotator llm enhance --goal "..." [--platform X] [--auto] [--rate]`
- Duplicate mistake logic removed from `llm.js` (now handled entirely in DB layer)
- 3 new tests in `tests/local-llm.test.js`
- Test count: **102 tests** — ALL PASSING ✅
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
- Test count: 113 tests passing

### ✅ No Current Issues
- Full test suite passes: 113/113 tests
- Continue next sprint focusing on post-Sprint 7 enhancements


### 📊 Module Maturity Summary
| Module | Status | Tests | Notes |
|--------|--------|-------|-------|
| Core S1–S6 | ✅ STABLE | 79 pass | Encrypted store, rotation, daemon, profiles, secrets, tray, installer |
| R1: Storage Monitor | ✅ COMPLETE | 4 pass | Full fs watcher + snapshot generation |
| R2: Handoff Tracker | ✅ COMPLETE | 3 pass | Sprint manifests + resume prompts |
| R3: Idea Store | ✅ COMPLETE | 30 pass | Full CRUD + YAML + export pipeline |
| R4: Browser Bridge | ✅ COMPLETE | 41 pass | Multi-LLM (ChatGPT, Claude, Gemini, Perplexity) |
| R5: LLM & Experience DB | ✅ COMPLETE | 15 pass | Embeddings, inference, ingestion, prompt generation, mistake tracking, enhance loop (P4) |
| Electron UI | 🟡 IN PROGRESS | Not yet | Window, IPC, preload; renderer components being built |
| Test Runner | 🔴 BROKEN | 0 pass | Robot Framework integration syntax error |

---
