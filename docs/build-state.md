# Build State — Current Progress (Reference Only)

> This is a STATUS READ, not a decision driver. Agents: do not treat this file as direction. Sprint Prompt is the current objective.

**Last updated:** Sprint 99 head (HEAD commit c0ac1404; exact tag at HEAD: none)
**Test suite:** 299 files, 4943 tests, Vitest
**Coverage (v8):** 94.96% stmts / 92.58% branch / 93.22% funcs / 95.11% lines
**GPU default:** -ngl 99 (RTX 5090 Laptop 24GB — prior -ngl 0 constraints obsolete)

## Recent Resolutions (last 3 sprints — older entries move to
## master_timeline_sprints_1_99.md, never rename that file)
- Sprint 99: MCP SDK migration (`Server` → `McpServer`, per-tool `.tool(...)`
  registration with Zod input schemas via new `src/mcp/schemas.ts`);
  coverage-expansion pass (+56 test files / +1105 tests since Sprint 98,
  crossing 90% on all four v8 metrics)
- Sprint 98: WSL Remote MCP server startup failures; TS6+ moduleResolution
  deprecation; smoke test string-assertion mismatch
- Sprint 97: coverage-expansion + CI/installer hardening pass

## Deferred / Uncommitted (intentional, carried forward for triage)
- `coverage-tmp/`, `coverage-tmp2/`, `coverage-tmp3/` — generated scratch
  dirs, gitignore candidates, not committed
- `sonar-duplicates-by-file.json`, `sonar-issues-open.json` — generated
  Sonar exports, gitignore candidates
- `.kiro/` — unknown tool directory, origin unverified, do not commit
- `.github/copilot-instructions.md` — **untracked, pre-existing content
  unreviewed.** Do not overwrite without diffing first (see Sprint 100
  Task 0 below).

## Open Item Carried From Sprint 99 Handoff
- MCP SDK migration has a green Vitest suite but **no live stdio smoke
  test has confirmed the actual protocol handshake**. This is explicitly
  called out in the Sprint 99 snapshot as unverified — treat any claim
  that the MCP migration is "working" as [INFERRED] until Task 1 below
  closes it.

## Permanent Notes
- Sprint 89 is the one permanently undocumented gap in the timeline.
- `master_timeline_sprints_1_99.md` filename must never be changed.
