# Strategic Learning Unified Theatre Enhancement — Sprint Prompts & Advisory

> **Base project**: Strategic Learning Unified Theatre — cross-platform account rotation for VS Code with OS keychain, tray UI, daemon, and profile/workspace binding.
> Each prompt is scoped under 120K tokens. Execute sprints in the order shown below.

---

## Architecture Overview

```svg
<svg width="100%" viewBox="0 0 680 720" role="img">
<title>vscode-rotator enhanced architecture — 5 new modules</title>
<desc>Five enhancement modules: R2 agent handoff, R3 idea store, R4 browser bridge, R1 storage monitor, R5 local dev-LLM, all feeding a shared experience DB and output layer.</desc>
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </marker>
</defs>
<!-- Core -->
<rect x="240" y="30" width="200" height="44" rx="8" fill="#D3D1C7" stroke="#5F5E5A" stroke-width="0.5"/>
<text font-family="sans-serif" font-size="14" font-weight="500" x="340" y="57" text-anchor="middle" fill="#2C2C2A">vscode-rotator core</text>
<!-- R2 Agent Handoff — Sprint 1 -->
<rect x="30" y="125" width="52" height="18" rx="9" fill="#534AB7"/>
<text font-family="sans-serif" font-size="11" x="56" y="138" text-anchor="middle" fill="#EEEDFE">Sprint 1</text>
<rect x="220" y="148" width="240" height="56" rx="8" fill="#CECBF6" stroke="#534AB7" stroke-width="0.5"/>
<text font-family="sans-serif" font-size="14" font-weight="500" x="340" y="171" text-anchor="middle" fill="#26215C">R2 — Agent handoff tracker</text>
<text font-family="sans-serif" font-size="12" x="340" y="189" text-anchor="middle" fill="#3C3489">Sprint state · token resume</text>
<!-- R3 Idea Store — Sprint 2 -->
<rect x="460" y="125" width="52" height="18" rx="9" fill="#854F0B"/>
<text font-family="sans-serif" font-size="11" x="486" y="138" text-anchor="middle" fill="#FAEEDA">Sprint 2</text>
<rect x="460" y="148" width="190" height="56" rx="8" fill="#FAC775" stroke="#854F0B" stroke-width="0.5"/>
<text font-family="sans-serif" font-size="14" font-weight="500" x="555" y="171" text-anchor="middle" fill="#412402">R3 — Idea store</text>
<text font-family="sans-serif" font-size="12" x="555" y="189" text-anchor="middle" fill="#633806">Local folders · markdown</text>
<!-- R4 Browser Bridge — Sprint 3 -->
<rect x="30" y="148" width="170" height="56" rx="8" fill="#B5D4F4" stroke="#185FA5" stroke-width="0.5"/>
<text font-family="sans-serif" font-size="14" font-weight="500" x="115" y="171" text-anchor="middle" fill="#042C53">R4 — Browser bridge</text>
<text font-family="sans-serif" font-size="12" x="115" y="189" text-anchor="middle" fill="#0C447C">ChatGPT · Claude · Perplexity</text>
<!-- Sprint 3 badge above R4 -->
<rect x="30" y="125" width="52" height="18" rx="9" fill="#185FA5"/>
<text font-family="sans-serif" font-size="11" x="56" y="138" text-anchor="middle" fill="#E6F1FB">Sprint 3</text>
<!-- R1 Storage Monitor — Sprint 4 -->
<rect x="30" y="285" width="52" height="18" rx="9" fill="#0F6E56"/>
<text font-family="sans-serif" font-size="11" x="56" y="298" text-anchor="middle" fill="#E1F5EE">Sprint 4</text>
<rect x="30" y="308" width="170" height="56" rx="8" fill="#9FE1CB" stroke="#0F6E56" stroke-width="0.5"/>
<text font-family="sans-serif" font-size="14" font-weight="500" x="115" y="331" text-anchor="middle" fill="#04342C">R1 — Storage monitor</text>
<text font-family="sans-serif" font-size="12" x="115" y="349" text-anchor="middle" fill="#085041">C:/D:/E: · folder watch</text>
<!-- R5 Local LLM — Sprint 5 -->
<rect x="460" y="285" width="52" height="18" rx="9" fill="#993C1D"/>
<text font-family="sans-serif" font-size="11" x="486" y="298" text-anchor="middle" fill="#FAECE7">Sprint 5</text>
<rect x="460" y="308" width="190" height="56" rx="8" fill="#F5C4B3" stroke="#993C1D" stroke-width="0.5"/>
<text font-family="sans-serif" font-size="14" font-weight="500" x="555" y="331" text-anchor="middle" fill="#4A1B0C">R5 — Local dev-LLM</text>
<text font-family="sans-serif" font-size="12" x="555" y="349" text-anchor="middle" fill="#712B13">3-bit quant · experience DB</text>
<!-- R1 feeds R5 — key dependency arrow -->
<line x1="200" y1="336" x2="458" y2="336" stroke="#0F6E56" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#arrow)"/>
<text font-family="sans-serif" font-size="11" x="329" y="328" text-anchor="middle" fill="#0F6E56">feeds file index</text>
<!-- Shared layer -->
<rect x="120" y="450" width="440" height="44" rx="8" fill="#D3D1C7" stroke="#5F5E5A" stroke-width="0.5"/>
<text font-family="sans-serif" font-size="13" font-weight="500" x="340" y="476" text-anchor="middle" fill="#2C2C2A">Shared: experience DB · rubric engine · prompt journal</text>
<!-- Output layer -->
<rect x="190" y="565" width="300" height="44" rx="8" fill="#C0DD97" stroke="#3B6D11" stroke-width="0.5"/>
<text font-family="sans-serif" font-size="14" font-weight="500" x="340" y="591" text-anchor="middle" fill="#173404">CLI · Tray · VS Code extension</text>
<!-- Core to modules -->
<line x1="300" y1="74" x2="180" y2="148" stroke="#888780" stroke-width="1" marker-end="url(#arrow)"/>
<line x1="340" y1="74" x2="340" y2="148" stroke="#888780" stroke-width="1" marker-end="url(#arrow)"/>
<line x1="380" y1="74" x2="460" y2="148" stroke="#888780" stroke-width="1" marker-end="url(#arrow)"/>
<line x1="270" y1="74" x2="130" y2="148" stroke="#888780" stroke-width="1" marker-end="url(#arrow)"/>
<!-- Modules to shared -->
<line x1="115" y1="204" x2="160" y2="450" stroke="#888780" stroke-width="1" marker-end="url(#arrow)"/>
<line x1="340" y1="204" x2="340" y2="450" stroke="#888780" stroke-width="1" marker-end="url(#arrow)"/>
<line x1="555" y1="204" x2="510" y2="450" stroke="#888780" stroke-width="1" marker-end="url(#arrow)"/>
<line x1="115" y1="364" x2="145" y2="450" stroke="#888780" stroke-width="1" marker-end="url(#arrow)"/>
<line x1="555" y1="364" x2="520" y2="450" stroke="#888780" stroke-width="1" marker-end="url(#arrow)"/>
<!-- Shared to output -->
<line x1="340" y1="494" x2="340" y2="565" stroke="#888780" stroke-width="1" marker-end="url(#arrow)"/>
<!-- Legend -->
<text font-family="sans-serif" font-size="11" x="30" y="660" fill="#5F5E5A">Solid arrows = data flow     Dashed green = R1 storage index feeds R5 incremental ingestion</text>
</svg>
```

---

## Execution Order & Why

| # | Sprint | Module | Reason |
|---|--------|--------|--------|
| 1 | Sprint 1 | **R2 Agent Handoff Tracker** | Backbone — all subsequent sprints self-document using it |
| 2 | Sprint 2 | **R3 Idea Store** | No dependencies; agents capture ideas from Sprint 1 onward |
| 3 | Sprint 3 | **R4 Browser Bridge** | Independent of R1/R5; delivers multi-LLM communication early |
| 4 | Sprint 4 | **R1 Storage Monitor** | Must exist before R5 — its file index drives incremental LLM ingestion |
| 5 | Sprint 5 | **R5 Local Dev-LLM** | Depends on R2 (sprint schema), R3 (idea schema), R1 (storage index) |

**Why R1 must come before R5**: The local LLM ingests your TM Forum guides, solution docs, and project files. Without R1's storage snapshot, R5 re-walks the entire filesystem on every ingestion run. With R1 in place, R5 reads the snapshot diff and only re-chunks files that are new or modified — incremental, fast, and automatic.

---

## Strategic Advisory

1. **Agent handoff state** is the highest-value feature. Claude, ChatGPT, and Gemini all truncate at different token windows. A sprint manifest capturing what was built, tested, broken, and pending will save hours per week. Build it first.

2. **Local LLM storage**: Q3_K_S GGUF (~3-bit) gives ~40% size saving vs 4-bit with acceptable quality for code tasks. **Phi-3 Mini 3.8B Q3_K_S ≈ 1.6 GB** is the recommended model — strong at code, runs CPU-only, Node.js-native via `node-llama-cpp`.

3. **Browser automation**: Use `playwright` not Puppeteer — better cross-browser support, handles Cloudflare better, cleaner async API. Store DOM selectors in a JSON config file so broken selectors are patchable without a code change.

4. **Experience DB**: Flat schema — one row per sprint, per mistake, per document chunk. SQLite with `better-sqlite3` (synchronous, no server, one file). Vector search via `sqlite-vss`.

5. **Do not build all 5 sprints in one agent session.** Use the handoff tracker from Sprint 1 to document each sprint's state before token budget runs out.

---

## Sprint 1 — R2: Agent Handoff Tracker

**Goal**: Capture what each AI agent has done before token exhaustion and generate a resume-prompt so the next agent continues the sprint seamlessly.

**Estimated prompt size**: ~22K tokens

---

```
CONTEXT
-------
Project: Strategic Learning Unified Theatre (Node.js 18+, ESM)
Existing: progress journal at strategic-learning-unified-theatre log show|clear, store at ~/.vscode-rotator/

TASK
----
Add a new module: src/agent-handoff.js

REQUIREMENTS

1. Sprint manifest format
   File: ~/.vscode-rotator/sprints/<YYYY-MM-DD>-<sprint-id>.json
   Schema:
   {
     "sprintId": "string (uuid)",
     "date": "ISO8601",
     "agent": "claude|chatgpt|gemini|perplexity|other",
     "model": "string (e.g. claude-sonnet-4-6)",
     "goal": "string — one sentence describing the sprint goal",
     "tokensUsed": number,
     "tokensLimit": number,
     "status": "active|paused|exhausted|complete",
     "completedTasks": [ { "id": "string", "description": "string", "filesChanged": ["string"] } ],
     "pendingTasks": [ { "id": "string", "description": "string", "priority": 1|2|3 } ],
     "blockers": [ { "description": "string", "suggestedFix": "string" } ],
     "filesCreated": ["string"],
     "filesModified": ["string"],
     "testsPassed": ["string"],
     "testsFailed": [ { "name": "string", "error": "string" } ],
     "resumePrompt": "string — a ready-to-paste prompt that briefs the next agent"
   }

2. Resume prompt auto-generation
   When sprint status is set to exhausted or paused, auto-generate resumePrompt:
   Template:
   "You are continuing sprint <sprintId> on vscode-rotator.
    Goal: <goal>
    Completed: <completedTasks as bullet list>
    Pending (priority order): <pendingTasks as bullet list>
    Blockers: <blockers>
    Files changed: <filesChanged>
    Tests failing: <testsFailed>
    Start by fixing the failing tests, then continue with pending tasks in priority order."

3. Token tracking
   - Accept --tokens-used and --tokens-limit flags on handoff commands
   - When tokensUsed / tokensLimit > 0.85, emit WARNING to stderr:
     "⚠ 85% of token budget used — consider handoff soon"
   - When > 0.95, emit CRITICAL and set status = exhausted automatically

4. CLI integration
   vscode-rotator handoff create [--agent <name>] [--goal "string"] [--limit <n>]
   vscode-rotator handoff update <sprintId> [--tokens-used <n>] [--add-task "desc" --priority 1]
                                             [--complete-task <id>] [--add-blocker "desc"]
   vscode-rotator handoff close <sprintId> [--status complete|paused|exhausted]
   vscode-rotator handoff resume <sprintId>   — prints resumePrompt to stdout (pipe-friendly)
   vscode-rotator handoff list                — table of recent sprints

5. Tray UI integration
   Add tray menu item: "Active sprint: <goal truncated 30 chars>" → click opens log
   Add second item: "Copy resume prompt" → copies current active sprint resumePrompt to clipboard

CONSTRAINTS
-----------
- No network calls in this module
- All data stored locally in ~/.vscode-rotator/sprints/
- resumePrompt must be plain text, no markdown, max 800 characters

OUTPUT
------
- src/agent-handoff.js
- src/commands/handoff.js
- test/agent-handoff.test.js
- Updated tray/main.js (tray integration)
- docs section: "Agent Handoff Tracker"
```

---

## Sprint 2 — R3: Idea Store

**Goal**: Store ideas as structured local Markdown files inside project folders, readable by any agent or editor without tooling.

**Estimated prompt size**: ~14K tokens

---

```
CONTEXT
-------
Project: Strategic Learning Unified Theatre (Node.js 18+, ESM)
Prerequisite: Sprint 1 (agent-handoff.js) complete — idea link command references sprintId.

TASK
----
Add a new module: src/idea-store.js

REQUIREMENTS

1. Idea format
   Each idea stored as a Markdown file at:
   <project-root>/.vscode-rotator/ideas/<YYYY-MM-DD>-<slug>.md

   Front-matter (YAML):
   ---
   id: <uuid>
   created: <ISO8601>
   project: <string>
   tags: [string, ...]
   status: inbox|active|parked|done
   priority: 1|2|3
   linkedSprint: <sprintId or null>
   ---

   Body: free-form markdown

2. Project root detection
   - Walk up from cwd until .git found
   - Fall back to ~/.vscode-rotator/ideas/ if no .git (global inbox)

3. CLI integration
   vscode-rotator idea add [--project <name>] [--tag <tag>] [--priority 1]
     → opens $EDITOR or prompts for title + body inline
   vscode-rotator idea list [--project <name>] [--tag <tag>] [--status inbox]
   vscode-rotator idea view <id>
   vscode-rotator idea link <id> --sprint <sprintId>
   vscode-rotator idea done <id>

4. Agent-readable export
   vscode-rotator idea export [--project <name>] [--status active]
   → concatenated Markdown to stdout for pasting into an agent prompt
   Format:
   ## Active ideas for <project>
   ### <title> [priority: 1]
   <body>
   ---
   Trim body to 500 chars per idea if total exceeds 4000 tokens.

5. VS Code extension interface (document only, no code)
   Document how a future VS Code extension lists/creates ideas via the filesystem.

CONSTRAINTS
-----------
- No database — plain Markdown files only
- Only extra dependency: gray-matter (YAML front-matter)
- idea export output must stay under 4000 tokens

OUTPUT
------
- src/idea-store.js
- src/commands/idea.js
- test/idea-store.test.js
- docs section: "Idea Store"
```

---

## Sprint 3 — R4: Browser Bridge (Multi-LLM Communicator)

**Goal**: Open a browser and communicate with ChatGPT, Claude.ai, Perplexity, and Gemini for prompt dispatch and response capture.

**Estimated prompt size**: ~28K tokens

---

```
CONTEXT
-------
Project: Strategic Learning Unified Theatre (Node.js 18+, ESM)
Prerequisite: Sprint 1 (handoff tracker) complete — browser sessions are linked to sprints.
The user has valid accounts on each target platform.

TASK
----
Add a new module: src/browser-bridge.js

REQUIREMENTS

1. Playwright integration
   npm install playwright
   Support: chromium (default), firefox (--browser firefox)
   Persistent profiles: ~/.vscode-rotator/browser-profiles/<platform>/

2. Adapter pattern
   Each adapter at src/browser-adapters/<name>.js exports:
   {
     name: string,
     baseUrl: string,
     selectors: { inputBox, sendButton, responseContainer },
     async waitForResponse(page): string
   }

   Implement adapters for: chatgpt, claude, perplexity, gemini

   Store selectors in ~/.vscode-rotator/browser-selectors.json (user-overridable)
   so broken selectors are patchable without a code change.

3. Prompt dispatch
   vscode-rotator browser send --platform chatgpt --prompt "string" [--file prompt.md]
   → opens browser (headless: false — user handles CAPTCHAs)
   → saves response to ~/.vscode-rotator/browser-responses/<timestamp>-<platform>.md

4. Prompt comparison
   vscode-rotator browser compare --prompt "string" --platforms chatgpt,claude,perplexity
   → sends same prompt sequentially (not parallel — avoids bot detection)
   → minimum 3-second delay between sends to same platform
   → generates comparison report: ~/.vscode-rotator/browser-responses/<date>-compare.md

5. Prompt library
   vscode-rotator browser prompts list|view <id>|run <id> --platform <name>
   Stored at ~/.vscode-rotator/prompt-library.json
   Each entry: { id, name, template, tags, lastUsed, platforms }
   Templates support {{variable}} substitution via --var key=value flags

6. Login helper
   vscode-rotator browser login --platform <name>
   → opens browser non-headless, navigates to login page
   → waits for manual login, saves Playwright storageState to browser-profiles/

CONSTRAINTS
-----------
- headless: false by default
- Never store passwords or API keys
- Minimum 3-second delay between sends to same platform
- Clear error message pointing to browser-selectors.json when selector fails
- --dry-run flag: prints plan without opening browser

OUTPUT
------
- src/browser-bridge.js
- src/browser-adapters/chatgpt.js, claude.js, perplexity.js, gemini.js
- src/commands/browser.js
- test/browser-bridge.test.js (mocked — no real browser in tests)
- docs section: "Browser Bridge"
```

---

## Sprint 4 — R1: Local Storage Monitor

**Goal**: Watch defined drives/folders for development file changes and maintain a dev-status index. The storage snapshot produced here is consumed by Sprint 5 for incremental LLM document ingestion.

**Estimated prompt size**: ~18K tokens

---

```
CONTEXT
-------
Project: Strategic Learning Unified Theatre (Node.js 18+, ESM)
Existing config supports: watchedRepos (string[]), gitPollIntervalMs (number)

IMPORTANT — Sprint 5 dependency:
The storage-snapshot.json produced by this module is the primary input for the
Local Dev-LLM (Sprint 5) document ingestion pipeline. Sprint 5 diffs this snapshot
against its own ingestion log to determine:
  (a) which document files are new → ingest
  (b) which have changed → re-ingest
  (c) which are deleted → remove from experience DB
Design the snapshot schema with this consumer in mind.

TASK
----
Add a new module: src/storage-monitor.js

REQUIREMENTS

1. Drive/folder watching
   - Config key: storagePaths (array of: { path, label, recursive })
   - Examples: "C:\\", "D:\\Projects", "E:\\Archive\\MyProduct"
   - Use chokidar (npm) for cross-platform watching
   - Debounce events to 2000ms
   - On Windows, skip: Windows, Program Files, $Recycle.Bin, pagefile.sys

2. Dev-status index
   File: ~/.vscode-rotator/storage-index.json (append-only, date-keyed)
   Each entry:
   {
     "ts": "ISO8601",
     "path": "absolute path",
     "event": "add|change|unlink",
     "size": number,
     "ext": ".md",
     "label": "D-Projects",
     "ingestible": true
   }

   Ingestible extensions (for LLM doc ingestion):
     .md .txt .pdf .docx .yaml .yml

   Dev-change extensions (for dev-status tracking):
     .js .ts .py .json .sh .ps1 .cs .java .go .rs .cpp .h

   Index both sets; flag ingestible separately so Sprint 5 filters efficiently.
   Prune entries older than 30 days.

3. Snapshot file (critical for Sprint 5)
   File: ~/.vscode-rotator/storage-snapshot.json
   Updated on every watch cycle and index run.
   Schema:
   {
     "lastScan": "ISO8601",
     "paths": {
       "<absolutePath>": { "size": number, "ts": "ISO8601", "ingestible": true }
     }
   }
   Sprint 5 diffs this against its ingestion_log table to find what needs re-ingesting.

4. CLI integration
   vscode-rotator storage watch    — start watcher in foreground
   vscode-rotator storage status   — last 20 changes as table (path, event, time, ingestible)
   vscode-rotator storage index    — force full re-index, regenerate snapshot

5. Config additions
   storagePaths: [{ path, label, recursive }]
   storageIndexMaxAgeDays: 30

CONSTRAINTS
-----------
- No native binaries other than chokidar
- Works on Windows 10+, macOS 12+, Ubuntu 20+
- No breaking changes to existing CLI commands

OUTPUT
------
- src/storage-monitor.js
- src/commands/storage.js
- test/storage-monitor.test.js
- Updated docs/README.md section: "Storage Monitor"
- Updated src/config.js with new config keys and defaults
```

---

## Sprint 5 — R5: Local Dev-LLM (Experience-Capturing Lightweight Model)

**Goal**: Deploy a local quantised LLM (Q3_K_S, ~3-bit) that ingests project documents incrementally via the R1 storage index, learns from sprint history and mistakes, maintains a rubric, and generates structured prompts for other agents.

**Estimated prompt size**: ~38K tokens
**Hard dependencies — all must be complete before starting this sprint:**
- Sprint 1 / R2: `src/agent-handoff.js` and `~/.vscode-rotator/sprints/` schema
- Sprint 2 / R3: `src/idea-store.js` and idea Markdown format
- Sprint 4 / R1: `src/storage-monitor.js`, `storage-index.json`, `storage-snapshot.json`

---

```
CONTEXT
-------
Project: vscode-rotator (Node.js 18+, ESM)
Prerequisites:
  src/agent-handoff.js   (Sprint 1) — sprint JSON schema at ~/.vscode-rotator/sprints/
  src/idea-store.js      (Sprint 2) — idea Markdown files
  src/storage-monitor.js (Sprint 4) — storage-index.json + storage-snapshot.json

Background:
- Runs on consumer hardware (8–16 GB RAM), CPU-only, no GPU
- Storage target: Q3_K_S GGUF (~3-bit quantisation)
- Domain: software development — projects, TM Forum guides, solution docs
- Document ingestion is INCREMENTAL, driven by R1 storage-snapshot.json (not full rescans)
- Generates context-aware prompts for use in browser-bridge (Sprint 3 / R4)
- Captures sprint experiences, mistakes, and improvement rubrics

TASK
----
Add module: src/local-llm.js and companion experience database.

PART A — Runtime setup

1. Model selection and download
   Recommended: Phi-3 Mini 3.8B Q3_K_S (GGUF) ≈ 1.6 GB
   Fallback:    TinyLlama 1.1B Q3_K_S (GGUF) ≈ 500 MB

   vscode-rotator llm setup [--model phi3|tinyllama|custom --model-path /path/to.gguf]
   → downloads model to ~/.vscode-rotator/models/<name>.gguf
   → verifies SHA256
   → smoke-test inference ("Hello") and prints response

2. Inference engine
   Use: node-llama-cpp (npm) — Node.js bindings for llama.cpp
   Context window: 4096 tokens
   Temperature: 0.3 | Top-p: 0.9

3. Local inference CLI
   vscode-rotator llm ask "your question"
   vscode-rotator llm ask --system "You are a TM Forum expert" "What is a productOffering?"
   vscode-rotator llm generate-prompt --goal "Add REST endpoint for account health"

PART B — Experience database (SQLite)

File: ~/.vscode-rotator/experience.db

Tables:

  sprints:
    id, date, agent, goal, tokens_used,
    completed_tasks (JSON), pending_tasks (JSON),
    files_changed (JSON), tests_failed (JSON), status

  mistakes:
    id, date, sprint_id, description, root_cause, fix_applied,
    category, recurrence_count DEFAULT 0

  rubric_rules:
    id, rule, category, created_from_mistake_id, active DEFAULT 1

  documents:
    id, filename, chunk_index, content,
    embedding BLOB (768-dim float32),
    source_type,
    last_ingested (ISO8601),
    file_ts (ISO8601 mtime at ingest time)

  ingestion_log:
    path TEXT PRIMARY KEY,
    file_ts TEXT,       ← ISO8601 of file at last ingest
    chunk_count INTEGER,
    last_run TEXT       ← ISO8601
    NOTE: Sprint 5 diffs this against R1 storage-snapshot.json to find
          new/changed/deleted files without rescanning the filesystem.

  prompt_history:
    id, date, platform, prompt, response_summary,
    sprint_id, tokens_estimated, quality_rating (1-5)

4. Incremental document ingestion (driven by R1 storage-snapshot.json)

   vscode-rotator llm ingest [--force]

   Algorithm:
   a. Read ~/.vscode-rotator/storage-snapshot.json (produced by R1)
   b. Filter to entries where ingestible = true
   c. Diff against ingestion_log:
      NEW      → ingest
      CHANGED  → delete old chunks, ingest fresh  (snapshot file_ts > log file_ts)
      DELETED  → delete from documents table       (in log but absent from snapshot)
      SAME     → skip
   d. For each file to ingest:
      → chunk at 512 tokens with 64-token overlap
      → generate embeddings via all-MiniLM-L6-v2 (onnxruntime-node)
      → upsert documents, update ingestion_log
   e. Supported file types: .pdf (pdf-parse), .md, .txt, .docx (mammoth)

   --force: ignore ingestion_log, re-ingest all ingestible files in snapshot

   Also: vscode-rotator llm ingest <specific-file-or-folder>
   for one-off ingestion outside watched paths.

   WIRING: Wire the R1 storage watcher to trigger `llm ingest` automatically
   when an ingestible file change event is emitted, so the experience DB
   stays current without manual runs.

PART C — Mistake tracker and rubric

5. Mistake capture
   vscode-rotator llm mistake add --description "Forgot to await async call" \
     --category api-misuse --fix "Added await, reviewed all async callers"
   → stores in mistakes
   → if cosine similarity > 0.85 to existing mistake, increments recurrence_count
   → if recurrence_count >= 2, auto-promotes to rubric_rules

6. Rubric engine
   On every generate-prompt call, prepend active rubric_rules to system prompt.
   vscode-rotator llm rubric list|disable <id>|enable <id>

7. Sprint import
   vscode-rotator llm import-sprints
   → reads all ~/.vscode-rotator/sprints/*.json (R2)
   → upserts into sprints table
   → extracts testsFailed entries → creates mistake records automatically

PART D — Context-aware prompt generation

8. Generate-prompt pipeline
   vscode-rotator llm generate-prompt --goal "string" [--platform claude|chatgpt] [--project <name>]

   Steps:
   a. Vector search documents — top 5 chunks relevant to --goal
   b. Export active ideas from R3 idea store matching --project
   c. Fetch last 3 sprint summaries
   d. Fetch all active rubric_rules
   e. System prompt:
      "You are an expert software developer working on <project>.
       Relevant documentation: <doc chunks>
       Active ideas: <idea export>
       Recent sprint history: <sprint summaries>
       Known mistakes to avoid: <rubric rules>
       Generate a detailed, implementation-ready prompt for: <goal>"
   f. Run local LLM inference → save to prompt_history → stdout + clipboard

9. Quality feedback loop
   vscode-rotator llm rate-prompt <id> --rating 1-5
   → if rating <= 2, prompt for what went wrong → creates mistake record

CONSTRAINTS
-----------
- CPU-only, no GPU required
- Total model + DB < 4 GB
- generate-prompt inference < 60 seconds on 8-core CPU
- Embeddings: onnxruntime-node + all-MiniLM-L6-v2 (84 MB) — fully offline
- No cloud API calls from this module
- Incremental ingestion is the default; full rescan only on --force
- Gracefully degrade if model not downloaded: print setup instructions and exit cleanly

OUTPUT
------
- src/local-llm.js (orchestrator)
- src/llm/inference.js (node-llama-cpp wrapper)
- src/llm/experience-db.js (SQLite operations)
- src/llm/embeddings.js (onnxruntime-node wrapper)
- src/llm/document-ingester.js (incremental ingestion via R1 snapshot)
- src/llm/prompt-generator.js
- src/llm/mistake-tracker.js
- src/commands/llm.js
- test/local-llm.test.js (mocked inference, real DB in temp dir)
- docs section: "Local Dev-LLM"
```

---

## Token Budget Summary

| Sprint | Module | Prompt size | Context remaining |
|--------|--------|-------------|-------------------|
| 1 | R2 Agent handoff | ~22K | ~106K |
| 2 | R3 Idea store | ~14K | ~114K |
| 3 | R4 Browser bridge | ~28K | ~100K |
| 4 | R1 Storage monitor | ~18K | ~110K |
| 5 | R5 Local dev-LLM | ~38K | ~90K |

All sprints are safe within a 128K context window.

---

## Improvements Advisory Summary

| Area | Advisory |
|------|----------|
| Sprint ordering | R2 first — every sprint documents itself with the handoff tracker |
| R1 → R5 wiring | Wire R1 watcher to auto-trigger `llm ingest` on ingestible file changes |
| LLM quantisation | Q3_K_S is the sweet spot — Q2_K degrades too much for code tasks |
| Embeddings | all-MiniLM-L6-v2 via onnxruntime — 84 MB, CPU-only, strong on technical text |
| Browser selectors | JSON config file, not hardcoded — platforms break their DOM regularly |
| Mistake rubric | Promote at recurrence_count >= 2, not 1 — avoids false positives |
| Idea store format | Plain Markdown — any agent, editor, or human reads it without tooling |
| Doc chunking | 512 tokens / 64-token overlap — balances richness vs retrieval precision |
| Incremental ingestion | Default to snapshot diff; --force only when schema changes |
