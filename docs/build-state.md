# Build State — Current Progress (Reference Only)

> This is a STATUS READ, not a decision driver. Agents: do not treat
> this file as direction. Sprint Prompt is the current objective.

**Last updated:** Sprint 100 complete (tag: sprint-100-docs-contract-complete, commit ea5dd5dd)
**Test suite:** 299 files, 4943 tests, 0 failed (unchanged from Sprint 99 — docs-only sprint, no source touched)
**Coverage (v8):** 94.96% stmts / 92.58% branch / 93.22% funcs / 95.11% lines (carried from Sprint 99, not re-measured this sprint)
**GPU default:** -ngl 99 (RTX 5090 Laptop 24GB — prior -ngl 0 constraints obsolete)

## Recent Resolutions (last 3 sprints — older entries move to

## master_timeline_sprints_1_97.md, never rename that file)

- Sprint 100 (docs-only, no source changes): wired the AGENTS.md boot
  contract, created docs/standing-rules.md and docs/build-state.md,
  merged .github/copilot-instructions.md (preserved existing Fast
  Apply / Warp Grep instructions, appended AGENTS pointer block),
  created docs/llama-harness-prefix.md (third injection point, not
  yet wired into src/llm/inference.js), refreshed
  PROJECT_ARCHITECTURE_AI_CONTEXT.md (was Sprint 28-era/stale — now
  documents MCP layer, agent/orchestration layer, LLM/Qdrant layer,
  security overview layer), updated master_timeline_sprints_1_97.md
  and CURRENT_ACTIVE_SNAPSHOT.md, created snapshot artefact
  strategic-learning-unified-theatre-ai-snapshot-sprint100-stable
- Sprint 99: MCP SDK migration (`Server` → `McpServer`, per-tool
  `.tool(...)` registration with Zod input schemas via new
  `src/mcp/schemas.ts`); coverage-expansion pass (+56 test files /
  +1105 tests since Sprint 98, crossing 90% on all four v8 metrics)
- Sprint 98: WSL Remote MCP server startup failures; TS6+
  moduleResolution deprecation; smoke test string-assertion mismatch

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

## Permanent Notes

- Sprint 89 is the one permanently undocumented gap in the timeline.
- `master_timeline_sprints_1_97.md` filename must never be changed
  (confirmed: this is the only timeline file that exists in the repo —
  no `_1_99` variant, despite sprint count exceeding 97).
