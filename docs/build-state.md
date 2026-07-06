# Build State — Current Progress (Reference Only)

> This is a STATUS READ, not a decision driver. Agents: do not treat
> this file as direction. Sprint Prompt is the current objective.
>
> **Process note:** This file MUST be updated at the close of every sprint.
> The absence of this convention is why doc updates were skipped for Sprints
> 102–105. Always include "Last verified: Sprint N" so drift is immediately
> visible to the next agent session.

**Last verified: Sprint 108**
**Last updated:** Sprint 108 complete (tool governance: mandates, security fixes, decision receipts; path-traversal fix in read-file.ts and router.ts; subprocess flag-injection fix in code-search.ts; PROJECT_ROOT/REPO_ROOT unification; decision-receipt.ts wired to retrieve() router only)
**Test suite:** 5089 tests, 0 failures (all tests passing)
**Coverage (v8):** 94.92% stmts / 92.55% branch / 93% funcs / 95.1% lines — all above thresholds (75/60/80/80)
**TypeCheck:** `npx tsc --noEmit` — 0 errors
**MCP smoke:** `scripts/verify-mcp-stdio.mjs` — 6 tools returned (including retrieve), exit code 0 [CONFIRMED]
**GPU default:** -ngl 99 (RTX 5090 Laptop 24GB — prior -ngl 0 constraints obsolete)

## Recent Resolutions (last 3 sprints — older entries in master_timeline_sprints_101_plus.md)

- Sprint 108: Tool governance (mandates, security fixes, decision receipts). Created
  `docs/tool-mandates.md` as source of truth for tool boundaries and authority levels.
  Fixed path-traversal vulnerability in `src/agents/tools/read-file.ts` and
  `src/shared/retrieval/router.ts`'s "file" strategy via shared `resolveSafePath()`
  helper in `src/shared/security/safe-path.ts`. Added subprocess flag-injection fix
  in `src/agents/tools/code-search.ts` via "--" separator before pattern. Centralized
  PROJECT_ROOT in `src/shared/config/paths.ts`. Created decision-receipt logger
  `src/shared/audit/decision-receipt.ts` wired to `retrieve()` router only. 5089 tests
  passing, 0 failures. Coverage: 94.92% stmts / 92.55% branch / 93% funcs / 95.1% lines.
  Complete sprint documentation in `.claude/sprints/sprint-108/`.
- Sprint 107: MCP client verification matrix (6 clients: 4 LIVE, 2 NOT POSSIBLE HERE)
  and Local LLM harness fix with [DONE] marker instruction. Retrieval router integration
  (`retrieve` tool routing between `vector-search` and `search-code`). Complete sprint
  documentation in `.claude/sprints/sprint-107/`. MCP smoke test: 6 tools confirmed.
- Sprint 106: Agentic RAG retrieval tools. Created `src/shared/retrieval/` layer
  (`vector-client.ts` via Qdrant/embeddings, `code-search.ts` via ripgrep). Wired
  `vector-search` and `search-code` on both the harness tool registry and the MCP
  server. Fixed `executeToolCall` error propagation bug (`[TOOL ERROR:name]` on
  failure). +80 tests (301 files / 5,002 total). Coverage above all four v8
  thresholds. MCP smoke test: 5 tools confirmed.
- Sprint 104/105: CI build-verify workflow, Node version correction (>=18→>=22.12.0),
  test portability fixes (hardcoded paths), coverage path fix, native binary rebuild,
  sprint91/92 guard timing fix via `vitest.test-ci.config.ts`.
- Sprint 101–103: MCP stdio live verification (`scripts/verify-mcp-stdio.mjs`),
  Linux packaging fix (PNG icon set in `resources/icons/`), Windows/Mac host
  limitation documented.

## Open Items Carried Forward

### 1. MCP stdio smoke test — RESOLVED (confirmed)

Sprint 101 verified the MCP SDK migration (`McpServer` + Zod-backed
schemas) with a live stdio protocol handshake by spawning the server
process and exchanging real JSON-RPC messages over stdio. The verified
flow exercised `initialize`, `tools/list`, and `tools/call` successfully.
Verification artefact: `scripts/verify-mcp-stdio.mjs`.
Status: [CONFIRMED] — the MCP migration is now functionally verified at
the transport layer.

### 2. llama.cpp harness prefix not wired in

docs/llama-harness-prefix.md exists but src/llm/inference.js does not
yet load it — confirmed no file-based system-prompt-prefix mechanism
exists in inference.js as of Sprint 99/100 inspection. Wiring this in
is a separate future task, not yet scheduled.

### 3. Architecture snapshot sprawl — untriaged

34 architecture-related files exist at repo root, including 32+
timestamped `PROJECT_ARCHITECTURE_BASELINE-*.md` snapshots plus
`ARCHITECTURE_INDEX.md`, `ARCHITECTURE_SYNC_RULES.md`,
`01b-technical-architecture.md`, `09a-architecture-document.md`.
Sprint 100 updated only the canonical living doc
(`PROJECT_ARCHITECTURE_AI_CONTEXT.md`). No decision has been made on
archiving, gitignoring future snapshots, or leaving the baseline files
as-is. Needs a human decision, not agent auto-resolution.

### 4. Untriaged working-tree items (carried from Sprint 99 handoff,

### still not resolved)

- `.kiro/` — unknown tool directory, origin unverified, do not commit
- `coverage-tmp/`, `coverage-tmp2/`, `coverage-tmp3/` — generated
  scratch dirs, gitignore candidates
- `sonar-duplicates-by-file.json`, `sonar-issues-open.json` —
  generated Sonar exports, gitignore candidates
- `agent-session.ndjson` — shows as modified in git status across
  multiple sprints now; likely a log file that should be gitignored
  rather than repeatedly appearing as noise in status checks

## Sprint 102

- Electron Linux packaging fix: moved PNG icon set (16x16–512x512) out of gitignored `build/` into tracked `resources/icons/`, and updated `package.json`'s Linux target `icon` to point to `resources/icons`. Root cause: electron-builder's Linux `set` icon format requires a directory of PNG icons; the repository previously referenced a single `.ico` under a gitignored `build/` directory, so the icon set was unavailable on fresh clones/CI. Also corrected `package.json` author email to `pawansinghal@garudatechnology.co.in`, required by FPM for `.deb` packaging. Packaged artifacts verified: `release/UnifiedTheatre-0.1.0-linux-x86_64.AppImage` and `release/UnifiedTheatre-0.1.0-linux-amd64.deb`.

## Sprint 103

- Windows packaging: verification attempted via `npm run electron:build -- --win`; blocked by missing `wine`/NSIS tooling on this WSL2 host. electron-builder requires `wine` to run Windows codesigning/NSIS steps from a Linux host. Not yet resolved — needs either (a) `wine64`/`wine32` + `nsis` installed on this host (may require enabling i386 architecture and several hundred MB of packages), or (b) use a native Windows CI runner (e.g., GitHub Actions `windows-latest`) to produce real Windows artifacts. No decision yet on which path to take.

- macOS packaging: feasibility check attempted from this Linux/WSL2 host (`npm run electron:build -- --mac`). I attempted to install the missing dev dependency `dmg-license` to proceed locally, but `npm install -D dmg-license` failed on this platform due to a macOS-only dependency (`iconv-corefoundation` expects `os: darwin`). Therefore macOS packaging remains blocked on this host: even if Node-level deps were satisfied, macOS full packaging and signing require a macOS build host or runner (e.g., `macos-latest`) for real distributables. Recommendation: perform mac packaging on a macOS runner or local Mac machine; do not add `dmg-license` as a generic devDependency for Linux hosts because it pulls mac-only deps and cannot be installed here.

## Sprint 104

- Added manual GitHub Actions packaging verification workflow in `.github/workflows/build-verify.yml`. It runs native platform packaging on GitHub-hosted runners: `ubuntu-latest` for Linux, `windows-latest` for Windows, and `macos-latest` for macOS. This preserves platform-specific packaging semantics and avoids relying on the existing tag-triggered release workflow to produce all targets from a single host.

- Existing `.github/workflows/release.yml` remains stale for full multi-platform packaging because it currently runs `npm run dist` on `windows-latest`, which is unsafe for macOS artifact generation. The new manual verification workflow is the appropriate place to confirm platform-specific packages before any release automation is adjusted.

## Sprint 105

- Rebuilt the `better-sqlite3` native Linux binary after detecting a stale Windows-built `.node` file that caused 12 test files to fail to load on this host.
- Fixed 4 tests with hardcoded `/home/pawan/vscodeagent/Solution` absolute paths to use `process.cwd()` instead, restoring portable test execution.
- Corrected `vitest.config.ts` so the coverage reporter writes to `./coverage` instead of `./coverage/ts`.
- Determined `sprint91`/`sprint92` guard tests cannot reliably run in the same invocation that generates their own coverage data; they must run via `npm run coverage:guarded`, not as part of `npm run test:ci`.
- Verified real coverage after fixes: 94.96% statements / 92.58% branches.
- Commit reference: `9959f747`

## Sprint 106

- **Agentic RAG retrieval layer:** Created `src/shared/retrieval/vector-client.ts`
  (Qdrant semantic search via embeddings) and `src/shared/retrieval/code-search.ts`
  (ripgrep lexical/regex search). Both modules are shared between the harness tool
  surface and the MCP server surface — neither surface contains retrieval logic
  directly.
- **Harness tools:** `src/agents/tools/vector-search.ts` and
  `src/agents/tools/search-code.ts` registered in `src/agents/tools/registry.ts`.
  Harness tool count: 1→3.
- **MCP tools:** `handleVectorSearch` and `handleSearchCode` added to
  `src/mcp/tool-handlers.ts`; registered in `src/mcp/server.ts` via
  `server.registerTool()`. MCP tool count: 3→5.
- **Bug fix:** `src/agents/sub-agent.ts` `executeToolCall` now emits
  `[TOOL ERROR:name]` on `result.success === false` instead of silently
  forwarding empty output.
- **Tests:** +80 tests across 6 files. Total: 301 files / 5,002 tests.
- **Coverage:** 94.97% stmts / 92.56% branch / 93.17% funcs / 95.13% lines.
- **Smoke test:** `scripts/verify-mcp-stdio.mjs` confirms 5 tools, exit 0.
- **Pre-existing flaky test:** `tests/storage/storage-monitor.test.js` "watch
  mode handles change events with labelFor function" — ENOENT race condition,
  unrelated to this sprint, existed before.
- **Deferred:** `retrieve` router tool (pending usage data), `glob` description
  harmonisation (harness vs MCP wording mismatch), integration tests with live
  Qdrant.
- **Docs:** Step 5 of this sprint backfilled missing documentation for Sprints
  101–105 and created missing snapshots for those sprints.

## Permanent Notes

- Sprint 89 is the one permanently undocumented gap in the timeline (no commit,
  doc, test, or artifact found anywhere in git history under any name).
- Sprint 105 is a second gap: no commit found as of Sprint 106 documentation
  pass. May be a skipped sprint number.
- `master_timeline_sprints_1_97.md` filename must never be changed; it is the
  canonical historical record for Sprints 1–100. Sprints 101+ continue in
  `master_timeline_sprints_101_plus.md`.
- `docs/build-state.md` must be updated at the close of every sprint — the
  "Last verified: Sprint N" line at the top is the canary. If it drifts more
  than 1 sprint behind, documentation debt is accumulating.
