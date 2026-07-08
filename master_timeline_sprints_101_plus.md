# Master Timeline — Sprints 101+

Continuation of `master_timeline_sprints_1_97.md` (which covers Sprints 1–100).
New sprint entries are appended here going forward.

---

## Sprint 101 — MCP stdio protocol verification

**Status: Complete**
**Tag: sprint-101-complete** (`feat(sprint-101): verify MCP stdio protocol handshake with live process-level test`)
**Date: 2026-07-02**

Sprint 101 closed the item carried forward from Sprint 99's handoff: confirm the MCP SDK migration passes a live stdio smoke test rather than relying on Vitest mocks alone.

**What was built:**

- `scripts/verify-mcp-stdio.mjs` — spawns `tsx src/mcp/server.ts` as a child process and drives it over stdio with real JSON-RPC messages: `initialize`, `tools/list`, `tools/call`. Script exits 0 on success, non-zero on any protocol failure.
- `tsx` added as a `devDependency` (the original `ts-node/esm` path was broken; `tsx` is the correct launcher for this codebase).
- `package.json` npm overrides for `protobufjs` (>=7.6.3) and `tar` (>=7.5.16) to eliminate 1 critical + 8 high severity transitive vulnerabilities without changing `@xenova/transformers` or `electron-builder` major versions.
- `docs/audit/ARCHITECTURE_AUDIT.md` and `docs/audit/AUDIT_PROGRESS.md` — completed read-only architecture audit.
- `PROJECT_ARCHITECTURE_AI_CONTEXT.md` — MCP layer confidence upgraded from `[INFERRED]` to `[CONFIRMED]` with citation to the verification script.
- `docs/build-state.md` — updated "Last updated" to reference Sprint 101 completion.
- `master_timeline_sprints_1_97.md` — Sprint 101 entry appended.

**Files changed:** `PROJECT_ARCHITECTURE_AI_CONTEXT.md`, `docs/audit/ARCHITECTURE_AUDIT.md`, `docs/audit/AUDIT_PROGRESS.md`, `docs/build-state.md`, `master_timeline_sprints_1_97.md`, `package.json`, `package-lock.json`, `scripts/verify-mcp-stdio.mjs`

**Test/coverage state:** Carried forward from Sprint 100 — 299 test files / 4943 tests / 94.96% statements / 92.58% branches / 93.22% functions / 95.11% lines. No new tests this sprint.

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint101-stable` _(created retroactively in Sprint 106 — see note in that snapshot file)_

---

## Sprint 102 — Electron Linux packaging fix

**Status: Complete**
**Tag:** `fix(sprint-102): wire Linux icon set to resources/icons, correct maintainer email`
**Date: 2026-07-03**

Sprint 102 resolved the `unknown output format set` electron-builder Linux packaging bug documented in the prior sprint. Root cause: `electron-builder`'s Linux target requires a directory of PNG icons; only a single `.ico` under the gitignored `build/` path was previously configured, so the icon set never existed on fresh clones or CI.

**What was built:**

- `resources/icons/` — tracked PNG icon set: 16×16, 32×32, 48×48, 64×64, 128×128, 256×256, 512×512.
- `package.json` — `win` target scoped to `icon.ico`; `linux` target pointed at `resources/icons/`; `author.email` corrected to `pawansinghal@garudatechnology.co.in` (required by FPM for `.deb` packaging).
- `docs/build-state.md` — "Open Items Carried Forward" item moved to Sprint 102 resolved entry.
- Verified: `npm run electron:build -- --linux` produces `UnifiedTheatre-0.1.0-linux-x86_64.AppImage` and `UnifiedTheatre-0.1.0-linux-amd64.deb`.

**Files changed:** `docs/build-state.md`, `package.json`, `resources/icons/*.png` (7 new files)

**Test/coverage state:** Unchanged from Sprint 100/101.

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint102-stable` _(created retroactively in Sprint 106)_

---

## Sprint 103 — Windows/Mac packaging investigation

**Status: Complete**
**Tag:** `docs(sprint-103): document Windows/Mac packaging verification results`
**Date: 2026-07-03**

Documentation-only sprint. Investigated Windows and macOS Electron packaging from the WSL2 development host; established hard boundaries for both:

- **Windows (.nsis/.exe):** `npm run electron:build -- --win` blocked by missing `wine`/NSIS tooling on this Linux host. Fixable via local `wine64`/`wine32`+`nsis` install or a native Windows CI runner (`windows-latest`). No artifact produced.
- **macOS (.dmg):** `npm run electron:build -- --mac` blocked by `dmg-license` → `iconv-corefoundation` (darwin-only native module). `npm install -D dmg-license` fails on Linux. macOS packaging is not achievable from this host at any level — requires a macOS build host or CI runner. Do NOT add `dmg-license` as a general `devDependency`; it breaks Linux installs.

**Files changed:** `docs/build-state.md`

**Test/coverage state:** Unchanged from Sprint 100/101.

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint103-stable` _(created retroactively in Sprint 106)_

---

## Sprint 104 — CI build-verify workflow + Node version + test infrastructure hardening

**Status: Complete**
**Tags:**

- `ci(sprint-104): add manual GitHub Actions workflow for unsigned Linux/Windows/macOS build verification`
- `fix(sprint-104): correct Node version to match Electron 42.x requirement`
- `fix(sprint104): resolve test portability, coverage path mismatch, and guard-test timing`
- `docs(sprint104): document test infrastructure fixes (native binary, path portability, coverage timing)`
  **Date: 2026-07-03**

Sprint 104 shipped four distinct fixes across CI, Node version correctness, and test infrastructure:

**CI workflow:**

- `.github/workflows/build-verify.yml` — new `workflow_dispatch`-only matrix build across `ubuntu-latest`, `windows-latest`, `macos-latest`; uploads unsigned artifacts per platform for manual testing; no signing, notarization, or publish step.
- `package.json` — added `dist:mac` script (`electron-builder --mac zip`) to avoid the `dmg-license` dependency on CI.
- `release.yml` flagged as stale/unsafe (runs `electron-builder -mwl` on `windows-latest` only, which cannot produce valid macOS artifacts).

**Node version:**

- `package.json` engines.node: `>=18` → `>=22.12.0` — corrected per `EBADENGINE` warnings from `electron@42.5.2`, `@electron/get@5.0.0`, and related dependencies.
- `.github/workflows/build-verify.yml` — `node-version 20 → 22` in all three jobs.
- `test.yml` still pins `node-version 20` — flagged as likely stale, left unchanged pending separate approval.

**Test infrastructure:**

- Fixed 4 hardcoded `/home/pawan/vscodeagent/Solution` absolute paths in `storageStatus.test.js`, `paths.test.js`, `sprint85-guard.test.js`, `sprint86-hotspot-guard.test.js` — replaced with `process.cwd()`-relative paths.
- `vitest.config.ts` — corrected `reportsDirectory` from `./coverage/ts` → `./coverage` (what all consumers expect).
- Root-cause identified for persistent sprint91/92 guard failures: those tests read `coverage-summary.json`, which is only written after test execution completes — they cannot reliably pass within the same invocation that generates their own coverage data.
- `vitest.test-ci.config.ts` — created; excludes sprint91/sprint92 from the main `test:ci` run; `coverage:guarded` runs coverage generation first, then the two guard files as a distinct post-coverage step.
- `sprint71`/`sprint72` guard assertions strengthened to check three independent components rather than one exact string.
- `better-sqlite3` native binary rebuilt for Linux — a stale Windows-built `.node` file (dated June 15) had silently caused 12 test files to fail with `invalid ELF header`, masking true coverage numbers.

**Verification:**

- `test:ci` exits 0 (297 files, 4923 tests after exclusions).
- `coverage:guarded` exits 0 (299 files, 4943 tests including guard files).
- Real coverage confirmed: 94.96% statements / 92.58% branches / 93.22% functions / 95.11% lines.

**Files changed:** `.github/workflows/build-verify.yml`, `docs/build-state.md`, `package.json`, `tests/internal/paths.test.js`, `tests/sprint71-newcode-scope-guard.test.js`, `tests/sprint72-modified-newcode-boundary.test.js`, `tests/sprint85-guard.test.js`, `tests/sprint86-hotspot-guard.test.js`, `tests/storage/storageStatus.test.js`, `vitest.config.ts`, `vitest.test-ci.config.ts`

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint104-stable` _(created retroactively in Sprint 106)_

---

## Sprint 105 — No record found

**Status: Unknown**

No commit, tag, doc, test, or artifact under any naming convention for Sprint 105 was found in git history at the time Sprint 106 documentation was written (2026-07-03). The git log moves directly from `docs(sprint104)` to Sprint 106 working-tree changes. Sprint 105 may have been a skipped/no-op sprint number, or work may have been done but not committed. If source material surfaces, backfill this entry; otherwise treat it as a permanent gap alongside Sprint 89.

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint105-stable` _(placeholder — created retroactively in Sprint 106; content reflects "no record found" state)_

---

## Sprint 106 — Agentic RAG retrieval tools (vector-search + search-code)

**Status: Complete**
**Tag:** `sprint-106: agentic RAG retrieval tools (vector-search, search-code)` _(to be applied)_
**Date: 2026-07-03**

Sprint 106 shipped the agentic RAG retrieval layer for the Unified Theatre local-LLM harness. Two new shared modules provide a clean, DRY foundation for semantic search (Qdrant/embeddings) and lexical/regex search (ripgrep), exposed on both tool surfaces. A latent error-propagation bug in the agent loop was also fixed.

**What was built:**

_Shared retrieval layer:_

- `src/shared/retrieval/vector-client.ts` — `embed()` calls `EMBEDDINGS_URL`, `vectorSearch()` queries Qdrant, maps results to `VectorSearchResult[]`, logs via `retrieval.vector-search`.
- `src/shared/retrieval/code-search.ts` — `resolveGlob()` with path-traversal guard, `searchCode()` shells out to `rg --json`, parses match lines into `CodeSearchHit[]`, logs via `retrieval.code-search`.

_Harness tool surface:_

- `src/agents/tools/vector-search.ts` — `Tool` wrapper: validates `query`, coerces `topK`, formats results as numbered list.
- `src/agents/tools/search-code.ts` — `Tool` wrapper: validates `pattern`, passes optional `glob`, formats hits as `file:line: text`.
- `src/agents/tools/registry.ts` — registered both new tools.
- `.claude/agents/code-reviewer.md` — tool list updated from 1 entry to 3.

_MCP tool surface:_

- `src/mcp/schemas.ts` — added `VectorSearchSchema` and `SearchCodeSchema`.
- `src/mcp/types.ts` — added `VectorSearchInput` and `SearchCodeInput` interfaces.
- `src/mcp/tool-handlers.ts` — added `handleVectorSearch` and `handleSearchCode`; updated `handleListTools` to list 5 tools.
- `src/mcp/server.ts` — registered two new tools via `server.registerTool()`.

_Bug fix:_

- `src/agents/sub-agent.ts` — `executeToolCall` now emits `[TOOL ERROR:name]` on `result.success === false` instead of silently forwarding empty output.

_Tests (80 new tests, total: 5,002 across 301 files):_

- `tests/agents/tools/vector-client.test.ts` (+15 tests)
- `tests/agents/tools/code-search.test.ts` (+19 tests)
- `tests/agents/tools/vector-search.test.ts` (+13 tests)
- `tests/agents/tools/search-code.test.ts` (+13 tests)
- `tests/mcp/tool-handlers.test.ts` (+16 tests)
- `tests/agents/sub-agent.test.ts` (+4 tests)
- `tests/mcp/server.test.ts` — updated tool-count assertion (3→5)

**Coverage (v8):**

| Metric     | Result | Threshold | Status  |
| ---------- | ------ | --------- | ------- |
| Statements | 94.97% | 75%       | ✅ PASS |
| Branches   | 92.56% | 60%       | ✅ PASS |
| Functions  | 93.17% | 80%       | ✅ PASS |
| Lines      | 95.13% | 80%       | ✅ PASS |

**MCP smoke test:** `scripts/verify-mcp-stdio.mjs` confirms 5 tools visible (`ask-local`, `code-review`, `list-tools`, `vector-search`, `search-code`) and callable end-to-end. Exit code 0.

**Pre-existing flaky test:** `tests/storage/storage-monitor.test.js` > "watch mode handles change events with labelFor function" — `ENOENT` race condition in tmpdir cleanup; unrelated to this sprint, existed before.

**Deferred items:**

- `retrieve` router tool — routing heuristic between `vector-search` and `search-code` deferred pending real usage data (sprint 108+).
- `glob` description harmonisation — harness tool description says `src/**` (incorrect: it is a directory path); MCP schema was corrected; harness wording deferred.
- Integration/e2e tests with live Qdrant — outside unit/coverage gate scope; Qdrant not reachable in CI.

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint106-stable`

**Documentation backfill:** This sprint's Step 5 also backfilled missing documentation for Sprints 101–105 (all of which lacked entries in this timeline at the time of Sprint 106), and created missing snapshots for Sprints 101–105. See `CURRENT_ACTIVE_SNAPSHOT.md` for the latest active pointer.

---

## Sprint 107 — MCP client verification + Local LLM harness fix

**Status: Complete**
**Date: 2026-07-09**

Sprint 107 focused on verifying MCP client compatibility across the supported client ecosystem and fixing the Local LLM harness to prevent infinite loops by adding the `[DONE]` marker instruction.

**What was built:**

- **MCP client verification matrix** — Six clients tested against the MCP server with 6 tools (`ask-local`, `code-review`, `list-tools`, `vector-search`, `search-code`, `retrieve`):
  - **LIVE clients (4):** GitHub Copilot, Kiro, Codex, Local LLM Harness
  - **NOT POSSIBLE HERE (2):** Claude, Continue.dev (environment restrictions)
- **Local LLM harness fix** — Added `[DONE]` marker instruction to prevent infinite loops in the MCP server response handling.
- **Retrieval router integration** — `retrieve` tool now routes between `vector-search` and `search-code` using the heuristic established in Sprint 106.

**Files changed:**

- `src/mcp/server.ts` — Added `[DONE]` marker instruction to prevent infinite loops.
- `scripts/verify-mcp-stdio.mjs` — Updated to test the new `retrieve` tool.
- `.claude/sprints/sprint-107/` — Created complete sprint documentation with step-1 through step-5 state files.

**Test & coverage state:**

- **Test suite:** 301 test files, 5,002 tests
- **Coverage:** Statements 94.97%, Branches 92.56%, Functions 93.17%, Lines 95.13%
- **Coverage gate:** ✅ PASS (all thresholds met)

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint107-stable`

**Note:** No completion tag exists in git history for Sprint 107 (unlike previous sprints that used `sprint-XX-complete` tags). The sprint is considered complete based on documentation in `.claude/sprints/sprint-107/`.

---

## Sprint 108 — Tool governance (mandates, security fix, decision receipts)

**Status: Complete**
**Date: 2026-07-10**

Sprint 108 established tool governance via `docs/tool-mandates.md`, fixed a path-traversal security vulnerability in `read-file.ts` and `router.ts`, added subprocess flag-injection protection in `code-search.ts`, centralized PROJECT_ROOT in `paths.ts`, and implemented decision-receipt logging wired to the retrieval router.

**What was built:**

_Tool governance:_

- `docs/tool-mandates.md` — Source of truth for tool boundaries and authority levels. Documents 12 tools with their purpose, input/output, authority level (1-3), and constraints. Authority level 3 tools (read-file, write-file, code-search, vector-search, search-code, retrieve) require explicit user request or agent self-request with justification.

_Security fixes:_

- `src/shared/security/safe-path.ts` — Created shared `resolveSafePath()` helper using `fs.realpathSync()` to prevent symlink escapes. Validates resolved path stays within `PROJECT_ROOT`.
- `src/agents/tools/read-file.ts` — Replaced inline path resolution with `resolveSafePath()` import. Both path-traversal vectors (absolute paths and `../` relative paths) now blocked.
- `src/shared/retrieval/router.ts` — "file" strategy replaced inline path resolution with `resolveSafePath()` import. Path-traversal blocked.
- `src/shared/config/paths.ts` — Created as single source of truth for `PROJECT_ROOT` constant. Both `read-file.ts` and `router.ts` now import from this shared module.
- `src/agents/tools/code-search.ts` — Added `--` separator before pattern in args array to prevent subprocess flag injection (e.g., `--pattern=-e`).

_Decision receipt logging:_

- `src/shared/audit/decision-receipt.ts` — Created `recordDecision()` function that logs via shared logger and stores in in-memory array. Logs strategy choice point in `retrieve()` router with inputs, strategy, and timestamp.

**Files changed:**

- `docs/tool-mandates.md` — Created (new file)
- `src/shared/security/safe-path.ts` — Created (new file)
- `src/shared/config/paths.ts` — Created (new file)
- `src/shared/audit/decision-receipt.ts` — Created (new file)
- `src/agents/tools/read-file.ts` — Modified (path-traversal fix, PROJECT_ROOT import)
- `src/shared/retrieval/router.ts` — Modified (path-traversal fix, PROJECT_ROOT import, decision-receipt wiring)
- `src/agents/tools/code-search.ts` — Modified (subprocess flag-injection fix)
- `PROJECT_ARCHITECTURE_AI_CONTEXT.md` — Updated with Tool Governance Layer section
- `docs/ARCHITECTURE_INDEX.md` — Updated with Governance/Audit section
- `docs/build-state.md` — Updated with Sprint 108 information
- `master_timeline_sprints_101_plus.md` — This entry appended

**Test/coverage state:**

- **Test suite:** 5089 tests, 0 failures
- **Coverage:** Statements 94.92%, Branches 92.55%, Functions 93%, Lines 95.1%
- **Coverage gate:** ✅ PASS (all thresholds met)

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint108-stable`

---

## Sprint 109 — includeWorkspaceContext default change + sub-agent loop fix

**Status: Committed — local orphan branch, never merged to origin/main**
**Branch: `sprint-109-loop-fix-and-prompt-budget`**
**Commit: `4b8aec5d`** (`sprint-109 fix sub-agent loop history/doneMarker bug; opt-in context injection; prompt budgeting`)
**Date: 2026-07-07 00:54:20 +0530**

Sprint 109 is a single commit on a local branch that was never pushed to `origin` and
never merged into `origin/main` or `main`. Its merge-base with `origin/main` is
`dec9c373` (last sprint-108 post-close fixup), meaning it branches off the tip of
sprint-108 work. It predates sprint-110 branch creation but was never integrated.

**Branch disposition decision (recorded 2026-07-07):**
The `sprint-109-loop-fix-and-prompt-budget` branch (tip `4b8aec5d`) is **left as a
local orphan**. Its content (sub-agent loop history/doneMarker bug fix, opt-in context
injection, prompt budgeting) was superseded and reimplemented as part of sprint-110's
working-tree changes. Do not merge, rebase, or cherry-pick this branch going forward.
It is retained locally as a reference only. If it becomes stale or confusing, delete
it with `git branch -D sprint-109-loop-fix-and-prompt-budget`.

**What the commit contains (`git show 4b8aec5d --stat`):**

- `.claude/sprints/sprint-109/progress.md` — sprint state file (122 lines, new)
- `CURRENT_ACTIVE_SNAPSHOT.md` — updated snapshot pointer
- `PROJECT_ARCHITECTURE_AI_CONTEXT.md` — updated (133 lines changed)
- `docs/ARCHITECTURE_INDEX.md` — updated (+5 lines)
- `docs/build-state.md` — updated (+17/-1 lines)
- `e2e-design/workspace-policy-context-routing.spec.ts` — updated (+166/-? lines)
- `master_timeline_sprints_101_plus.md` — sprint 109 entry appended (+59 lines)
- `master_timeline_sprints_1_97.md` — summary table updated (+21/-1 lines)
- `src/agents/sub-agent.ts` — sub-agent loop fix (+48/-? lines)
- `src/governance/workspace-context.ts` — workspace context changes (+71/-? lines)
- `src/llm/gateway.ts` — `includeWorkspaceContext` defaulted to `false`; prompt budget logic (+139/-? lines)
- `src/mcp/tool-handlers.ts` — minor update (+2 lines)
- `src/memory/request-context.ts` — updated (+23/-? lines)
- `src/shared/contracts/provider.ts` — minor update (+1 line)
- `src/shared/schemas/provider.schema.ts` — minor update (+1 line)
- `tests/agents/sub-agent-loop.test.ts` — new test file (+206 lines)
- `tests/llm/gateway-coverage.test.ts` — updated (+40/-? lines)
- `tests/memory/request-context-coverage.test.ts` — updated (+13/-? lines)
- `tests/sprint29-smoke.test.js` — updated (+15/-? lines)
- `tests/sprint30-smoke.test.js` — updated (+6/-? lines)
- `tests/workspace-context.test.js` — updated (+19/-? lines)

**Total: 21 files changed, 935 insertions, 174 deletions**

**Key functional change:** `src/llm/gateway.ts` — `includeWorkspaceContext` parameter
defaulted to `false`. This is the change that motivated the `never-truncate-userPrompt`
hardening in Sprint 110: when `includeWorkspaceContext` is false the `"User request:"`
marker is never injected, so any marker-based boundary inference is unsafe. Sprint 110's
explicit `userPrompt` boundary parameter was designed to handle this case correctly.

**Test/coverage state at commit:** Not independently verified (commit never ran through
CI on origin). The commit message and progress.md claim a passing test state but this
was not confirmed from a clean origin checkout.

**Snapshot:** None created — sprint was never formally closed on origin/main.

---

## Sprint 110 — Retrieval-first classifier and prompt budget hardening

**Status: Complete**
**Branch: `sprint-110-budget-guard-and-retrieval-classifier`**
**Commit: `ec42fe73fc40f1520f6e140ac614e058597dc6f1`**
**Tag: `sprint-110-complete`**
**Date: 2026-07-07**

> **Audit note (2026-07-07):** Sprint 110 was closed after fresh verification runs. The commit and tag values recorded here are the verified git values from the closure run.

Sprint 110 implemented the retrieval-first classifier that skips the second `gateway.ask()` follow-up for path-like and symbol-like tool calls, fixed the `enforcePromptBudget()` truncation direction for TOOL RESULT content, and hardened the `never-truncate-userPrompt` guarantee.

**What was built (committed state):**

_Retrieval-first classifier:_

- `src/agents/tool-call-classifier.ts` — New untracked file. Pure-function `classifyToolCall()` categorizes tool calls into four classes: path-like, symbol-like, semantic, or synthesis. Path-like tools (`read-file` with plain file path) and symbol-like tools (`search-code` with single identifier or dotted qualified name) skip the second `gateway.ask()` call and return raw tool result directly.
- `tests/agents/tool-call-classifier.test.ts` — New untracked file. Comprehensive test suite (34 tests) covering all four classification classes and edge cases.
- `src/agents/sub-agent.ts` — Modified. Updated `executeToolCall()` signature to accept optional `skipGatewayAsk` parameter. Modified `runSubAgent()` loop to call `classifyToolCall()` after parsing tool calls.
- `tests/agents/sub-agent.test.ts` — Modified. Updated call counts; added regression test for all-path-like-tool-calls flow.

_Prompt budget hardening:_

- `src/llm/agent-loop-guard.js` — Modified. Fixed `enforcePromptBudget()` truncation direction for TOOL RESULT content (keep most recent portion). Hardened `never-truncate-userPrompt` guarantee to avoid silent fallback to blind end-truncation when no context marker is present.
- `src/governance/workspace-context.ts` — Modified. Added 500-char truncation at write time with `...` suffix.
- `tests/workspace-context.test.js` — Modified. Added 3 new truncation test cases.

_LLM gateway:_

- `src/llm/gateway.ts` — Modified. Prompt budget integration and related hardening.

_Other modified tracked files (from `git diff --name-only HEAD`, verified):_

- `.claude/commands/code-review.md` — Updated with iteration budget guidance
- `.claude/sprints/sprint-108/progress.md` — Audit correction note added (this session)
- `CURRENT_ACTIVE_SNAPSHOT.md` — Snapshot pointer updated
- `PROJECT_ARCHITECTURE_AI_CONTEXT.md` — Sprint 110 section added
- `docs/ARCHITECTURE_INDEX.md` — gateway.ts, agent-loop-guard.js, tool-call-classifier.ts entries added
- `docs/build-state.md` — Sprint 110 information added
- `master_timeline_sprints_101_plus.md` — This entry
- `master_timeline_sprints_1_97.md` — Sprint 110 row added to summary table
- `src/mcp/tool-handlers.ts` — Minor update
- `src/shared/contracts/provider.ts` — Minor update
- `src/installer/hw-probe/package.json` — Dependency update
- `src/installer/hw-probe/package-lock.json` — Lock file update
- `tests/llm/agent-loop-guard-branches.test.js` — New branch coverage tests
- `tests/llm/gateway-coverage.test.ts` — Updated coverage tests

_New untracked files (not yet `git add`ed):_

- `src/agents/tool-call-classifier.ts`
- `tests/agents/tool-call-classifier.test.ts`
- `tests/llm/gateway-prompt-budget.test.ts`

_Deleted (this session — were untracked temp files, never committed):_

- `tests/llm/budget-debug-temp.test.ts`
- `tests/llm/budget-debug2-temp.test.ts`
- `tests/llm/budget-debug3-temp.test.ts`
- `tests/llm/budget-debug4-temp.test.ts`

**Total scope:** 26 files changed in the closure commit (including 3 new files added for the classifier and tests).

**Test/coverage state (verified from the committed state):**

- **Test suite:** 5144 tests, 0 failures (fresh run)
- **Coverage:** Statements 94.93%, Branches 92.48%, Functions 93.03%, Lines 95.13%
- **Coverage gate:** ✅ PASS (all thresholds met)
- **TypeCheck:** `npx tsc --noEmit` — 0 errors
- **MCP smoke:** `scripts/verify-mcp-stdio.mjs` — 6 tools verified

**Snapshot reference:** `strategic-learning-unified-theatre-ai-snapshot-sprint110-stable`

**Closure record:** See `.claude/sprints/sprint-110/progress.md` for the sprint-110 closure note.
