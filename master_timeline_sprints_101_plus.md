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

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint101-stable` *(created retroactively in Sprint 106 — see note in that snapshot file)*

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

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint102-stable` *(created retroactively in Sprint 106)*

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

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint103-stable` *(created retroactively in Sprint 106)*

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

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint104-stable` *(created retroactively in Sprint 106)*

---

## Sprint 105 — No record found
**Status: Unknown**

No commit, tag, doc, test, or artifact under any naming convention for Sprint 105 was found in git history at the time Sprint 106 documentation was written (2026-07-03). The git log moves directly from `docs(sprint104)` to Sprint 106 working-tree changes. Sprint 105 may have been a skipped/no-op sprint number, or work may have been done but not committed. If source material surfaces, backfill this entry; otherwise treat it as a permanent gap alongside Sprint 89.

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint105-stable` *(placeholder — created retroactively in Sprint 106; content reflects "no record found" state)*

---

## Sprint 106 — Agentic RAG retrieval tools (vector-search + search-code)
**Status: Complete**
**Tag:** `sprint-106: agentic RAG retrieval tools (vector-search, search-code)` *(to be applied)*
**Date: 2026-07-03**

Sprint 106 shipped the agentic RAG retrieval layer for the Unified Theatre local-LLM harness. Two new shared modules provide a clean, DRY foundation for semantic search (Qdrant/embeddings) and lexical/regex search (ripgrep), exposed on both tool surfaces. A latent error-propagation bug in the agent loop was also fixed.

**What was built:**

*Shared retrieval layer:*
- `src/shared/retrieval/vector-client.ts` — `embed()` calls `EMBEDDINGS_URL`, `vectorSearch()` queries Qdrant, maps results to `VectorSearchResult[]`, logs via `retrieval.vector-search`.
- `src/shared/retrieval/code-search.ts` — `resolveGlob()` with path-traversal guard, `searchCode()` shells out to `rg --json`, parses match lines into `CodeSearchHit[]`, logs via `retrieval.code-search`.

*Harness tool surface:*
- `src/agents/tools/vector-search.ts` — `Tool` wrapper: validates `query`, coerces `topK`, formats results as numbered list.
- `src/agents/tools/search-code.ts` — `Tool` wrapper: validates `pattern`, passes optional `glob`, formats hits as `file:line: text`.
- `src/agents/tools/registry.ts` — registered both new tools.
- `.claude/agents/code-reviewer.md` — tool list updated from 1 entry to 3.

*MCP tool surface:*
- `src/mcp/schemas.ts` — added `VectorSearchSchema` and `SearchCodeSchema`.
- `src/mcp/types.ts` — added `VectorSearchInput` and `SearchCodeInput` interfaces.
- `src/mcp/tool-handlers.ts` — added `handleVectorSearch` and `handleSearchCode`; updated `handleListTools` to list 5 tools.
- `src/mcp/server.ts` — registered two new tools via `server.registerTool()`.

*Bug fix:*
- `src/agents/sub-agent.ts` — `executeToolCall` now emits `[TOOL ERROR:name]` on `result.success === false` instead of silently forwarding empty output.

*Tests (80 new tests, total: 5,002 across 301 files):*
- `tests/agents/tools/vector-client.test.ts` (+15 tests)
- `tests/agents/tools/code-search.test.ts` (+19 tests)
- `tests/agents/tools/vector-search.test.ts` (+13 tests)
- `tests/agents/tools/search-code.test.ts` (+13 tests)
- `tests/mcp/tool-handlers.test.ts` (+16 tests)
- `tests/agents/sub-agent.test.ts` (+4 tests)
- `tests/mcp/server.test.ts` — updated tool-count assertion (3→5)

**Coverage (v8):**

| Metric | Result | Threshold | Status |
| ---------- | ------- | --------- | ------ |
| Statements | 94.97% | 75% | ✅ PASS |
| Branches | 92.56% | 60% | ✅ PASS |
| Functions | 93.17% | 80% | ✅ PASS |
| Lines | 95.13% | 80% | ✅ PASS |

**MCP smoke test:** `scripts/verify-mcp-stdio.mjs` confirms 5 tools visible (`ask-local`, `code-review`, `list-tools`, `vector-search`, `search-code`) and callable end-to-end. Exit code 0.

**Pre-existing flaky test:** `tests/storage/storage-monitor.test.js` > "watch mode handles change events with labelFor function" — `ENOENT` race condition in tmpdir cleanup; unrelated to this sprint, existed before.

**Deferred items:**
- `retrieve` router tool — routing heuristic between `vector-search` and `search-code` deferred pending real usage data (sprint 108+).
- `glob` description harmonisation — harness tool description says `src/**` (incorrect: it is a directory path); MCP schema was corrected; harness wording deferred.
- Integration/e2e tests with live Qdrant — outside unit/coverage gate scope; Qdrant not reachable in CI.

**Snapshot:** `strategic-learning-unified-theatre-ai-snapshot-sprint106-stable`

**Documentation backfill:** This sprint's Step 5 also backfilled missing documentation for Sprints 101–105 (all of which lacked entries in this timeline at the time of Sprint 106), and created missing snapshots for Sprints 101–105. See `CURRENT_ACTIVE_SNAPSHOT.md` for the latest active pointer.
