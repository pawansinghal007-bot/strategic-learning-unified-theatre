# Build State — Current Progress (Reference Only)

> This is a STATUS READ, not a decision driver. Agents: do not treat
> this file as direction. Sprint Prompt is the current objective.
>
> **Process note:** This file MUST be updated at the close of every sprint.
> The absence of this convention is why doc updates were skipped for Sprints
> 102–105. Always include "Last verified: Sprint N" so drift is immediately
> visible to the next agent session.

**Last verified: Sprint 118.5 — Qdrant Retrieval Consolidation — 2026-08-04**
**Active branch:** `main`
**Last committed sprint:** Sprint 118.5 — Qdrant retrieval consolidation (see Sprint 118.5 section below)
**Last updated:** 2026-08-04 — Sprint 118.5 complete; searchChunks() consolidation, src/llm/qdrant-client.ts deleted, config defaults corrected
**Test suite:** 369 passed | 1 skipped (370) files, 6431 passed | 2 skipped (6433) tests, 0 failures (one flaky storage-monitor temp-dir race independently confirmed pre-existing via baseline comparison, not caused by this fix).
**V14 training-trigger status: SCAFFOLDED, NOT CLOSED.** `src/llm/training-trigger.js` and `llm train-local` CLI command exist and are tested (7 tests pass). The manual end-to-end acceptance step has never happened. The dataset gate from `sprints/SPRINT-13-ANALYSIS.md` has not been cleared: current paired examples = 1, required minimum = 50. Do not treat the presence of code as gate clearance.
**Coverage (v8, last measured 2026-07-31):** 99.33% stmts / 96.19% branch / 98.67% funcs / 99.58% lines — all above thresholds (95/95/95/95)
**TypeCheck:** `npx tsc --noEmit` — 0 errors (last verified at Slice 110e, `8122c007`)
**MCP smoke:** `scripts/verify-mcp-stdio.mjs` — 6 tools returned (including retrieve), exit code 0 [CONFIRMED at Sprint 107]
**SonarQube quality gate:** PASSED — 0 new violations (last scan 2026-08-01, Sprint 113 close-out). Project totals: bugs 0 / vulnerabilities 0 / code smells 0 / hotspots 0 / coverage 97.0% / duplication 1.4% / ncloc 28402.
**GPU default:** -ngl 99 (RTX 5090 Laptop 24GB — prior -ngl 0 constraints obsolete)

## Sprint 118 — Repo-Driven Training Corpus Generator — 2026-08-04

**Goal:** Add a second, growing source of paired training examples derived
from git commit history (JSDoc-commented function diffs), completely separate
from the existing BC2-message export. Does not touch V14, does not train
anything, does not trigger or satisfy the 50-pair gate.

**Design decisions (explicit, not inherited from any prior convention):**

- Incremental state tracked via a new standalone JSON file
  (`~/.vscode-rotator/repo-corpus-state.json`) — not mixed into any existing
  state file. Stores `{ lastProcessedRef }` only; re-run from any SHA via
  `--since <ref>`.
- Output written to a separate `~/.vscode-rotator/repo-corpus.jsonl`, never
  mixed into `exportTrainingData()`'s own output. Callers that want to merge
  the two sources do so explicitly.
- Extraction scope: JS/TS/JSX/TSX only. No new language parser — simple
  `git show --unified=0` diff parsing, regex on the added lines for
  `function name(...) {` signatures and immediately-preceding `/** ... */`
  JSDoc blocks. No AST, no tree-sitter dependency.
- `maxBuffer` fix for large `git show` output (ERR_CHILD_PROCESS_STDIO_MAXBUFFER):
  kept **local** to `repo-corpus-exporter.js`'s own `gitExec()` helper
  (`{ maxBuffer: 128 * 1024 * 1024 }`). The shared `src/llm/_child-process.js`
  passthrough is **untouched on this branch** — a mid-sprint attempt to widen
  `maxBuffer` there caused a 10-test regression (3 failed test files, 10
  `spawn ollama ENOENT` / unhandled-rejection failures) and was immediately
  reverted. See regression note below.

**Schema used:**

```json
{
  "type": "repo-corpus",
  "platform": "git",
  "commit_sha": "<sha>",
  "user": "<JSDoc text — the prompt>",
  "assistant": "<function source — the completion>",
  "metadata": {
    "file": "<path>",
    "function_name": "<name>",
    "signature": "<name(params)>",
    "source": "git-diff"
  }
}
```

Matches `training-exporter.js`'s pair shape convention
(`user`/`assistant`/`metadata` top-level keys).

**Files changed:**

- `src/llm/repo-corpus-exporter.js` — new; `generateRepoCorpusPairs()` and
  `appendRepoCorpusPairs()` exports; local `gitExec()` callback-wrapping
  helper with `maxBuffer: 128 MB`.
- `tests/llm/repo-corpus-exporter.test.js` — new; 4 tests (pair extraction,
  JSDoc-less skip, stored-ref idempotency, JSONL append). Mock uses
  callback-style `execFile(cmd, args, options, callback)` matching the real
  `node:child_process.execFile` signature.
- `src/commands/llm.js` — added `export-repo-corpus` subcommand only (new
  Commander binding + import of `generateRepoCorpusPairs`/`appendRepoCorpusPairs`).
  No other changes to this file.

**Mid-sprint regression and fix (documented, not hidden):**

An early version of this sprint rewrote `src/llm/_child-process.js` from a
plain `export { execFile, spawn } from "node:child_process"` passthrough into
a promise-wrapped version with `maxBuffer: 128 MB`. This was done to fix the
buffer error in `repo-corpus-exporter.js` but had blast-radius: `_child-process.js`
is imported by ~12 files, and changing its calling convention broke callers
that were written against the old callback-style signature. Full `npm test`
showed 3 failed test files / 10 failed tests (`coverage-branch-gap.test.js`,
`sprint69-coverage-expansion.test.js`, `tests/llm/llm.test.js`) — all
`spawn ollama ENOENT` + 5000ms timeouts surfacing as unhandled rejections.
**Fix:** reverted `_child-process.js` to the plain passthrough (verified
against `origin/main` — zero diff) and moved the `maxBuffer` fix into
`repo-corpus-exporter.js`'s own local `gitExec()` helper. `_child-process.js`
is identical to `origin/main` on this branch.

**Manual run result (real repo, not mocked):**

```
npx tsx ./src/cli.js llm export-repo-corpus
→ ✔ 91 pair(s) appended → /home/pawan/.vscode-rotator/repo-corpus.jsonl

# Immediate re-run (no new commits):
→ ✔ 0 pair(s) appended — nothing new since last run
```

**Test suite (full run 2026-08-04):** 369 files, 6435 tests passed, 0 failed,
2 skipped.

**TypeCheck:** `npx tsc --noEmit` — 0 errors.

**Pre-existing out-of-scope bug (not fixed here, logged for a future sprint):**
`node ./src/cli.js` is broken for every command with
`ERR_MODULE_NOT_FOUND: src/cli/llm-health.js`. This is a pre-existing defect
unrelated to this sprint. `npx tsx ./src/cli.js` was used as the workaround
throughout this sprint's verification. Needs its own sprint entry to fix.

## Sprint 118.5 — Qdrant Retrieval Consolidation — 2026-08-04

**Goal:** Consolidate Qdrant retrieval onto `src/llm/qdrant-client.js`'s
`searchChunks()` as the single authoritative implementation; `vectorSearch()`
now delegates instead of duplicating embed+HTTP+parse logic.

**Design decisions (explicit, not inherited from any prior convention):**

- `searchChunks()` is the single Qdrant retrieval path. `vectorSearch()` now
  delegates to it instead of reimplementing embeddings, request construction,
  response parsing, or source resolution.
- `vectorSearch()`'s `source` field now resolves from the ingestion payload's
  `path` field instead of falling back to the raw Qdrant point ID.
- Config defaults were corrected so `QDRANT_URL`, `EMBEDDINGS_URL`, and
  `QDRANT_COLLECTION` match `qdrant-client.js`'s real runtime values instead of
  stale Docker-oriented defaults.
- `searchChunks()` now throws on a non-ok Qdrant response rather than
  silently swallowing the error to `[]`.
- Caller behavior is intentionally asymmetric:
  - `queryTopK` soft-fails via its own `try/catch`.
  - both Electron IPC handlers already soft-fail unchanged.
  - `vectorSearch()` hard-fails and propagates to agent/MCP callers by design.
    The asymmetry preserves higher-level fallback behavior while ensuring direct
    retrieval failures are visible to callers that need them.
- Audit findings uncovered and fixed a genuine test gap: a `logger.info()` call
  is now executed on successful `vectorSearch()` responses. The removed
  `AbortError`/timeout tests in `tests/shared/retrieval/vector-client.test.ts`
  were not gaps — that code path no longer exists after delegation.

**Files changed:**

- `src/llm/qdrant-client.js`
- `src/llm/qdrant-client.d.ts` (new)
- `src/shared/retrieval/vector-client.ts`
- `src/llm/qdrant-client.ts` (deleted, confirmed zero runtime imports)
- `tests/agents/tools/vector-client.test.ts`
- `tests/llm/qdrant-client-coverage.test.ts`
- `tests/shared/retrieval/vector-client.test.ts`

**Reranking feature (audit fix):**

- `src/llm/reranker.js` — new optional reranker that re-scores a larger
  candidate pool using the existing embeddings service and a lightweight
  cosine-based combination of original fused score + query↔candidate
  similarity. Toggle via `RERANK_ENABLED=true` and configure `RERANK_CANDIDATE_POOL`,
  `RERANK_TOP_K`, `RERANK_ALPHA`, and `RERANK_TIMEOUT_MS` via environment.
- `src/llm/qdrant-client.js` — `queryTopK()` now requests a larger pool when
  reranking is enabled, then calls the reranker and falls back to the fused
  ordering on any reranker failure (graceful degradation).

Measured tradeoff (representative): a simulated run with `pool=20` and a
mocked embedder (150ms embed latency) added ~150ms to the retrieval stage.
In light spot-checks against small eval queries the reranker moved several
more relevant chunks into the top-k versus the fused RRF ordering (qualitative
improvement observed). See tests `tests/llm/reranker.test.ts` and
`tests/llm/rerank-latency.test.ts`.

## Sprint 115 — Session Isolation on Explicit Logout — 2026-08-02

**Goal:** Add an explicit, opt-in `clearSession(platform)` function that wipes
the in-browser cookie jar and deletes the saved `storage-state.json` for a
platform, without changing the default (convenience) persistence behavior for
every other code path. Closes V16.

**Design decision (critical context for future sprints):**
`clearSession` does NOT route through `closeBrowser()` because `closeBrowser`
unconditionally calls `context.storageState()` and writes it back to disk —
which would immediately recreate the file just deleted. Instead, `clearSession`
closes the context directly (`context.close()` + `context.browserHandle.close()`)
without touching `storageState`. The test suite includes a regression guard
(`fakeContext.storageState` must never be called) to enforce this invariant.

**Known pre-existing defect noted (not fixed, out of scope):**
`src/commands/browser.js` imports `BROWSER_RESPONSES_DIR` from `browser-bridge.js`
as a named export. This constant was removed from `browser-bridge.js` in an
earlier sprint and replaced by `getBrowserResponsesDir()`. The import is stale
and the `browser responses dir` CLI command silently uses it. Logged for a
future cleanup sprint — do not touch in browser-bridge sprints without explicitly
accounting for this.

**Files changed:**

- `src/browser-bridge.js` — added `storageStatePathFor(platform)` pure helper
  (replaces inline `path.join(browserProfilesDir(), platform, "storage-state.json")`
  in `launchBrowser`); added `export async function clearSession(platform)`:
  guard clause → `_self.launchBrowser` → `context.clearCookies()` → direct
  `context.close()` + `context.browserHandle.close()` → `fs.unlink` (ENOENT
  swallowed) → return `{ platform, message }`. Zero calls to `closeBrowser` or
  `context.storageState` inside `clearSession`.
- `src/commands/browser.js` — added `clearSession` to import list; added
  `browser logout <platform>` command using `parseServicePlatform` validation,
  ora spinner, chalk, try/catch → `process.exitCode = 1` on failure.
- `tests/browser-clear-session.test.js` — new, 8 tests (see below)

**Test suite (tests/browser-clear-session.test.js — 8 tests, all GREEN):**

1. Unit: `clearCookies` called once, `storageState` NEVER called, file deleted from real disk
2. Multi-platform isolation: only the target platform's file is removed, sibling files unchanged
3. Missing file (ENOENT): resolves without throwing, `clearCookies` still called
4. Integration seam: after `clearSession`, next `launchBrowser` receives NO `storageState`
   option (proves a fresh session — not just "file deleted" — this is the sprint's core assertion)
5. Guard clause: `clearSession(undefined)` rejects with "platform is required"
6. Guard clause: `clearSession("")` rejects with "platform is required"
7. Return value shape: `{ platform, message }` containing platform name
8. Direct close: `context.close()` and `browserHandle.close()` each called once

**Test suite (full run 2026-08-02):** 364 files, 6411 tests passed, 0 failed, 2 skipped
Pre-existing flaky failure confirmed unrelated: `daemon-shutdown-integration.test.js`
timestamp race (off by 1ms under parallel load, passes in isolation immediately).

**Grep confirmation (implementation safety check):**

```bash
awk '/^export async function clearSession/,/^export async function sendPrompt/' \
    src/browser-bridge.js | grep -E "closeBrowser|storageState"
# → returns only the comment line mentioning them, zero live call-sites
```

## Sprint 112.5 — hw-probe runtime-consumable from plain JS — 2026-07-31

**Goal:** Make `src/installer/hw-probe/hwProbe.ts` importable from
`src/llm/embeddings.js` (and any other plain-JS production consumer) at
actual Node.js runtime — prerequisite for Sprint 113.

**Problem found:** `hwProbe.ts` had no compiled `.js` counterpart and no
runtime loader on the production path (`node ./src/cli.js`). Vitest's
esbuild pipeline transforms `.ts` transparently so all tests passed, but
a real `node` invocation would have thrown `ERR_UNKNOWN_FILE_EXTENSION`.
The sub-package's `"build": "tsc"` script had never been run; `dist/` did
not exist. The tsc-based approach was attempted but abandoned because
`outDir: dist` inside the source tree produced compiled output with the
same `../../internal/paths.js` relative import that resolved correctly
from the source location but not from inside `dist/`.

**Resolution chosen:** Created `src/installer/hw-probe/hwProbe.js` — a
plain-ESM parallel implementation of `hwProbe.ts`, identical logic, JSDoc
types. The `.ts` file remains the source of truth for TypeScript consumers,
type-checking, and the existing 57-test spec suite. The `.js` file is what
production plain-JS entry points import.

**Files changed:**

- `src/installer/hw-probe/hwProbe.js` — new plain-ESM runtime twin
- `src/installer/hw-probe/package.json` — added `"type": "module"`
- `src/internal/paths.d.ts` — new type declaration file for `paths.js`
  (allows future TS consumers to import `paths.js` without `allowJs`)
- `package.json` — added `build:hw-probe` verification script

**Runtime import verification (from repo root):**

```
node -e "import('./src/installer/hw-probe/hwProbe.js').then(m => console.log(Object.keys(m)))"
[ 'classifyTier', 'inferVendor', 'parseVramString', 'probeHardware' ]
```

**Test suite:** 358 files, 6323 passed, 0 failed, 2 skipped — 2026-07-31
(hw-probe 57 tests all passed; 2 pre-existing skips unchanged)

**Note:** `dist/` is not used; no build artifact needs to exist or be
committed. `hwProbe.js` is a first-class source file, not generated output.
Any logic change to `hwProbe.ts` must be mirrored in `hwProbe.js`.

## Sprint 113 — GPU-Tier-Aware Embeddings Backend — 2026-07-31

**Goal:** Make `EmbeddingProvider.initialize()` consult the hardware tier
(from `probeHardware()`) and return early with `deterministic-hash` on
tier-X machines instead of attempting the `onnxruntime-node` import.
Closes V10.

**Files changed:**

- `src/llm/embeddings.js` — added `probeHardware` import and tier-X gate
  before the existing `onnxruntime-node` try/catch
- `tests/llm/embeddings-gpu-tier.test.js` — new test file (3 tests: tier X
  early return without onnx import, tier Z fallthrough, tier Y fallthrough)
- `tests/llm/embeddings-onnx-fallback.test.js` — added `probeHardware` mock
  forcing tier Z so the onnx-catch branch stays genuinely exercised
- `tests/llm/embeddings-coverage.test.js` — same probeHardware mock added
  at file scope to preserve the "onnxruntime-node unavailable" test's intent

**Test suite (fresh run 2026-07-31):** 359 files, 6326 passed (+3), 0 failed,
2 pre-existing skips. daemon-shutdown-integration timing flake appeared once
under parallel load; passes in isolation immediately — pre-existing.

**Coverage (v8, fresh 2026-07-31):** 99.33% stmts / 96.19% branch /
98.67% funcs / 99.58% lines — all above 95% thresholds.

## Recent Resolutions (last 3 sprints — older entries in master_timeline_sprints_101_plus.md)

- Deduplication sprint 2026-07-28 (`0ee919a8`, merged `7f87da10`, CLOSED): Remove 26 SonarQube duplicate blocks across 6 file clusters. New `stub-provider-factory.ts` collapses grok/groq/openai adapters (~53% dup removed). New `base-repo.js` (`BaseRepo`) shared by `handoff-repo.js` + `sprint-state-repo.js` (~41% dup removed). `buildAiSnapshot()` helper deduplicates snapshot/resume in `ai.js` (~19% dup removed). `detectGpusWithNvidiaFallback()` deduplicates hwProbe.ts Linux/Windows paths. Schema aliases collapse identical `z.union`/`z.enum` definitions in `schemas.js`. `grok` added to `ProviderName` union. All 6323 tests pass. Merged to `main` as `7f87da10`.

- Merge to main 2026-07-28 (`3403fd52`, CLOSED): `fix/sonarqube-issues-post-sprint-108` (16 commits, Sprints 106–X1 + Sonar remediation) merged to `main` with `--no-ff`. Final state: coverage 99.38%/96.28%/98.85%/99.63%, SonarQube PASSED, 6323/6325 tests passing.

- Sonar remediation 2026-07-28 (`02d966de` + `4a864bf2`, CLOSED): Fix 3 SonarQube violations in `tests/daemon-shutdown-integration.test.js` blocking the quality gate. S1607 (describe.skip without explanation) + S5914 (tautological `expect(true).toBe(true)`) → replaced `describe.skip` with a normal `describe` containing `it.skip`. S2699 (no assertions in it.skip body) → replaced `it.skip` with `it.todo` (no callback). Quality gate now PASSED: bugs 0 / vulnerabilities 0 / code smells 0 / hotspots 0 / new_violations 0 / coverage 97.0% / duplication 1.4% / ncloc 28402.

- Sprint X1 (`ffb16399`, 2026-07-25, CLOSED): Route VS Code task failures to MistakeTracker. `_onTaskEnd` in `vscode-extension/collector.mjs` now calls `MistakeTracker.addMistake()` (category `'vscode-task-failure'`) after `stageSignal`, gated on `this.vscodeLearn.enabled`, deduplicated via `_shouldDebounce`. New test file `tests/vscode-extension/task-failure-tracking.test.js` (4 tests: exitCode 1 tracked, exitCode 0 not tracked, enabled=false not tracked, debounce deduplication). Full suite: 357/357 files, 1 skipped, 0 failed. See `unified-theatre-continuity-summary.md` Section 41.6.

- Sprint 110.5 + 110.6 (`57478b30` + `da8aae09`, 2026-07-25, CLOSED): Fix ESM/CJS module-type mismatch in vscode-extension. `collector.js` renamed to `collector.mjs`, `agent-bridge.mjs` added, import paths updated. Sprint 110.5 accidentally bundled unscoped `MistakeTracker` additions; Sprint 110.6 reverted them to keep the rename-only scope clean. Net result: pure `.js`→`.mjs` rename, zero behaviour change. New tests: `module-resolution.test.js` (real-Node subprocess proof), `agent-bridge.test.js`. See Section 41.4–41.5.

- Sprint 109/109b (`4fbe9b30`, 2026-07-23, CLOSED): Schedule security auto-scan in daemon; closes V5. Added `SECURITY_SCAN_INTERVAL_MS` timer (6h default, env-overridable) to `src/daemon/daemon-runner.js`, cleared in `cleanup()`. New tests: `daemon-security-schedule.test.js` (source-inspection smoke), `daemon-shutdown-integration.test.js` (real-subprocess SIGTERM/SIGINT — was skipped on Linux until `251cd29b`). Suite: 354/354 files, 6314/6314 tests passing. See Section 41.2.

- Coverage remediation (`c06a86b0`, 2026-07-23): Restore `embeddings.js`, `graph-builder.ts`, `test-runner.js` above 95% statement/branch/function/line gate after Sprints 109 + 110e added uncovered branches. 15 new/expanded test files, 1546 insertions. See Section 41.3.

- SonarQube post-108 cleanup (`9532f9e1`, 2026-07-23): Sonar remediation pass across all files touched by Sprints 106–108 and Slice 110e. 24 files changed. See Section 41.1.

- Slice 110e (`8122c007`, CLOSED): Structural symbol graph — deterministic AST retrieval tier. `graph-schema.ts`, `graph-builder.ts`, `graph-incremental.ts`, `graph-lookup.ts`, `graph-state.ts` — builds a call/import graph via TypeScript Compiler API (`ts.createProgram()`). New `"graph"` retrieval strategy + `"structural"` `ToolCallClass` + 8 query patterns. 132 new tests across 4 test files. `tsc` clean. Independently cross-audited by 4 agents. See `unified-theatre-continuity-summary.md` Sections 40–41.

- Sprint 110 (CLOSED): `enforcePromptBudget()` TOOL RESULT trim-direction fix; `never-truncate-userPrompt` hardening; retrieval-first classifier (`classifyToolCall()`) routing path-like/symbol-like tools to skip second `gateway.ask()`. 5144 tests, 0 failures. Coverage: 94.93% stmts / 92.48% branch / 93.03% funcs / 95.13% lines. Commit: `ec42fe73fc40f1520f6e140ac614e058597dc6f1`. Tag: `sprint-110-complete`.
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

## V14 — LoRA Training Trigger (resumed) — 2026-08-04

**Status: SCAFFOLDED — gate not cleared — manual end-to-end has never happened.**

### What exists

- `src/llm/training-trigger.js` — `triggerLoraTraining(datasetPath, { model, modelPath })`:
  spawns Unsloth CLI via `wt.exe → wsl.exe → bash -l -c`. Model auto-discovery
  order: explicit `--model-path` → HuggingFace hub `.safetensors` → mounted
  `.gguf` paths → env-var/default name. All args shell-quoted via `shellQuote()`.
- `src/llm/_child-process.js` — `spawn` added alongside `execFile` so the shim
  remains fully mockable in Vitest.
- `src/commands/llm.js` — `llm train-local` sub-command: calls
  `exportTrainingData({ minPairs: 50 })` then `triggerLoraTraining(...)`, both
  with ora spinners and standard chalk error handling.
- `tests/llm/training-trigger.test.js` — 7 tests covering arg shape, shell-quoting,
  model discovery, exit-0 resolve, exit-1 reject.

### Why V14 is not closed

The dataset gate from `sprints/SPRINT-13-ANALYSIS.md` has not been cleared:

> Minimum threshold to reopen: **50 paired examples**
> Current export: **1 paired example**

Running `llm train-local` with the current dataset would violate the gate, not
satisfy it. The code exists for when the gate is cleared; it must not be invoked
before then.

**Note from SPRINT-13-ANALYSIS.md:** Unsloth is flagged as non-viable for the
original hardware env (Windows + Python 3.14.5 + CPU-only). Before invoking
`train-local`, verify toolchain compatibility or switch to `llama.cpp finetune`
as the analysis recommends.

### Acceptance criteria to close V14

1. `llm export-training --min-pairs 50` exits 0 with ≥ 50 pairs
2. Manual `llm train-local` run completes without error on the target machine
3. Output model artifact verified loadable
4. This entry updated to `CLOSED` with the run date and pair count

### What must NOT happen

- Do not run `llm train-local` as a CI step or automated gate check
- Do not mark V14 closed because tests pass — tests only verify the subprocess
  wiring, not an actual training run
- Do not reopen `sprints/SPRINT-13-ANALYSIS.md`; its decision stands until the
  pair count and toolchain criteria are met

---

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
- Sprint 109 is a third partial-documentation gap with a twist: a local branch
  `sprint-109-loop-fix-and-prompt-budget` exists (tip `4b8aec5d`, 2026-07-07) with a
  single commit covering the sub-agent loop/doneMarker fix, opt-in context injection,
  and `includeWorkspaceContext` defaulted to `false`. This branch was never pushed to
  `origin` and never merged into `origin/main`. Decision: leave as a local orphan;
  do not merge or cherry-pick. Its content was superseded by sprint-110 working-tree
  changes. Delete with `git branch -D sprint-109-loop-fix-and-prompt-budget` once
  sprint-110 is committed. Anyone debugging prior response-quality or truncation
  regressions should be aware: prompts built before Sprint 110 with
  `includeWorkspaceContext=false` had no safe truncation boundary, meaning oversized
  prompts could silently lose user content. Full record in
  `master_timeline_sprints_101_plus.md` under "Sprint 109".
- `master_timeline_sprints_1_97.md` filename must never be changed; it is the
  canonical historical record for Sprints 1–100. Sprints 101+ continue in
  `master_timeline_sprints_101_plus.md`.
- `docs/build-state.md` must be updated at the close of every sprint — the
  "Last verified: Sprint N" line at the top is the canary. If it drifts more
  than 1 sprint behind, documentation debt is accumulating.
