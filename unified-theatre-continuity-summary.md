# Unified Theatre — Continuity Summary

_Read this first if you're an agent (Claude, Copilot, or otherwise) picking up this project. It exists to prevent context loss across sessions and across different tools/providers working on the same repo._

> **Last updated 2026-07-14 (updated again same day — see Section 29).** Section 26 documents the live-verified rollout audit of Slices 110a–110e (110a/110b/110c/110d confirmed **Done**, 110e confirmed **Not started**). Section 29 documents four follow-up fixes closed the same day (harness runner, dotenv loading, index:symbols script, repository_id scoping) — all committed and pushed. Section 30 supersedes Section 27's open-items list; Section 31 supersedes Section 28's handoff.
>
> _(Prior pointer, retained for history: Last updated 2026-07-10 — see Section 9 for that session's detail, measurement-log root-cause fix, source tagging, automated weekly checkpoint — committed and pushed as `51b648dd`.)_

**This file is now tracked in git at the repo root** (`unified-theatre-continuity-summary.md`) — pull the latest `main` to get the current version rather than relying on a copy pasted into a chat session. If you update this doc, commit and push it like any other change, following the same verification discipline as code.

**Repo:** `~/vscodeagent/Solution` on Linux (Ubuntu 22.04)
**Stack:** TypeScript/JavaScript, Vitest (V8 coverage), Postgres (`pg` package)
**Purpose:** "Unified Theatre" — a governance, security, and audit platform with an agentic MCP tool layer.

---

## 1. Working Conventions (established over many sessions — follow these)

- **Verification standard:** literal pasted command output is required. Summaries, narrated confirmations, or "should be fine" are never accepted as proof of completion. This has repeatedly caught real bugs and real inaccurate claims that would otherwise have shipped or gone unnoticed.
- **Confident-wrong vs. honest-unknown:** any output surfaced by an MCP tool, the retrieval router, or an analysis/checkpoint script must make "not found / not measured / not yet enough data" structurally distinguishable from a real result — never a bare `0`, empty default, or blended aggregate standing in for "we don't know yet." When this is found violated, it is a bug of the same severity as the measurement-log root-cause bug in Section 9, and gets a pinned regression test in the same commit as the fix, not a follow-up item.
- **Small-slice discipline:** one file/fact/change per step, verified before moving to the next. Sprawling multi-file changes are avoided. A fix that touches several files but is one coherent logical change (e.g. an implementation + its test + its config) can still be one commit — "small slice" means verified and coherent, not literally one file.
- **Test location:** tests live in `tests/`, not colocated with source — imports use `../src/` prefixes. (Exception: the self-contained `src/installer/hw-probe/` sub-project colocates its spec file — see Section 2.)
- **Commit discipline:** small, fully-verified changes may go directly to `main`. Larger or multi-sprint work goes through a feature branch, gets a full merge-readiness audit (clean tree, zero conflicts, clean typecheck, full test pass — verified _again_ on `main` post-merge), then merges with `--no-ff` so the boundary is visible in history.
- **Tagging:** every completed sprint gets a tag, typically `sprint-N-complete`. **Tag names don't always match branch names exactly** — always check `git tag -l` for the real name rather than assuming a pattern.
- **Branch deletion safety:** use `git branch -d` (safe, refuses if unmerged) by default; only use `-D` after explicitly confirming a tag preserves the commit's history, since `-d` refusing is a legitimate signal, not just an obstacle.
- **`pg` import pattern:** `import pg from "pg"; const { Pool } = pg;` — default import required for ESM compatibility; named `{ Pool }` import crashes the MCP server.
- **Vitest + ESM mocking gotchas:**
  - `vi.unmock` approaches are unreliable under Vitest's ESM hoisting — use `vi.importActual` instead.
  - Named imports for `node:fs/promises` and `node:child_process` (not namespace imports) are required for Vitest to actually intercept them.
  - **`node:fs` mocks must provide BOTH the named exports AND a `default` object mirroring them** (`{ readFileSync, readdirSync, default: { readFileSync, readdirSync } }`) — a mock with only named exports throws `No "default" export is defined on the "node:fs" mock` when anything in the import chain relies on CJS/ESM default-interop. Same shape already used for the `pg` mock (`{ default: { Pool: MockPool } }`) — this is the established repo-wide pattern for any core Node module mock, not just `pg`.
  - `pg.Pool` must be mocked as a real ES class (`class MockPool { constructor() {...} }`), not a factory function — `new Pool(...)` requires a real constructor.
  - `vi.fn(() => X)` vs `vi.fn().mockReturnValue(X)`: the former bakes `X` in as a persistent default implementation that **survives `mockReset()`**; the latter does not. Know the difference when debugging why a mock "still works" after a reset.
- **`sed -i '<range>d'` is dangerous for removing duplicated blocks — confirm exact current line numbers with a fresh `grep -n` or `view` immediately before deleting, never reuse line numbers from an earlier `grep`/`view` call.** One session lost an entire `vi.mock("pg", ...)` block this way (see Section 4, bug #7) because a stale line range from an earlier command overshot into the adjacent, unrelated block above it. When in doubt, overwrite the whole file via heredoc (`cat > file << 'EOF'`) instead of a line-range patch — full-file overwrite has no ambiguity about what's currently at which line.
- **A self-contained sub-project with its own `vitest.config.ts` + `package.json` (e.g. `src/installer/hw-probe/`) is treated by Vitest v4 as a project boundary that default file discovery does NOT cross, regardless of the root config's `include` glob.** `npx vitest list` may still show that sub-project's tests (its discovery walk differs from `run`'s execution), which can create a false impression that the root suite already covers it. The actual fix is an explicit `projects` array in the root `vitest.config.ts` (e.g. `projects: [".", "src/installer/hw-probe"]`) — an `include` glob edit alone does nothing here. **Always confirm with a fresh file-count/test-count diff from a plain `npx vitest run`** (not `vitest list`, not a targeted `vitest run --coverage <subpath>`) before and after any change intended to fold a sub-project into the main suite. This exact gap was found, root-caused, and fixed this session — see Section 3 (commit `69ed89f5`) and Section 8.4 for the full diagnostic trail.
- **A heredoc-based `git commit -F-` (or `-m` with a long multi-line string) can appear visually truncated or interleaved in the terminal echo/paste, especially when the heredoc is long.** This is cosmetic, not a real problem — always confirm the actual stored message with `git log -1 --format="%B"` rather than trusting how the terminal echoed it back.

---

## 2. Architecture Notes

### MCP tool layer

Six tools exposed to external MCP clients (GitHub Copilot, Codex, etc.): `vector-search`, `search-code`, `retrieve`, `ask-local`, `code-review`, `list-tools`. Individual tool implementations live in `src/agents/tools/`, each following the pattern:

```ts
export const xTool: Tool = {
  name: "x",
  description: "...",
  async execute(args) { ... }
};
```

This is an **object literal with a method**, not a class — matters for any tooling (like the symbol extractor) that walks the AST.

### Retrieval strategy

`RetrievalStrategy = "code" | "vector" | "file" | "symbol"` (defined in `src/shared/retrieval/router.ts`). The `retrieve()` function dispatches to `findSymbolDefinition()`, ripgrep-based code search, vector search, or raw file read based on `chooseStrategy()`. `RetrieveResult.strategy` correctly references `RetrievalStrategy` by type name, not an independently-spelled duplicate — TypeScript's exhaustiveness checks are genuinely load-bearing here, not coincidental.

### Tool-call classification (cost optimization)

`src/agents/tool-call-classifier.ts` classifies each tool call as `path-like`, `symbol-like`, `semantic`, or `synthesis`. Path-like/symbol-like calls skip a second, redundant `gateway.ask()` LLM call (`skipGatewayAsk`). `vector-search` and natural-language `search-code` always pay for the second call. `retrieve` now participates in this classification too (previously always fell to `synthesis` — see Section 3, commit `d57b9f56`).

### Symbols table (Sprint 110b)

- Schema: `src/storage/code-index-migrations/001_symbols_table.sql` — `symbols(id, repository_id, file_path, name, kind, start_line, end_line, signature, indexed_at)`.
- `src/storage/run-migrations.ts` — applies every `.sql` file in the migrations directory, in filename order, inside one transaction. **Migration tracking is fully idempotent via a `schema_migrations` table** (filename PK + applied_at) — see Section 3, commit `237b6a43`. Re-running is a safe no-op for already-applied files; only genuinely new migration files get applied.
  - Any pre-existing database that had `001_symbols_table.sql` applied before commit `237b6a43` needs a one-time manual backfill — see Section 3 for the exact SQL. **This backfill has already been performed** against the local dev Postgres used throughout this project's sessions (Docker container `qwen-postgres`, `DATABASE_URL=postgresql://unified:postgres_CHANGE_ME@localhost:5432/unified_theatre`, `DATABASE_URL` now also present in the repo's local, gitignored `.env`) — confirmed via two consecutive clean idempotent runs.
- `src/shared/retrieval/repository-id.ts` — deterministic UUID-v5-shaped ID derived via SHA-1 hash of `PROJECT_ROOT`. Same path always yields the same ID; no config or manual assignment needed. Explicitly _not_ reusing the pre-existing `workspaceId` concept — that's a distinct, unrelated identity used throughout governance/policy/session code, not "which codebase is this."
- `src/storage/symbol-extractor.ts` — walks `src/` for `.ts/.tsx/.js/.jsx` (excluding `node_modules`, `.venv`, `dist`, `build`, `.cache`, `dist_electron`, `.git`, `coverage`, `src/coverage/ts/**`, test/spec files, `.d.ts` files), parses each file with the TypeScript compiler API (`ts.createSourceFile`), and extracts: top-level functions/classes/interfaces/types/enums, class methods, object-literal method-shorthand properties (the `Tool` pattern above — dotted as `VarName.methodName`), and `export default <identifier>` resolution (falls back to finding the identifier's real top-level declaration elsewhere in the file). **Deduplication is position-based** (`node.getStart():node.getEnd()`), not name+kind — see bug #3 in Section 4.
- `src/storage/symbol-indexer.ts` — `indexSymbols()` does a transactional delete-then-insert per `repository_id` (not upsert — simplest correct approach given no stable per-symbol ID exists yet). **Inserts are now batched** (see Section 3, commit `525064b0`): `INSERT_CHUNK_SIZE = 500` rows / 3500 params per batch (well under Postgres's 65 535 bound-parameter limit) instead of one `INSERT` per symbol. Placeholder indices are chunk-local, confirmed via direct diff review to have no bleed-through across batch boundaries. Same transaction/rollback semantics and return shape preserved. Verified against a live Postgres (189 files, 1322 symbols → 3 batched `INSERT`s of 500/500/322, row counts and sample rows confirmed before/after).
- Originally verified end-to-end against a live local Postgres in Sprint 110b: 187 files walked, 1306 symbols inserted, `findSymbolDefinition("findSymbolDefinition")` correctly found itself.

### Codebase has two coexisting layers — important, easy to miss

- **A legacy/production JS layer rooted at `src/cli.js`** — this is `package.json`'s actual `"main"` entry point (`"main": "./src/cli.js"`), not a leftover. Contains ~88 real application files (`llm/inference.js`, `ai-memory/repositories/*.js`, `accounts/*.js`, `daemon/*.js`, `commands/*.js`, `browser-adapters/*.js`, etc.).
- **A newer TypeScript subsystem** — `src/agents/`, `src/shared/retrieval/`, `src/memory/`, `src/mcp/`, `src/governance/`, `src/policies/`, `src/security/`, etc. Cross-references exist between the two layers (confirmed: `commands/llm.js` imports from `llm/inference.js`).
- Any tooling that walks "the codebase" (like the symbol extractor) must cover **both** `.ts/.tsx` and `.js/.jsx` under `src/`, or it silently misses roughly half the real source.
- `src/installer/hw-probe/` is a **self-contained embedded sub-project** (own `package.json`, `tsconfig.json`, `node_modules`, `vitest.config.ts`) — correctly excluded from the symbol-extractor's main walk by directory-name matching (`node_modules` exclusion fires regardless of nesting depth — verified). Its tests now run under the root `npx vitest run` too — see the `hw-probe` entry below and Section 3, commit `69ed89f5`.

### Known pre-existing flaky tests (confirmed via repeated runs and `git stash` comparison, not caused by any session's work)

- `tests/sprint85-guard.test.js` — wraps a live `npx tsc --noEmit` subprocess call in a hardcoded 5000ms timeout. Runs in ~650–800ms in isolation; occasionally creeps past 5s under full-suite parallel load.
- `tests/storage/storage-monitor.test.js` — a `setTimeout(2500)`-based race between an async file write and an immediate read. Same story: timing-sensitive under load, not logic-broken.
- `tests/shared/retrieval/code-search.test.ts` — intermittent "No pending execFile call in queue" failure in the `execFile` mock queue. Same symptom previously seen and traced to a stale Vite/transform cache during the `handleRgError` extraction (Section 25.4, commit `873e1418`); reproduced again 2026-07-14 with zero code changes between a failing and passing run, confirming it's cache/timing-related, not logic-broken.
- All three confirmed to pass consistently in isolation and across repeated full-suite runs. If any fails again, it's very likely one of these same pre-existing patterns, not new breakage — but verify via repeat-run, `git stash` comparison, or (for the third) a cache-clear rather than assuming.

### Measurement logging (Option A instrumentation)

- `src/agents/tool-call-measurement-log.ts` — `recordToolCallForMeasurement()`, called once at the single real `tool.execute()` call site in `src/agents/sub-agent.ts`. Writes `{toolName, args, classification, skippedGatewayAsk, timestamp}` to `tool-call-measurement-log.json` in the app's data dir (`~/.unified-ai-workspace/` by default). Best-effort — wrapped in try/catch, can never throw outward, so a logging failure can never break a real tool call. Bounded to last 2000 entries.
- **Purpose:** the sub-agent loop pays for a redundant second `gateway.ask()` call on `vector-search` and natural-language `search-code` calls. Whether it's worth extending the fast-path skip to these categories depends on real usage distribution — which did not previously exist anywhere in the codebase (confirmed: neither `audit-log.ts` nor `routing-history.ts` captures this). This logging exists specifically to gather that real data going forward.
- **Do not attempt to synthesize or reconstruct this data.** An earlier attempt to "measure" classifier distribution accidentally ran against the classifier's own exhaustive unit tests instead of real usage, producing meaningless numbers. Wait for real accumulated entries — still the only genuinely open item as of this summary (see Section 6).

### `hw-probe` sub-project — hardware detection (fixed and merged this session — commit `69ed89f5`)

- `src/installer/hw-probe/hwProbe.ts` — probes CPU/RAM/GPU and classifies the machine into tier Z (≥20GB VRAM, 70B+ models viable) / Y (8–19GB, 32B viable) / X (<8GB or no discrete GPU, API-only). Exports `probeHardware()`, `classifyTier()`, `inferVendor()`, `parseVramString()`, `GpuVendor`/`GpuInfo`/`HardwareTier`/`HardwareProfile` types. Uses `execFileSync` exclusively (array-form args, no shell string — no injection surface) to call `nvidia-smi`, `lspci` (Linux fallback), `system_profiler`/`sysctl` (macOS + Apple Silicon fallback), and `powershell`/`Get-CimInstance` (Windows fallback).
- `src/installer/hw-probe/hwProbe.spec.ts` — colocated spec file (not under `tests/` — this sub-project is exempt from the repo's normal test-location convention because it's self-contained), 57 tests covering all platform branches, vendor inference, VRAM parsing, and edge cases.
- **Correction to an earlier same-session claim:** this was originally described as "the two files were swapped." Direct diff inspection showed that's imprecise — **neither file contained a real prior implementation.** The old `hwProbe.ts` contained a full test suite (header comment literally read `hwProbe.spec.ts`). The old `hwProbe.spec.ts` was a _different_, smaller, older test file using generic `os`/`child_process` mocks with `execSync` (not `execFileSync`). The actual implementation was **freshly authored**, not recovered from a swap. It is, however, cross-checked against real prior expectations: the _old_ spec file's tier-threshold assertions (24576→Z, 12288→Y, 6144→X) match the new implementation's `classifyTier` thresholds, which weren't re-derived from scratch.
- The sub-project's own `vitest.config.ts` had `include: ["src/**/*.spec.ts"]`, which could never have matched `hwProbe.spec.ts` (no nested `src/` folder exists inside this sub-project). Changed to `include: ["**/*.spec.ts", "**/*.test.ts"]` with explicit `exclude: ["node_modules/**", "dist/**"]`.
- **Root cause of why this sub-project's tests never ran under a plain root `npx vitest run`, found and fixed this session:** this sub-project has its own `vitest.config.ts` + `package.json`, which Vitest v4 treats as a project boundary that default file discovery does not cross, regardless of the root `include` glob (an earlier attempt at fixing this via just the `include` glob had no effect, and went unnoticed for a while because `npx vitest list` _does_ discover the sub-project's tests even though `npx vitest run` does not — the two use different discovery mechanisms). Confirmed via `npx vitest run --project hw-probe` failing with `"No projects matched the filter"` (root config had zero `projects` configured), while `npx vitest run src/installer/hw-probe/hwProbe.spec.ts` (direct path) ran clean (57/57) — proving the file itself was fine and the gap was purely in project/discovery wiring, not the file or its mocks. **Fix:** added `projects: [".", "src/installer/hw-probe"]` to the root `vitest.config.ts`. Verified via a clean before/after `npx vitest run` file-count/test-count diff: 317 files/5322 tests → 318 files/5379 tests (exactly +1 file / +57 tests, matching `hwProbe.spec.ts`'s own count with nothing lost or duplicated from the existing root suite), repeated twice for stability.

---

## 3. Session Work — Commits (chronological across sessions)

| Commit      | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `3344219e`  | Option C: cap `saveWorkspaceContext()` summaries at 500 chars (mirrors existing `governance/workspace-context.ts` pattern), preventing unbounded context injection into every `gateway.ask()` call with a `workspaceId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `d57b9f56`  | Option B: `retrieve` tool calls now get classified (`path-like`/`symbol-like`/`semantic`) instead of always falling to `synthesis`. Includes a real bug fix found mid-work: initial path-detection logic (`isRetrievePathLike`) used an open-ended extension regex that misclassified dotted symbol names (`gateway.ask`) as file paths; replaced with a closed list of known extensions.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `852132d4`  | Repo cleanup: deleted 2 stale branches (`sprint-110a-symbol-strategy` via `-d`, confirmed merged + tagged `sprint-110a-complete`; `sprint-109-loop-fix-and-prompt-budget` via `-D`, confirmed unmerged-but-tagged `sprint-109-complete`). Removed a stray tracked 0-byte file named `main` at repo root that had been causing `git log main` ambiguity errors since `f407e494` ("Sprint 10 complete").                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `6230f58c`  | Sprint 110b: symbol extractor (`symbol-extractor.ts`), indexer (`symbol-indexer.ts`), migration runner (`run-migrations.ts`), deterministic repository ID (`repository-id.ts`). Also fixes a real bug caught along the way: `retrieve.ts`'s `mode` type annotation silently excluded `"symbol"` via an `as` cast, masking TypeScript's exhaustiveness check and creating a live runtime-crash risk on any real `mode="symbol"` call. Verified end-to-end against a live Postgres DB (1306 rows inserted, real query succeeded).                                                                                                                                                                                                                                                                                                               |
| `7dc7d228`  | Option A instrumentation: best-effort tool-call measurement logging, added after confirming no existing log captured this data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `0fa09174`  | `chore: gitignore response.json` — removed a stray untracked `response.json` scratch dump at repo root (leftover from an ad-hoc tool/API call), added `response.json` to `.gitignore` to prevent recurrence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `237b6a43`  | **`run-migrations.ts` idempotency via `schema_migrations` table.** The original runner applied every `.sql` file unconditionally; re-running against a DB that already had the tables crashed with "relation already exists". Fix: at the start of every run, create `schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)` if absent, load the set of already-recorded filenames, skip any migration already in that set, and insert a row after each newly-applied file. Updated the completion log line to report "N new / M already up to date". Adds `tests/storage/run-migrations.test.ts` (6 unit tests, `pg` + `node:fs` fully mocked — see Section 8.2 for the debugging detour this test file took). Includes documentation of the one-time backfill required for pre-existing databases. Pushed to `origin/main`. |
| `525064b0`  | **`symbol-indexer.ts` batch-insert optimization.** Replaced the per-symbol loop (~1300+ individual `INSERT`s) with `insertChunk()`, building multi-row `INSERT ... VALUES ($1,...,$7), ($8,...,$14), ...` per batch of `INSERT_CHUNK_SIZE = 500` rows. Placeholder indices confirmed chunk-local via direct diff review — no parameter-index bleed across batches. Same transaction/rollback/return-shape semantics preserved. Test suite rewritten: batching-count test, placeholder-correctness test asserting on the raw SQL string (not just call counts), zero-symbols edge case, updated rollback test. Verified: isolated test file (9/9), full suite (317/5322 at the time), `npx tsc --noEmit` clean, live Postgres (189 files, 1322 symbols → 3 batched INSERTs of 500/500/322). Pushed to `origin/main`.                           |
| `69ed89f5`  | **`hw-probe` sub-project fix + root Vitest project wiring.** See Section 2's `hw-probe` entry and Section 8.4 for the full diagnostic trail. Fresh `hwProbe.ts` implementation, rewritten `hwProbe.spec.ts` (57 tests), fixed sub-project `vitest.config.ts` include glob, and — the actual root-cause fix — added `projects: [".", "src/installer/hw-probe"]` to the root `vitest.config.ts`. Verified via clean before/after full-suite diff (317/5322 → 318/5379) and `npx tsc --noEmit`. Pushed to `origin/main`.                                                                                                                                                                                                                                                                                                                         |
| _(pending)_ | **Measurement-log root-cause fix + source tagging + checkpoint automation.** `tool-call-measurement-log.json` was found to have zero entries ever, despite `7dc7d228`'s instrumentation being correctly wired — root cause was simply no real tool-invoking session having run since. Added `source: "production"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | "dev" | "ci" | "test"`field +`detectSource()`to`tool-call-measurement-log.ts`to prevent dev/CI/test traffic contaminating production measurements. Reset the log (the 2 debug-run entries predate the`source`field). Added`scripts/measurement-checkpoint.ts` + a weekly cron job to report progress automatically. See Section 9 for full detail. **Not yet committed as of this doc update** — see Section 9's git commands. |

**All commits through `69ed89f5` are pushed to `origin/main`.** The measurement-log fix described above (source tagging + checkpoint automation) is staged locally but **not yet committed** as of this doc update — `git status --porcelain` shows `src/agents/tool-call-measurement-log.ts` modified and `scripts/measurement-checkpoint.ts` untracked. See Section 9 for the exact git commands to commit and push it.

---

## 4. Real Bugs Found & Fixed (pattern worth remembering, not just the fixes)

1. **Masked exhaustiveness check** — `retrieve.ts`'s `mode` type annotation (`as "code" | "vector" | "file" | undefined`) quietly excluded `"symbol"`, so TypeScript's `never`-guard exhaustiveness check on the formatting switch never saw it as reachable and reported no error — even though a real `mode="symbol"` call would crash at runtime with `Unknown strategy: symbol`. **Lesson: a narrow `as` cast can silently defeat an exhaustiveness guard elsewhere in the same file; verify the guard is tied to the real source-of-truth type, not just check that it compiles.**
2. **Over-permissive path detection** — first attempt at `isRetrievePathLike()` used "any string with a short suffix after a dot" as its extension check, which structurally can't distinguish a real file extension (`config.ts`) from a dotted symbol name (`gateway.ask`). Fixed with a closed list of known extensions. **Lesson: open-ended pattern-matching heuristics need to be stress-tested against the specific adversarial case they're meant to exclude, not just the case they're meant to include.**
3. **Over-broad deduplication** — an early fix for a real duplicate-symbol bug (export-assignment re-finding an already-visited declaration) used a `name:kind` dedup key, which silently collapsed legitimate TypeScript function overload signatures (same name, same kind, different signatures) into a single entry. Fixed by switching to position-based dedup (`node.getStart():node.getEnd()`), which only suppresses genuinely duplicate AST nodes. **Lesson: a dedup key needs to distinguish "same node visited twice" from "two different things that happen to share a label" — verified via an explicit synthetic overload test before trusting it.**
4. **False-positive gap investigation (self-corrected)** — initially believed 6 files represented a real symbol-capture gap because they use `export default <identifier>`. Investigation showed 5 of 6 were already fully captured via the pre-existing `export const`/`export function` branches — only genuinely one file (`hw-probe/vitest.config.ts`'s anonymous `export default defineConfig({...})`) needed the new default-export-resolution logic. **Lesson: grepping for a pattern doesn't tell you whether something is _only_ reachable that way — check whether the same identifier is also exported elsewhere before concluding a gap exists.**
5. **Stale test assumption** — `tests/agents/sub-agent.test.ts` had a test assuming `retrieve` always took a 3-call synthesis path; once `retrieve` got proper classification, a symbol-like `retrieve` query correctly started skipping the second `gateway.ask()`, breaking that assumption. Updated the test to assert the new, correct 2-call behavior, and added a second test verifying the tool-error content still surfaces correctly through the new path (not just asserting call counts, which would have missed a real content bug).
6. **`node:fs` mock missing default export** — a `vi.mock("node:fs", ...)` providing only named exports (`readFileSync`, `readdirSync`) threw `No "default" export is defined on the "node:fs" mock` at test-collection time (0 tests ran, not a test failure). Root cause: something in the import chain accesses `node:fs` via its default-namespace export, not just named imports. **Lesson: when mocking a core Node module, mirror the real module's full export surface (named + default), not just the exports your code directly imports.**
7. **`sed -i` line-range deletion overshot into an unrelated block** — after an earlier append accidentally duplicated a `vi.mock("node:fs", ...)` block (edit intended to _replace_ landed as _append_ instead), a follow-up `sed -i '37,42d'` used line numbers from a `grep -n` taken _before_ the file had been re-viewed at its current state. The deletion removed the intended duplicate block **and** the entire preceding `vi.mock("pg", ...)` block, which happened to sit at adjacent line numbers after the duplication. Symptom was confusing: tests went from "0 tests, mock-shape error" to "6 tests ran, all failed with a real Postgres auth error" — looked unrelated to the fix just made, but was directly caused by it. **Lesson: never reuse `grep`/`view` line numbers across tool calls once the file has been edited; re-view immediately before any line-range deletion, or avoid line-range patches entirely in favor of full-file heredoc overwrites when there's any ambiguity about current file state.**
8. **Imprecise root-cause claim, self-corrected via diff review** — a same-session claim that two `hw-probe` files "were swapped" turned out to be imprecise once the actual diffs were reviewed; neither file held a working prior implementation. **Lesson: a plausible-sounding one-line root-cause summary should still be checked against the actual diff before being repeated forward into documentation or commit messages — it can be _directionally_ right (both files were wrong) while being _specifically_ wrong (about why).**
9. **`vitest list` discovery vs `vitest run` execution silently disagreed** — a sub-project with its own `vitest.config.ts`/`package.json` was discoverable via `npx vitest list` but never actually executed by a plain `npx vitest run`, because Vitest v4 treats it as an unlisted project boundary. An `include` glob edit to the root config looked plausible and was initially believed sufficient, but had zero effect, and this went unverified for a while because the wrong verification method was used (`vitest run --coverage <subpath>`, which only reports on what you point it at, and `vitest list`, which uses different discovery logic than `run`). Only a direct before/after **file-count/test-count diff on a plain `npx vitest run`** exposed the gap. **Lesson: when verifying that a sub-component is now "included" in a larger suite, verify via the exact invocation that matters in practice (the plain default command, e.g. what CI runs) — a targeted run or a different subcommand can look like sufficient proof while testing something subtly different.**

---

## 5. Current Repo State (updated 2026-07-10 — see Section 9 for full detail)

- 10 commits on `main`, all pushed to `origin/main` (most recent: `51b648dd`, the 2026-07-10 measurement-log fix — supersedes the previous "most recent: `69ed89f5`" note).
- **No uncommitted code changes remain**, as of commit `51b648dd`. The measurement-log fix (source tagging, log reset, checkpoint automation) landed cleanly: 3 files changed, 348 insertions(+), 19 deletions(-), pushed `dcbc4611..51b648dd`. (This doc's own most recent revision, adding Sections 9.7–9.10, is itself pending its own small follow-up commit — see Section 9.9's housekeeping note.)
- `tool-call-measurement-log.json` (mentioned in Section 2's "Measurement logging" entry and Section 6's open item) was found this session to have **zero entries ever** — not "not enough yet." Root cause and fix are in Section 9. The file has since been reset to `{"entries": []}` and real accumulation restarted from 2026-07-10 with a `source` field now distinguishing production/dev/ci/test traffic. `UNIFIED_AI_ENV=dev` is confirmed set in the local dev shell profile, so this machine's own interactive testing won't contaminate the `"production"` bucket.
- `symbols` table exists and is populated (1322 rows as of the batch-insert live verification) in the local dev Postgres at `postgresql://unified:postgres_CHANGE_ME@localhost:5432/unified_theatre` (Docker container `qwen-postgres`). This does not persist automatically to any other environment. `DATABASE_URL` is present in the repo's local `.env`, **confirmed gitignored** (`git check-ignore .env` → `ignored`).
- `schema_migrations` table exists in that same local Postgres and correctly reflects `001_symbols_table.sql` as applied (backfilled).
- Full test suite via plain `npx vitest run`: **318 test files, 5379 tests, passing clean** — confirmed via two consecutive fresh runs after the hw-probe session's changes landed (`69ed89f5`); not re-run after the 2026-07-10 measurement-log fix since that change didn't touch test files — worth a fresh run before the next code change in this area, per Section 1's verification standard.
- `response.json` scratch-dump issue resolved (commit `0fa09174`).

---

## 6. Open Items (updated 2026-07-10, post-commit)

1. **Option A (real measurement)** — instrumentation is in place and, as of 2026-07-10, **confirmed actually firing and writing to disk** (this was not previously verified — see Section 9; the log had zero entries before this session despite being described as "in place"). It now also correctly tags every entry with `source: "production"|"dev"|"ci"|"test"` so dev-loop/CI/test traffic can be excluded from analysis. Needs real accumulated **production-tagged** usage (a weekly automated checkpoint script now reports progress — see Section 9) before the actual cost/distribution analysis can happen. Do not synthesize this data. **This remains the only substantively open item in the whole doc**, split into two concrete sub-steps:
   - a. Let production usage accumulate until the checkpoint script's readiness gate is met.
   - b. Run the distribution analysis (scoped to `source: "production"` only) and decide whether to extend the fast-path skip to `vector-search`/`semantic search-code`.
2. ~~Commit the 2026-07-10 measurement-log fix~~ — **Done.** Committed as `51b648dd`, pushed to `origin/main`. See Section 9.7.
3. ~~Confirm `UNIFIED_AI_ENV=dev` is set in the interactive dev shell profile~~ — **Done.** Confirmed set and sourced. See Section 9.7.

_(Previously open items — `run-migrations.ts` idempotency, `symbol-indexer.ts` batch inserts, `hw-probe` root-suite inclusion, `.env` gitignore confirmation, `response.json` cleanup — are all resolved; see Sections 3 and 5. As of this update, item 1 above is the only thing left open anywhere in this document — everything else is either done or blocked on item 1's real-world accumulation timeline.)_

---

## 7. Instructions for Any Agent Picking This Up

- **This doc is tracked in git at the repo root — pull `main` first to make sure you have the current version**, rather than relying on a version pasted into an earlier chat session, which may be stale by the time you read it.
- **Don't trust prior-session summaries (including this one) at face value.** Every session so far has found small-to-moderate inaccuracies in earlier summaries or in same-session claims made before the underlying diff was actually reviewed — a tag name that didn't match the pattern described, a branch merge-status assumption that turned out backwards, a "6 files need fixing" claim that turned out to be 1 real case and 5 false leads, a "files were swapped" claim that didn't survive a diff review, and a "root cause fixed" claim (hw-probe test inclusion) that only a fresh before/after test-count comparison actually confirmed — an earlier, more superficial verification method had missed it entirely. Verify claims against actual repo state (`git log`, `grep`, running the actual test, diffing the actual file) before acting on them — especially before deleting anything, committing anything, or trusting "already fixed."
- **Follow the small-slice, raw-output-verification discipline described in Section 1.** It has caught a real, ship-blocking bug or a real inaccurate claim at literally every stage it's been applied (masked type gap, over-permissive regex, over-broad dedup, false-positive gap belief, stale test assumption, missing mock default-export, a `sed` deletion that silently removed an unrelated mock block, an imprecise root-cause claim, and a `vitest list`/`vitest run` discovery-vs-execution mismatch). Skipping it is how bugs and false claims like these end up shipping invisibly.
- **When a test fails after a change and looks "unrelated," don't assume — check via `git stash` (run the failing test against pre-change code) or repeated runs**, the way earlier sessions did for the `sprint85-guard`/`storage-monitor` flakes, before concluding it's pre-existing.
- **When a fix is reported as "done" with a coverage/test-count summary, re-run the relevant comparison yourself from a clean state before accepting it** — a summary quoting impressive-looking numbers for a _targeted_ run (e.g. `vitest run --coverage <subpath>`) does not by itself prove the _default_ invocation (what CI or a typical `npx vitest run` actually uses) covers the same code. This exact gap is what Section 8.4 walks through in full.
- **Before committing, check whether secrets/credentials were written into any file this session** (e.g. `.env`) and confirm gitignore status with `git check-ignore <file>` — don't assume a file stays gitignored after being edited; re-check.
- **A `git commit -F-`/heredoc's terminal echo can look garbled or truncated even when the stored message is completely correct.** Always verify with `git log -1 --format="%B"` rather than trusting the paste-back.

---

## 8. Detailed Session Log — Verification Trail (kept in full for continuity; do not summarize away the specifics below in future edits, since the specifics are what let the next agent avoid repeating the same detours)

### 8.1 `response.json` cleanup + push

Removed untracked `response.json`, added to `.gitignore`, committed as `0fa09174`, confirmed clean tree, pushed alongside the run-migrations work. Verified via `git log --oneline origin/main..main` (empty after push), `git fetch` + `git log --oneline main..origin/main` (empty, no surprise upstream commits), and post-push `git status` showing "up to date with origin/main".

### 8.2 `run-migrations.ts` idempotency — build + debug trail

Built `schema_migrations` table logic (`CREATE TABLE IF NOT EXISTS` + `SELECT` already-applied filenames + skip/insert per file) and a matching test file, modeled on the existing `pg.Pool`-as-class mock pattern from `tests/storage/symbol-indexer.test.ts`.

**Debugging detour (see bugs #6 and #7 in Section 4 for the lessons):**

1. First test run: 0 tests collected, `No "default" export is defined on the "node:fs" mock` error. Fixed by adding a `default: {...}` mirror to the `node:fs` mock.
2. Second run: same error, same line. Root cause: the fix had been _appended_ rather than _replacing_ the original mock block, leaving two competing `vi.mock("node:fs", ...)` calls (the second, older one without `default` was winning).
3. Removed the duplicate via `sed -i '37,42d'` using line numbers from an earlier `grep -n` — this overshot and also deleted the entire `vi.mock("pg", ...)` block above it (they'd become line-adjacent after the duplication).
4. Third run: mock-shape error gone, but now a **real** Postgres connection was attempted (`password authentication failed for user "user"`) because `pg.Pool` was no longer mocked at all.
5. Diagnosed by requesting the full current file contents rather than guessing further, confirmed the `pg` mock block was genuinely missing, rewrote the full file via a `cat > file << 'EOF'` heredoc (not another line-range patch) with both mocks correctly present.
6. Final run: 6/6 tests passing.

**Full verification after the fix:** full suite 317/5319 passing, `npx tsc --noEmit` clean, then live-Postgres verification:

- First live run against the Docker Postgres (`qwen-postgres`, credentials found via `docker inspect` since no `DATABASE_URL` was set anywhere) hit `relation "symbols" already exists` — expected, since this DB had the `symbols` table from Sprint 110b's original manual run, predating `schema_migrations` tracking.
- Backfilled `schema_migrations` manually (`CREATE TABLE IF NOT EXISTS` + `INSERT ... ON CONFLICT DO NOTHING` for `001_symbols_table.sql`), also wrote `DATABASE_URL` into `.env` (later confirmed gitignored — see Section 8.5).
- Two subsequent runs both correctly reported `0 new migration(s); 1 already up to date` with no error.

Committed as `237b6a43` with a commit message documenting the backfill requirement for other pre-existing databases. Pushed and verified via the standard 5-step sequence (log diff, status, fetch+diff, push, post-push confirmation) — all clean.

### 8.3 `symbol-indexer.ts` batch-insert optimization — review trail

Diff reviewed directly (not accepted from summary alone) to check the placeholder-index math specifically, since this is exactly the class of bug (silent data corruption via off-by-one parameter indexing across batch boundaries) that wouldn't necessarily fail loudly. Confirmed `insertChunk()`'s `base = i * 7` is chunk-local (fresh `values`/`rowPlaceholders` arrays per call, `allSymbols.slice(i, i+CHUNK_SIZE)` passed as an independent argument each time) — no bleed-through across chunks. Test file diff also reviewed directly: confirmed the "placeholder correctness" test asserts on the raw SQL string (`$1,`, `$8,`, `$14`, explicitly `.not.toContain("$15")`), not just call counts — this is the level of test that would actually catch a boundary bug, matching the lesson from bug #5 in Section 4 about not just asserting call counts. Fully verified (isolated test run, full suite, typecheck, live DB with row-count and sample-row checks before/after). Committed as `525064b0`, pushed alongside `69ed89f5` (see Section 8.4/8.6).

### 8.4 `hw-probe` fix — review trail and root-cause diagnosis

Diffs reviewed directly for all four files (`hwProbe.ts`, `hwProbe.spec.ts`, sub-project `vitest.config.ts`, root `vitest.config.ts`) rather than accepting a prior summary claiming "3 root causes fixed" at face value. Findings:

- The "files were swapped" framing was corrected — see bug #8 in Section 4 and the `hw-probe` entry in Section 2.
- `execFileSync` usage confirmed consistent and safe (array-form args throughout, including the PowerShell invocation where the whole script is one array element, never shell-parsed by Node).
- A **fourth** real issue was found, not in the original summary: the sub-project's own `vitest.config.ts` `include: ["src/**/*.spec.ts"]` could never have matched `hwProbe.spec.ts` regardless of the root config, since there's no nested `src/` folder inside this sub-project. Fixed in the same diff (`include: ["**/*.spec.ts", "**/*.test.ts"]`).
- Blast-radius check on the root config's `+ "src/**/*.spec.ts"` addition: `find . -iname "*.spec.ts" -not -path "*/node_modules/*"` confirmed every _other_ `.spec.ts` file in the repo lives under `e2e/`, not `src/` — no unintended sweep-in of other spec files.
- **The core "does this actually work" question required real digging.** `npx vitest list` (run from repo root) discovered all ~54–57 `hwProbe.spec.ts` tests. But a fresh `npx vitest run` (root, no path argument) taken immediately afterward showed **317 files / 5322 tests — byte-identical to a run taken before the hw-probe changes existed in the working tree.** Diagnostic sequence:
  1. `find . -iname "vitest.workspace.*" -not -path "*/node_modules/*"` → empty (no workspace file).
  2. `grep -n "workspace\|projects" vitest.config.ts` → empty (root config had no `projects`/`workspace` field at all).
  3. `npx vitest run --project hw-probe` → `Error: No projects matched the filter "hw-probe"` — confirmed there were zero projects configured, so `--project` was filtering an empty set.
  4. `npx vitest run src/installer/hw-probe/hwProbe.spec.ts` (direct path, bypassing glob discovery entirely) → **57/57 passing, clean.** This isolated the problem precisely: the file itself was completely fine under the root config (no environment/tsconfig/mock incompatibility, despite the root suite defaulting to `jsdom` and the sub-project's own config specifying `node` — this turned out not to matter in practice), and the gap was purely in default file-discovery/project-boundary logic, not the file or its mocks.
  5. Root-caused: Vitest v4 treats a directory with its own `vitest.config.ts` + `package.json` as an implicit project boundary that default `run` discovery does not cross unless explicitly listed. Fix: added `projects: [".", "src/installer/hw-probe"]` to the root `vitest.config.ts`'s `test` block (the `"."` entry keeps the root project itself active — confirmed this assumption via the actual before/after run rather than trusting it blind).
  6. Verification: `npx vitest run` → **318 files / 5379 tests**, exactly `+1 file / +57 tests` (the real hw-probe spec count, not an earlier guess of ~54). Repeated a second time for stability — identical result both times. `npx tsc --noEmit` also clean after the `projects` field was added.
- The `--coverage src/installer/hw-probe` targeted run showing 100%/94.2%/100%/100% coverage (quoted in an earlier same-session claim, before the diffs were reviewed) is real but was understood to be **not proof the root suite covers it** — a targeted run naturally only exercises and reports on the path you point it at; this is documented as bug #9 in Section 4.

### 8.5 `.env` credential check

`DATABASE_URL` (including the placeholder-looking-but-real password `postgres_CHANGE_ME`) was written into the repo's local `.env` during the migration-backfill step (Section 8.2). Confirmed via `git check-ignore .env` → `ignored`, and `.env` never appeared in any subsequent `git status --porcelain` output across the rest of the session. No credential-leak risk; no action needed.

### 8.6 Commit + push sequence for `525064b0` and `69ed89f5`

Both changes (symbol-indexer batching, hw-probe fix) were verified independently, then staged and committed as two separate commits per small-slice discipline — a `git add` of both sets accidentally happened in one shot at one point, caught via `git status --porcelain` before committing, and corrected with `git restore --staged <hw-probe files>` to un-stage the second set before the first commit. Both commit messages were written via `git commit -F- << 'EOF' ... EOF` heredocs; the terminal echo of both looked visually truncated/interleaved mid-paste in both cases, but `git log -1 --format="%B"` confirmed both stored messages were complete and correct in both cases — see bug-adjacent note in Section 1 about this being cosmetic, not a real problem. Pushed together as `237b6a43..69ed89f5`, verified via the standard 5-step sequence (pre-push log diff, clean status, fetch+diff showing no surprise upstream commits, push, post-push confirmation showing empty diff and "up to date with origin/main").

---

## 9. Session Log — 2026-07-10: Measurement-Log Root Cause, Source Tagging, Checkpoint Automation

### 9.1 What triggered this session

Section 6's prior open item said instrumentation was "in place" and just needed real accumulated usage. On investigation, `~/.unified-ai-workspace/tool-call-measurement-log.json` **did not exist at all** — zero entries, ever, not "not enough yet." This is a materially different starting point than the prior summary implied, so it's documented here in full rather than silently folded into an updated status line.

### 9.2 Root-cause diagnosis

Checked, in order:

1. Confirmed `UNIFIED_AI_DATA_DIR` unset in the normal interactive dev environment (both `echo` and `env | grep`) — so the default `~/.unified-ai-workspace/` path is correct and not the issue.
2. Added temporary debug `console.error` lines at the call site in `sub-agent.ts` (`executeToolCall()`) and in `storage.ts` (`writeJsonFile()`) to trace whether the write path was actually being reached.
3. Ran one real tool-invoking session through the harness (not the test suite). Debug output confirmed **two real tool calls fired and were recorded**:
   ```
   [DEBUG sub-agent.executeToolCall] { toolName: 'search-code', classification: 'symbol-like', skipGatewayAsk: true }
   [DEBUG storage.writeJsonFile] { fileName: 'tool-call-measurement-log.json', filePath: '/home/pawan/.unified-ai-workspace/tool-call-measurement-log.json', entryCount: 1 }
   [DEBUG sub-agent.executeToolCall] { toolName: 'search-code', classification: 'semantic', skipGatewayAsk: false }
   [DEBUG storage.writeJsonFile] { fileName: 'tool-call-measurement-log.json', filePath: '/home/pawan/.unified-ai-workspace/tool-call-measurement-log.json', entryCount: 2 }
   ```
4. A `"require is not defined"` error appeared in the debug output too, but this was a red herring — it came from the temporary debug code itself using CommonJS `require()` inside an ESM module, thrown _after_ the real `writeFileSync` call had already succeeded. Confirmed via `cat ~/.unified-ai-workspace/tool-call-measurement-log.json` showing the 2 correct entries.
5. **Conclusion:** the instrumentation (`recordToolCallForMeasurement()`, wired into `executeToolCall()` at the single real `tool.execute()` call site, per Section 2's existing "Measurement logging" note and commit `7dc7d228`) was always correct. The file was simply never written because **no real tool-invoking agent session had been run through `runSubAgent()` since the instrumentation landed** — prior activity was either test suites (isolated to a temp `UNIFIED_AI_DATA_DIR` per `tests/setup.ts`) or sessions that never triggered a `[TOOL:name args]` pattern. Not a bug; a gap in real-world exercise of the code path.

### 9.3 Gap found beyond the original ask: no source tagging

While investigating, a second, real gap was identified that the original instrumentation (commit `7dc7d228`) didn't cover: **no way to distinguish real end-user usage from developer dev-loop testing or CI runs** — all would land in the same log file, indistinguishable. This is the same category of failure that is referenced elsewhere in this doc (Section 2's "Measurement logging" note) as having invalidated an _earlier_ measurement attempt (one that accidentally measured the classifier's own unit tests instead of real usage).

Test traffic itself was confirmed already isolated (test setup uses a temp `UNIFIED_AI_DATA_DIR` per run, cleaned up after), but **dev-loop and CI runs, if `UNIFIED_AI_DATA_DIR` isn't overridden, write to the same file as production usage** with nothing to tell them apart.

### 9.4 Fix implemented

Diff applied to three files (`tool-call-measurement-log.ts`, `sub-agent.ts`, `storage.ts`):

**`src/agents/tool-call-measurement-log.ts`:**

```diff
+ /** Derive call source from environment. Explicit override > CI > test > dev > production. */
+ export function detectSource(): "production" | "dev" | "ci" | "test" {
+   const env = process.env.UNIFIED_AI_ENV;
+   if (env) return env as "production" | "dev" | "ci" | "test";
+   if (process.env.CI) return "ci";
+   if (process.env.VITEST) return "test";
+   return "production";
+ }
+
  export interface ToolCallMeasurementEntry {
    toolName: string;
    args: Record<string, string>;
    classification: ToolCallClass;
    skippedGatewayAsk: boolean;
+   source: "production" | "dev" | "ci" | "test";
    timestamp: number;
  }

  export function recordToolCallForMeasurement(
-   entry: Omit<ToolCallMeasurementEntry, "timestamp">,
+   entry: Omit<ToolCallMeasurementEntry, "timestamp" | "source">,
  ): void {
    try {
      const store = readJsonFile<MeasurementStore>(MEASUREMENT_LOG_FILE, { entries: [] });
-     store.entries.push({ ...entry, timestamp: Date.now() });
+     store.entries.push({ ...entry, source: detectSource(), timestamp: Date.now() });
```

**`sub-agent.ts` and `storage.ts`:** the temporary debug `console.error` lines from Section 9.2's diagnosis were removed again after the fix — net diff on these two files is zero, which is why `git status --porcelain` correctly shows them unmodified (only `tool-call-measurement-log.ts` shows as modified).

**Action required on developer machines**, not yet confirmed done as of this doc update (tracked as Section 6, item 3):

```bash
export UNIFIED_AI_ENV=dev
```

Add to `~/.bashrc` so interactive dev sessions self-tag as `"dev"` instead of defaulting to `"production"`.

### 9.5 Log reset

The 2 entries created during the Section 9.2 debug run predate the `source` field (no `source` key present in either) and are not representative real usage — they were manually triggered to test the instrumentation. The file was reset to `{"entries": []}` so accumulation starts clean against the new schema.

**Real accumulation restart date: 2026-07-10.**

### 9.6 Checkpoint automation

A manual "go check the log" step was judged too easy to forget, so it was automated end-to-end.

**Script added:** `scripts/measurement-checkpoint.ts` (new, untracked as of this doc update). Reads the log, reports:

- total entries and breakdown by `source`
- for `source: "production"` only: date range and classification distribution (path-like / symbol-like / vector-search / semantic / synthesis)
- a heuristic **readiness gate** (adjustable constants at the top of the file, not a statistical proof): flags "looks sufficient" when production entries is at least 200, date span is at least 5 days, and at least 4 of 5 classifications are represented.

Deliberately does **not** draw conclusions or suggest code changes — mirrors this doc's existing "do not synthesize this data" discipline (Section 6) by only ever reporting on what's actually been logged.

**Cron job added** (WSL/Ubuntu, `pawan`'s machine), runs weekly Monday 9am, appends to `~/.unified-ai-workspace/checkpoint-history.log`:

```cron
PATH=/home/pawan/.nvm/versions/node/v22.22.3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 9 * * 1 cd /home/pawan/vscodeagent/Solution && npx tsx scripts/measurement-checkpoint.ts >> /home/pawan/.unified-ai-workspace/checkpoint-history.log 2>&1
```

**Debugging detour setting this up** (worth keeping in full — same "verify the real invocation, not a proxy for it" lesson as bug #9 in Section 4, just applied to cron instead of Vitest):

1. First attempt used `/usr/bin/env -S npx tsx ...` — failed with `env: 'npx': No such file or directory`. Cron runs with a minimal PATH that doesn't include nvm-managed node; `which npx` resolves fine in an interactive shell only because `.bashrc`/nvm sourcing puts it there, which cron skips entirely.
2. Second attempt hardcoded the absolute path to `npx` (`/home/pawan/.nvm/versions/node/v22.22.3/bin/npx`) — got further but then failed with `env: 'node': No such file or directory`, because `npx` itself is a Node script with a `#!/usr/bin/env node` shebang, and cron's minimal PATH still couldn't resolve `node` when `npx` tried to invoke it internally.
3. Root-caused: the fix needed to be a `PATH=` line at the top of the crontab (covering the whole job, not just one binary), not a one-off absolute path to a single executable. Added a `PATH=` line pointing at the nvm node bin dir, and simplified the job line back to plain `npx tsx ...`.
4. Separately, `service cron status` showed cron **not running at all** in this WSL instance by default. Fixed interactively with `sudo service cron start`, then made persistent across `wsl --shutdown`/restart via a `[boot]` stanza in `/etc/wsl.conf`:
   ```ini
   [boot]
   command="service cron start"
   ```
   Note: this does NOT need re-doing just from closing a terminal window — WSL keeps running across window closes. It only resets on an actual `wsl --shutdown` or a full Windows restart, which is exactly the case the `wsl.conf` boot stanza covers.
5. Verified the full pipe end-to-end by temporarily setting the schedule to `*/2 * * * *`, confirming `tail ~/.unified-ai-workspace/checkpoint-history.log` showed real script output (not a cron error) after roughly 2 minutes, clearing the log of the stale pre-fix error lines, re-testing once clean, then switching the schedule back to `0 9 * * 1`.
6. Final `crontab -l` confirmed correct as of this doc update:
   ```
   PATH=/home/pawan/.nvm/versions/node/v22.22.3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
   0 3 * * 0 cd /home/pawan/qwen-stack && bash scripts/pull-latest.sh >> logs/watchtower.log 2>&1
   0 9 * * 1 cd /home/pawan/vscodeagent/Solution && npx tsx scripts/measurement-checkpoint.ts >> /home/pawan/.unified-ai-workspace/checkpoint-history.log 2>&1
   ```

**Known fragility, flagged for the future:** the `PATH=` line hardcodes node version `v22.22.3`. If a future `nvm install` changes the shell's default node version, this cron job will silently start failing again with the same "No such file" error pattern from step 1/2 above — check this first if `checkpoint-history.log` unexpectedly goes quiet.

### 9.7 Commit status — DONE (updated after commit)

**Committed and pushed.** Commit `51b648dd`, on `origin/main` as of 2026-07-10 23:58 IST.

```
[main 51b648dd] Fix empty measurement log, add source tagging, automate weekly checkpoint
 3 files changed, 348 insertions(+), 19 deletions(-)
 create mode 100644 scripts/measurement-checkpoint.ts
```

Pushed cleanly: `dcbc4611..51b648dd main -> main`. Commit message verified in full via `git log -1 --format="%B"` (not just the terminal echo of the heredoc/`-m` string, per Section 1's discipline around cosmetic paste-back truncation) — confirmed all bullet points stored correctly.

**Files committed:** `src/agents/tool-call-measurement-log.ts` (modified, +18/-2), `scripts/measurement-checkpoint.ts` (new, 124 lines), `unified-theatre-continuity-summary.md` (this doc itself, modified — note: that commit captured the _previous_ revision of this doc, i.e. everything through Section 9.6; this current revision, including 9.7 onward, will need its own follow-up commit once saved — see Section 9.9).

(Note: `sub-agent.ts` and `storage.ts` correctly showed no diff at commit time — see Section 9.4's note on the debug lines being added and removed within the same session, net zero.)

The commands originally planned for this step (kept below for reference / repeatability if this pattern is needed again):

```bash
cd /home/pawan/vscodeagent/Solution
git status --porcelain
git add src/agents/tool-call-measurement-log.ts scripts/measurement-checkpoint.ts unified-theatre-continuity-summary.md
git diff --cached --stat
git commit -m "Fix empty measurement log, add source tagging, automate weekly checkpoint

- Root cause: recordToolCallForMeasurement() was correctly wired but no
  real tool-invoking session had run through it since instrumentation
  landed, so the log file never existed.
- Add source field (production/dev/ci/test) to ToolCallMeasurementEntry
  via detectSource(), to prevent dev/CI/test traffic from contaminating
  production measurements (same failure mode that invalidated an earlier
  measurement attempt).
- Reset log to empty; real accumulation starts fresh as of this commit.
- Add scripts/measurement-checkpoint.ts: reports entry counts, source
  breakdown, and production-only classification distribution against a
  volume/diversity readiness gate. Does not draw conclusions.
- Wire weekly cron job (Monday 9am) to run the checkpoint automatically,
  verified end-to-end including WSL cron PATH/daemon persistence.
- Update continuity summary (Section 9) with full session history."
git log -1 --stat
git push
```

**`UNIFIED_AI_ENV=dev` — also DONE.** Added to `~/.bashrc` and sourced:

```bash
echo 'export UNIFIED_AI_ENV=dev' >> ~/.bashrc
source ~/.bashrc
```

Confirmed applied — interactive dev-loop sessions on this machine now correctly tag as `"dev"` rather than defaulting to `"production"`, closing the gap described in Section 9.3/9.4.

### 9.9 Final state as of this doc update

Every action item opened during this session (Section 6, items 1b setup / 2 / 3) is now resolved except the genuinely long-running one:

| Item                                    | Status                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| Measurement log root cause fixed        | ✅ Done                                                |
| Source tagging implemented              | ✅ Done                                                |
| Log reset to clean slate                | ✅ Done                                                |
| Checkpoint script + weekly cron         | ✅ Done, verified end-to-end                           |
| `UNIFIED_AI_ENV=dev` set on dev machine | ✅ Done                                                |
| Code + doc committed and pushed         | ✅ Done — commit `51b648dd`                            |
| Real production accumulation            | ⏳ In progress, started 2026-07-10, 0 entries at reset |
| Distribution analysis                   | ⏳ Blocked on accumulation reaching readiness gate     |
| Fast-path-skip widening decision        | ⏳ Blocked on analysis above                           |

**Nothing else is actionable right now.** The system runs itself from here: use the app normally, the Monday 9am cron job appends to `~/.unified-ai-workspace/checkpoint-history.log` automatically, and the next real step is triggered by that log reporting the readiness gate met on `source: "production"` entries — at which point run the distribution analysis and then the fast-path-skip decision (Section 6, item 1b).

**Housekeeping note for whoever saves this revision of the doc:** this edit (Sections 9.7–9.9) was made _after_ commit `51b648dd`, so it is itself currently uncommitted. Commit it as a small, self-contained follow-up:

```bash
cd /home/pawan/vscodeagent/Solution
# overwrite unified-theatre-continuity-summary.md with this revision first, then:
git status --porcelain   # expect only: M unified-theatre-continuity-summary.md
git add unified-theatre-continuity-summary.md
git commit -m "docs: confirm measurement-log fix committed, pushed, and env var set

Follow-up to 51b648dd — records that the commit/push succeeded and
UNIFIED_AI_ENV=dev was set, and marks all setup-phase action items from
Section 6 as done. Only the long-running production-accumulation step
remains open."
git push
```

### 9.10 State handoff for the next agent/session

- Do not re-run the Section 9.2 diagnosis — it's confirmed resolved and shipped in `51b648dd`. If the log ever goes empty again unexpectedly, suspect the cron `PATH=` node-version fragility (Section 9.6) or a `UNIFIED_AI_DATA_DIR` override first, not a repeat of the original root cause.
- Do not treat any log entry without a `source` field as valid production data — it predates this fix (anything from before 2026-07-10).
- Do not run a full distribution analysis until `scripts/measurement-checkpoint.ts` (or `~/.unified-ai-workspace/checkpoint-history.log`) reports the readiness gate as met on `source: "production"` entries specifically.
- All setup-phase work for this item is committed (`51b648dd`) and confirmed pushed to `origin/main`. There is nothing left to commit for this item until the analysis/decision step (Section 6, item 1b) produces code changes.

## Coverage Hardening Log (pending condensation)

_Raw per-file entries below. To be reviewed and folded into the main
sections (or deleted if not worth keeping) once the coverage pass is
complete — do not treat this section as final prose._

| File                         | Lines targeted | Before                      | After                      | Commit   | What was actually tested / why skipped                                                                                                                                                                                             |
| ---------------------------- | -------------- | --------------------------- | -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/agents/tools/retrieve.ts | 61-66          | 90% stmts / 84.21% branches | 100% stmts / 100% branches | fea79ac4 | Two tests for the `case "symbol":` branch: (1) non-empty results assert exact formatted string `"name (kind) at filePath:startLine-endLine"`; (2) empty results assert exact `"No symbol found for \"<query>\"."` fallback message |

| src/daemon/watcher.js | 374, 437 | 98.9% stmts / 77.57% branches / 98.87% lines | 100% stmts / 80.37% branches / 100% lines | 1ed41516 | Line 374: throttle guard in runEnhanceCycle — asserts `_spawnEnhance` called exactly once when second tick is within `intervalMs` window; line 437: concurrent `running` flag guard in runCaptureCycle — asserts `captureThread` called exactly once when second tick fires while first cycle is still awaiting |

| src/domain/schemas.js | 107 | 96% stmts / 100% branches / 50% funcs / 96% lines | 100% stmts / 100% branches / 100% funcs / 100% lines (full suite) | 1d29348b | Line 107: `parseAppConfig` function body — asserts top-level defaults on empty input, nested sub-schema defaults with explicit `{}`, value preservation, and ZodError on invalid field type |

| src/domain/types.js | all lines (0% coverage) | 0% stmts / 0% branches / 0% funcs / 0% lines | file removed from coverage report | SKIPPED (coverage) / bc005b22 (test + config) | SKIPPED for V8 coverage — file is a pure ESM re-export barrel with JSDoc @typedefs; V8 cannot instrument static re-export bindings. Added to vitest.config.ts coverage exclude alongside other barrel files. 31-test behavioral suite (tests/domain-types.test.js) written to assert every re-exported symbol is the exact same reference as its origin module, catching any future omissions or typos. |

| tool-call-measurement-log.ts | 14, 49 | Stmts 75% Branch 50% Funcs 100% Lines 84.61% | Stmts 93.75% Branch 87.5% Funcs 100% Lines 92.3% | 5b0ad8fb | Tested: `detectSource()` returning UNIFIED_AI_ENV override (line 14); CI env-var branch (line 15); MAX_ENTRIES eviction slice in `recordToolCallForMeasurement` (line 49); storage-error swallow. `return "production"` (else-of-VITEST) SKIPPED — not testable from within vitest (runner always sets VITEST=1). |

| base.ts (src/agents/tools/) | all | Stmts 0% Branch 0% Funcs 0% Lines 0% | File removed from coverage report | 2df3ceaf | SKIPPED (no test written) — file contains only TypeScript `interface` declarations (ToolResult, Tool); zero executable statements emitted. Added to vitest.config.ts coverage.exclude alongside src/agents/types.ts and src/mcp/types.ts. |

| llm.js (src/commands/) | 775 | Stmts 99.7% Branch 81.41% Funcs 100% Lines 99.7% | Stmts 100% Branch 82.05% Funcs 100% Lines 100% | 0263e68f | Tested: `rubric enable` success path prints "Enabled." (line 775); `err?.message ?? err` no-message branch in the catch block. Root cause: existing test in llm-cli-commands.test.js asserted `setRubricActive` was called but never asserted the `console.log` output, leaving the statement uncovered despite the action running. |

| workspace-approvals.ts | 65, 113 | Stmts 94.73% Branch 80% Funcs 100% Lines 97.14% | Stmts 100% Branch 100% Funcs 100% Lines 100% | 623543dd | Tested: MAX_APPROVALS (2000) eviction slice in createWorkspaceApprovalRequest (line 65); `return null` for unknown approvalId in resolveWorkspaceApprovalRequest (line 113). Also added full happy-path and filter coverage for list/get/clear. New file: tests/governance/workspace-approvals.test.ts. |

| workspace-quotas.ts | 142,159,202-214 | Stmts 92.85% Branch 87.61% Funcs 93.93% Lines 93.26% | Stmts 100% Branch 93.8% Funcs 100% Lines 100% | a5f0b35d | Tested: alertThresholdPct inherited from existing policy when omitted in update (line 142); policy update overwrites existing record in-place (line 159); clearWorkspaceQuotaPolicy removes only the target workspace policy (lines 202-214). Remaining branch misses are defensive nullish-coalescing fallbacks in loadStore() for malformed JSON — not in original report scope. New file: tests/governance/workspace-quotas.test.ts. |

| src/llm/document-ingester.js | 97-102,106-111 | 93.61tmts / 89.69ranches / 94.28 0nes | 94.28tmts / 89.69ranches / 94.28 0nes | c218f628 | Tested: fallback branches in readDocumentText for pdf/docx import failures now assert the ingester returns a zero-chunk result instead of crashing; no skip needed because the branch is meaningful and observable. |

| src/llm/embeddings.js | 188 | 96.77tmts / 90ranches / 98.47 0nes | 96.77tmts / 90ranches / 98.47 0nes | 7577cffc | Tested: clusterDocuments returns `{ clusters: [] }` when no documents contain an embedding; this is a meaningful branch because it changes behavior from attempting clustering to returning an empty result. |

| src/llm/experience-db.js | 579-580 | 96.85tmts / 87.98ranches / 97.65 0nes | 96.85tmts / 87.98ranches / 97.65 0nes | a9ddfedc | Tested: getThreadContext() returns `[]` for blank/whitespace query before any embedding logic runs; this branch is meaningful because it short-circuits the query path and avoids needless work. |

| src/llm/gateway.ts | 329-330,387,446,453,541,562,718,908-909,930-936,962-971 | 92.4tmts / 79.39ranches / 92.4 0nes | 92.4tmts / 79.39ranches / 92.4 0nes | c6d82070 | Tested: enforcePromptBudget() returns the prompt untrimmed and logs `gateway.prompt.cannot-truncate-no-boundary` when no safe boundary exists; this is a measurable fallback branch rather than a no-op. |

| src/llm/inference.js | 37-41,68,90,97,114,123,276-277,294,311-313,315-335 | 83.42tmts / 75.8ranches / 84.07 0nes | 83.42tmts / 75.8ranches / 84.07 0nes | c4013e06 | Tested: askOpenAiCompat() returns `""` when the completion payload contains a choice without message content; this is a meaningful fallback branch because it changes the return value rather than merely executing the code. |

| src/knowledge/ingest/ingest-repository.js | 60-61,69,75,106,129-130,190,232,266-273,278 | Stmts 81.19% Branch 58.33% Funcs 94.44% Lines 83.49% | Stmts 88.88% Branch 77.08% Funcs 94.44% Lines 92.23% | cc63c061 | Tested: walkFiles isFile() branch (L60-61) — pass file path directly as baseDir, assert insert called; walkFiles subdir recursion (L69) — nested `.md` in subdirectory, assert discovery+insert; walkFiles catch block (L75) — fs.stat throws EACCES, assert console.warn contains "[ingest] Skipping"; large-file skip + skipped-count log (L129-130,232) — maxFileBytes:1, assert insert not called and log contains "Skipped 1 large file(s)"; attachVectors mismatch throw (L190) — embedTextBatch returns [] for 1-chunk file, assert rejects with "embedTextBatch returned"; parseFeatureArea undefined fallback (L106) — file at cwd root has single-segment relative path, assert inserted entity module === "unknown". L266-273 SKIPPED — main() body unreachable in Vitest (VITEST env guard returns early). L278 SKIPPED — isDirectRun() can never return true in Vitest runner. Also fixed pre-existing spy leak in test file by adding afterEach vi.restoreAllMocks(). |

## Pre-existing Unstaged Diffs — Committed (pending condensation)

_Two commits to clear the working tree of diffs that pre-dated the coverage hardening session._

| Commit   | Files                                                                                                                                                                                                                      | What changed                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| d074fdf3 | `electron-ui/ipc/*.bundled.cjs`, `electron-ui/preload.bundled.cjs` (8 files)                                                                                                                                               | Bundler-generated CJS artifacts updated with error-propagating `__esm` initialiser (added try/catch + `err` param so module-init errors are captured and re-thrown on subsequent calls). No source logic changed — pure build output. |
| 9101caea | `scripts/measurement-checkpoint.ts`, `tests/llm/document-ingester-coverage.test.js`, `tests/llm/embeddings-coverage.test.js`, `tests/llm/experience-db-coverage.test.js`, `tests/llm/inference-coverage.test.js` (5 files) | Prettier formatting only — long lines reflowed, inline object/array literals expanded to multi-line. Zero logic change confirmed by diff review.                                                                                      |

---

## 10. Session Work — LLM Truthfulness Hardening (new session, 2026-07-11)

**Context/origin:** while the production-accumulation wait (Section 9.9) was in
progress, a review of an external post describing a recurring bug class in
agent-built tools — agents rendering a confident `0`, a fabricated "Failed"
verdict, or a "0% change" instead of admitting no data exists — prompted an
audit of this repo for the same pattern: places where "not found / not
measured / not checked" could collapse into something indistinguishable from
a real result.

### 10.1 MCP tool layer audit — result: SAFE, two residual fragility notes

Audited all 6 MCP tool handlers (`retrieve`, `search-code`, `vector-search`
in `src/agents/tools/`, plus `ask-local`, `code-review`, `list-tools` in
`src/mcp/tool-handlers.ts`) for confident-wrong-vs-honest-unknown gaps.

**Verdict: no confirmed bugs.** Every no-result path traced to a real,
verified `.length === 0` check gated by an underlying function that throws
(rather than swallows) on actual failure:

- `vectorSearch()` (`vector-client.ts`) — only one success return path,
  reached after a real Qdrant HTTP call; failures re-thrown.
- `searchCode()` (`code-search.ts`) — `exitCode === "1" && !stdout.trim()`
  returns `[]`, confirmed against `man rg`'s EXIT STATUS section: exit 1 is
  used _only_ for no-matches, exit 2 for errors. All other failure paths
  thrown.
- `formatVectorResults()` / `formatCodeHits()` / `formatSymbolResults()`
  (`format.ts`) — each returns `""` only when its input array's `.length
=== 0`; non-empty input always produces non-empty output.

**Two residual fragility notes (not bugs, not fixed, worth remembering):**

1. `vector-client.ts` — the Qdrant response type has `result?:` as
   **optional**, and the code does `json.result ?? []`. This is _not
   verified at runtime_: if Qdrant ever returns 200 OK with a malformed
   body lacking `result`, this silently produces `[]` instead of an error.
   Trusts the API contract, doesn't check it.
2. `code-search.ts` — the `exitCode === "1"` no-match assumption is
   correct per ripgrep's documented contract today, but also _not verified
   at runtime_ — it trusts `rg`'s behavior doesn't change in a future
   version.

Neither needs urgent action; both are candidates for a "known fragility"
note alongside the cron `PATH=` hardcode already flagged in Section 9.6, if
this doc's fragility notes ever get consolidated into one place.

### 10.2 Retrieval router audit — `RetrieveResult.matched` — PROPOSED, NOT IMPLEMENTED

Audited `src/shared/retrieval/router.ts`'s 4 strategies (code/vector/
file/symbol) for the same pattern. Finding: `RetrieveResult` currently has
only `strategy`, `results?`, `error?` — the `error` field already
distinguishes failure from success, but within the success path there is
no field distinguishing "found nothing" from "found something." Both are
legitimate successes today; nothing is broken, but a consumer can't tell
which happened without inspecting the runtime shape of `results`.

**Decision reached: PROPOSED CHANGE, explicitly NOT implemented.** Plan on
record: add `matched: boolean` to `RetrieveResult` (additive, default
`true`, set `false` only in the no-match branches of each of the 4
strategies). Files that would need a one-line wiring edit: `router.ts`
(type + all 4 branches), `retrieve.ts`, `tool-handlers.ts` (both as
consumers, only if they want to branch on it).

**This was never confirmed or implemented in this session.** If a future
session is asked to implement it, do not assume any part of this is done —
verify `RetrieveResult`'s current field list first via
`grep -n "RetrieveResult" src/shared/retrieval/router.ts` before touching
anything.

### 10.3 Per-category readiness gate — `measurement-checkpoint.ts` — DONE, committed

**Status: implemented and committed as `1a985ee2`.** Push status to
`origin/main`: unconfirmed as of this doc update — verify with
`git log --oneline origin/main..main` before assuming it's pushed.

Added a per-category breakdown to the existing aggregate readiness gate
(Section 9.6). For each of the 5 classification categories (`path-like`,
`symbol-like`, `vector-search`, `semantic`, `synthesis`), the script now
also computes a per-category count of `source: "production"` entries and
classifies each as:

- `sufficient` — count >= 40 (derived: 200 total / 5 categories)
- `insufficient` — 1-39
- `zero` — 0

New output section appended after the existing aggregate gate (additive,
nothing removed). Per-category gate reports PASS only if all 5 categories
are `sufficient`; otherwise FAIL with blocking categories listed.

**Why this exists:** the existing aggregate gate (Section 9.6) could
theoretically report "ready" while one category — most plausibly
`symbol-like` or `synthesis`, the rarer call types — still had near-zero
real data, producing a `skipGatewayAsk`-widening recommendation that's
actually unsupported for part of the decision. This closes that gap before
the distribution analysis (Section 6, item 1b / Section 9.9) is ever run.

**Verified:** ran against the real log file (`{"entries": []}` at the time

- zero entries), confirmed the script correctly short-circuits at the
  existing "no production entries yet" guard and the new per-category section
  is simply unreached in that state (correct behavior - nothing to
  classify). `npx tsc --noEmit --project tsconfig.json` clean. Full
  per-category section has NOT yet been exercised against non-empty real
  data - that only happens once production entries actually accumulate.

**Mid-edit incident (self-corrected):** a first edit attempt corrupted the
file (dropped the `function main() {` line, broken indentation) - caught by
re-reading the file after edit, fixed via `git checkout --
scripts/measurement-checkpoint.ts` to reset to clean state, then reapplied
the change carefully. No bad state was ever committed.

### 10.4 Test-gap audit (fabrication-vulnerability pass) - 37 candidate rows, informational only

Audited all 24 existing test files (`tests/agents/`, `tests/agents/tools/`,
`tests/storage/`) against the question: "would this assertion still pass if
the tested function silently returned a fabricated default (`0`, `[]`,
`{}`, `""`) instead of its real result?"

**Result: 37 of ~404 test cases (`it`/`test` blocks) answered YES** - i.e.
would NOT catch a fabricated default. Full per-test breakdown was produced
inline in this session's transcript (not re-copied into this doc - see
chat history if the literal per-test table is needed) but the pattern
clusters were:

- Empty array/object return-value expectations (14 tests)
- Zero-count expectations (4 tests)
- Null-return expectations from `collector.test.js`'s rejection tests (12
  tests - arguably lower real risk, since these assert rejection
  behavior, not silent success)
- "No results found" / empty-search expectations across `retrieve`,
  `search-code`, `vector-client`, `vector-search` tests (5 tests)
- Misc empty-string / single-case gaps (2 tests)

**This audit produced no code changes** - it's a backlog, explicitly not
acted on in this session. These 37 are candidates for pinned regression
tests only once a real fabrication bug is found and fixed (per the
Working Convention added in 10.5) - writing tests for hypothetical gaps
with no real bug behind them was explicitly out of scope.

### 10.5 Working Conventions doc update - confident-wrong vs honest-unknown rule

**Status: UNCONFIRMED whether this was actually committed and pushed - see
the git-state incident in 10.6 below. Verify before assuming done.**

The intended addition (to be inserted immediately after the existing
"Verification standard" bullet in Section 1, same list):

> Confident-wrong vs. honest-unknown: any output surfaced by an MCP
> tool, the retrieval router, or an analysis/checkpoint script must make
> "not found / not measured / not yet enough data" structurally
> distinguishable from a real result - never a bare `0`, empty default, or
> blended aggregate standing in for "we don't know yet." When this is found
> violated, it is a bug of the same severity as the measurement-log
> root-cause bug in Section 9, and gets a pinned regression test in the
> same commit as the fix, not a follow-up item.

**Before trusting that this bullet exists in Section 1, run:**

```bash
grep -n "Confident-wrong vs. honest-unknown" unified-theatre-continuity-summary.md
```

If it's absent, the edit described above still needs to be made and
committed.

### 10.6 Git-state incident during the doc-commit step - resolved, but doc-commit completion is UNVERIFIED

While attempting to commit the Section 10.5 doc bullet, `git status
--porcelain` showed an unexpected second modified file:
`scripts/measurement-checkpoint.ts` (in addition to the expected
`unified-theatre-continuity-summary.md`). Per this repo's own discipline
(never commit on unexplained file state), the commit was correctly halted
and diagnosed rather than pushed through.

**Diagnosis (confirmed via `git diff HEAD`):** the stray change was a
trivial, purely cosmetic reformat - a single `console.log(...)` call
collapsed from 3 lines to 1 - almost certainly caused by a background
formatter or the SonarQube IDE scan running after the `1a985ee2` commit.
Confirmed it was NOT a re-application of already-committed content (`git
diff --cached` was empty; `git show --stat 1a985ee2` confirmed the feature
commit itself was clean and complete).

**Recommended resolution (given, not confirmed executed):** `git checkout
-- scripts/measurement-checkpoint.ts` to discard the stray reformat, verify
`git status --porcelain` shows only the doc file, then proceed with the doc
commit + push.

**This session ended (pivoted to coverage/Sonar work) before confirming
the resolution was actually executed.** Do not assume:

- that the stray reformat was discarded,
- that the Section 10.5 doc bullet was committed,
- that `1a985ee2` was pushed to `origin/main`.

**First action for whoever picks this up next:** run `git status
--porcelain` and `git log --oneline origin/main..main` before touching
anything else in this repo. If `scripts/measurement-checkpoint.ts` still
shows a stray diff, re-diagnose fresh rather than assuming this note's
diagnosis still applies (more time may have passed, more tooling may have
touched it again).

### 10.7 Takeaway pattern from this session (worth preserving as a lesson, like Section 4's list)

10. Background tooling can silently alter file state between explicit
    steps. Twice in one session - once via a corrupted manual edit
    (10.3), once via an apparent auto-formatter/IDE-scan touch (10.6) - a
    file changed outside the explicit action just taken. Lesson: before
    any `git status`/commit check, assume background tooling (linter,
    formatter, IDE scanner) may have touched files outside the current
    task; diff before trusting status, every time, not just when something
    looks wrong.

---

## 11. Coverage Hardening - prepared, NOT YET RUN

A reusable per-file coverage-gap-fix prompt template was designed (during
the wait period) but no file has actually been processed with it yet -
this section exists so a future session doesn't assume any coverage work
happened.

**Key discipline built into the template, worth preserving if this is
picked up later:** a new test is only acceptable if it asserts something
specific about correct behavior (a real value, a specific thrown error,
a specific side effect) - not merely that a line executes without
throwing. Coverage percentage was explicitly NOT the goal; genuinely
untestable lines (dead code, defensive-only branches) should be logged as
`SKIPPED - not meaningfully testable because [reason]`, not padded with a
fake test just to paint the line green. This mirrors the same
confident-wrong-vs-honest-unknown discipline from Section 10.5, applied to
coverage metrics specifically: a green coverage line that didn't actually
verify anything is a metrics-flavored version of the same fabrication bug.

**Template also specifies:** one file = one commit for the test addition,
a separate commit for logging the entry to a new (not-yet-created)
`## Coverage Hardening Log (pending condensation)` section at the end of
this doc, in raw table form (File | Lines targeted | Before | After |
Commit | What was tested/why skipped) - explicitly NOT meant to be polished
prose, to be reviewed and condensed into the main doc sections (or deleted)
only once a full coverage pass is complete.

**Status: template applied to multiple files.** The raw per-file log the
template produces is kept below in its original unpolished table form, as
specified — not yet condensed into prose, not yet deleted. Treat every row
as a discrete, independently-committed change; do not assume adjacent rows
share a commit.

---

## 12. SonarQube Remediation - in progress, 33 real issues, 0 fixed as of this doc update

**Source of truth:** SonarQube's own `api/issues/search` endpoint, queried
directly, 33 open issues, effort total 260min, as of 2026-07-11. This is
the authoritative issue list - a Perplexity-generated prompt set based on
a manual read of the dashboard was checked against this real data and
found to have missed 12 of the 33 issues, including the single
BLOCKER-severity issue. Do not use that earlier prompt set; use the
corrected inventory below.

### 12.1 Full issue inventory (33, real line numbers)

| #   | Severity | Rule  | File:Line                                              | Issue                                                                                                                                                           |
| --- | -------- | ----- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | BLOCKER  | S2699 | tests/commands/bc2-sync.coverage-additions.test.js:154 | Add at least one assertion                                                                                                                                      |
| 2   | CRITICAL | S2871 | src/storage/run-migrations.ts:22                       | Sort needs localeCompare comparator                                                                                                                             |
| 3   | CRITICAL | S3776 | src/storage/symbol-extractor.ts:39                     | Complexity 21->15                                                                                                                                               |
| 4   | CRITICAL | S3776 | src/storage/symbol-extractor.ts:109                    | Complexity 17->15                                                                                                                                               |
| 5   | CRITICAL | S3776 | src/storage/symbol-extractor.ts:170                    | Complexity 44->15                                                                                                                                               |
| 6   | CRITICAL | S3776 | src/agents/tool-call-classifier.ts:22                  | Complexity 16->15                                                                                                                                               |
| 7   | CRITICAL | S3776 | src/llm/gateway.ts:77                                  | Complexity 31->15                                                                                                                                               |
| 8   | CRITICAL | S3776 | src/shared/retrieval/code-search.ts:85                 | Complexity 16->15 - same function verified in Section 10.1 for its exit-code-1 no-match logic; any refactor must preserve that logic exactly                    |
| 9   | MAJOR    | S5914 | tests/secret-store.test.js:253                         | Assertion always succeeds/fails                                                                                                                                 |
| 10  | MAJOR    | S7785 | src/storage/run-migrations.ts:74                       | Prefer top-level await                                                                                                                                          |
| 11  | MAJOR    | S5843 | src/agents/tool-call-classifier.ts:106                 | Regex complexity 26->20                                                                                                                                         |
| 12  | MAJOR    | S6582 | src/agents/cli.ts:91                                   | Prefer optional chaining                                                                                                                                        |
| 13  | MINOR    | S4323 | src/agents/tool-call-measurement-log.ts:9              | Union type -> type alias                                                                                                                                        |
| 14  | MINOR    | S6594 | src/installer/hw-probe/hwProbe.ts:81                   | Use RegExp.exec()                                                                                                                                               |
| 15  | MINOR    | S7773 | src/installer/hw-probe/hwProbe.ts:83                   | Number.parseFloat                                                                                                                                               |
| 16  | MINOR    | S7773 | src/installer/hw-probe/hwProbe.ts:108                  | Number.parseInt                                                                                                                                                 |
| 17  | MINOR    | S4325 | src/installer/hw-probe/hwProbe.ts:109                  | Unnecessary assertion                                                                                                                                           |
| 18  | MINOR    | S7773 | src/installer/hw-probe/hwProbe.ts:144                  | Number.parseInt                                                                                                                                                 |
| 19  | MINOR    | S7773 | src/shared/retrieval/repository-id.ts:25               | Number.parseInt                                                                                                                                                 |
| 20  | MINOR    | S1128 | src/agents/sub-agent.ts:9                              | Unused import ToolCallClass                                                                                                                                     |
| 21  | MINOR    | S6353 | src/agents/tool-call-classifier.ts:116                 | [A-Za-z0-9_] -> \w                                                                                                                                              |
| 22  | MINOR    | S1128 | src/llm/gateway.ts:43                                  | Unused import estimateTokens                                                                                                                                    |
| 23  | MINOR    | S6594 | src/llm/gateway.ts:136                                 | Use RegExp.exec()                                                                                                                                               |
| 24  | MINOR    | S6594 | src/llm/gateway.ts:181                                 | Use RegExp.exec()                                                                                                                                               |
| 25  | MINOR    | S1128 | src/agents/tools/read-file.ts:2                        | Unused import path                                                                                                                                              |
| 26  | MINOR    | S1128 | src/shared/retrieval/router.ts:12                      | Unused import path                                                                                                                                              |
| 27  | MINOR    | S2486 | src/shared/security/safe-path.ts:8-10                  | Handle exception or don't catch - 1h effort, highest single cost in the batch; security-adjacent filename; treated as higher-risk than its MINOR label suggests |
| 28  | MINOR    | S7786 | src/shared/retrieval/vector-client.ts:70               | Error -> TypeError                                                                                                                                              |
| 29  | MINOR    | S6551 | src/accounts/profile-manager.js:18                     | Object -> string coercion                                                                                                                                       |
| 30  | MINOR    | S6551 | src/security/security-overview/auto-scan.ts:44         | Object -> string (f["type"])                                                                                                                                    |
| 31  | MINOR    | S6551 | src/security/security-overview/auto-scan.ts:44         | Object -> string (f["path"])                                                                                                                                    |
| 32  | MINOR    | S6551 | src/security/security-overview/auto-scan.ts:44         | Object -> string (f["message"]/f["title"])                                                                                                                      |
| 33  | INFO     | S1135 | src/shared/retrieval/router.ts:125                     | Complete TODO comment                                                                                                                                           |

Rows 30-32 share one line - fix as a single commit, not three.

### 12.2 Lane split - by actual risk, not just Sonar's severity label

| Lane                                                                 | Issues                                              | Rationale                                                                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Local/mechanical (safe for a small quantized local model, e.g. Qwen) | #13-26, #28-33 (20 issues)                          | Single, pre-resolved, mechanical transformations - no judgment call required.                                                              |
| Escalate (needs a stronger model or manual review)                   | #1-12, plus #27 despite its MINOR label (13 issues) | Complexity refactors, test-assertion integrity, sort/await/exception-handling behavior changes in load-bearing or security-adjacent files. |

**Explicit warning carried forward for issues #1 and #9 (the two
test-assertion issues):** do NOT resolve these by adding a trivially-true
assertion (`expect(true).toBe(true)`, `.toBeDefined()`) just to satisfy the
linter - that produces a green check on a test that still verifies
nothing, which is the exact confident-wrong pattern from Section 10. Either
add an assertion that would actually fail if real behavior broke, or
explicitly state the test is structurally pointless and should be
deleted/rewritten, and say which.

### 12.3 Status as of this doc update

Zero of the 33 issues have been fixed. No commits exist yet for any Sonar
remediation. A corrected, MCP-tool-routed prompt template exists (see
Section 14 below for a required correction to it) but has not been run
against a single issue.

---

## 13. MCP Server Environment Bug - DATABASE_URL not reaching VS Code-launched sessions - FIXED

### 13.1 Discovery

While smoke-testing the retrieve MCP tool in symbol mode
(`retrieve("ToolCallClass", mode: "symbol")`) from the VS Code-connected
unified-theatre-local-llm MCP session, the call failed with:

```
Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
```

### 13.2 Root cause (confirmed via literal pasted evidence, not inferred)

1. `symbol-search.ts` constructs its Postgres pool with only
   `new Pool({ connectionString: process.env.DATABASE_URL })` - no
   fallback, no explicit password field.
2. `src/mcp/server.ts` never loaded `.env` (no dotenv import at all,
   confirmed via full-file read).
3. `.env` exists at repo root and does contain a valid DATABASE_URL
   (confirmed present, confirmed gitignored - see Section 5).
4. VS Code's MCP launcher config (`.kiro/settings/mcp.json` and
   `.claude/mcp.json`, identical) sets an explicit "env" block containing
   exactly 4 variables (VSCODE_ROTATOR_LLM_ENDPOINT,
   VSCODE_ROTATOR_LLM_MODEL, PROJECT_ROOT, SESSION_LOG_PATH) - this
   block replaces the process's environment for the launched server,
   and VS Code itself does not source .env/.bashrc, so DATABASE_URL
   never reached the process.
5. Result: `process.env.DATABASE_URL` was undefined at the moment
   `symbol-search.ts`'s module-level `new Pool(...)` evaluated (this
   happens at import time, via the chain server.ts -> tool-handlers.ts
   -> router.ts -> symbol-search.ts), producing the SASL error.

Same failure category as the cron PATH= bug in Section 9.6 - a
background/child process not inheriting what an interactive shell takes
for granted - just a different launcher (VS Code's MCP client instead of
cron) and a different fix shape (dotenv-in-process instead of an explicit
PATH= line).

**Why this matters beyond inconvenience:** every retrieve(mode: "symbol")
call made from a VS Code-connected agent session was failing silently into
an error the caller had to interpret - and per the open question in
Section 13.5 below, it's not yet confirmed whether those failed calls were
distinguishable in tool-call-measurement-log.json from a real successful
symbol lookup.

### 13.3 Fix - DONE, committed 3252daa1

- npm install dotenv (confirmed landed under "dependencies", version
  ^17.4.2, not devDependencies).
- Added `import "dotenv/config";` as the literal first line of
  src/mcp/server.ts, before any other import - matches the existing
  pattern already used in ingest-repository.mjs /
  ingest-sprint-history.mjs (confirmed via grep before implementing, not
  invented fresh).
- Confirmed by design (not just assumed): dotenv/config's default
  behavior does not override an already-set env var, so terminal sessions
  that already export DATABASE_URL are unaffected - this only fixes the
  VS Code-launched path where the var was previously absent.
- npx tsc --noEmit --project tsconfig.json - clean, zero errors.
- Committed: 3252daa1, 3 files changed (package.json,
  package-lock.json, src/mcp/server.ts), +20/-5.
- Push status: unconfirmed - verify with `git log --oneline
origin/main..main` before assuming pushed.

### 13.4 Verified working post-fix

After a VS Code MCP server restart (required - env is only loaded at
process start), re-ran the smoke test:

- retrieve("ToolCallClass", mode: "symbol") -> succeeded, returned
  "ToolCallClass (type) at src/agents/tool-call-classifier.ts:16-20".
- search-code("ToolCallClass", glob: "src/agents") -> unchanged, still
  working (5 precise hits).

The Postgres-backed symbol index is now reachable from VS Code-launched
MCP sessions.

### 13.5 Open follow-ups from this bug - NOT YET DONE

1. Data-integrity question, unresolved: during the failed-state
   testing (Section 13.1, plus one earlier failed attempt from a different
   turn), retrieve(mode: "symbol") was called and failed multiple times.
   It is not confirmed whether recordToolCallForMeasurement() captures
   success/failure at all - if it only logs
   {toolName, args, classification, skippedGatewayAsk, timestamp} with no
   outcome field, these failed calls may be sitting in
   tool-call-measurement-log.json indistinguishable from real successful
   symbol-like hits, silently contributing toward the per-category
   readiness gate (Section 10.3) with bad data. Action needed: inspect
   recordToolCallForMeasurement()'s actual fields; if no success/failure
   marker exists, this is a real gap (same severity class as the Section 9
   root-cause bug) and the log entries from this debugging session should
   be identified and excluded/annotated, the same way the pre-source-field
   entries were handled in Section 9.5.
2. Separate, smaller issue, also unresolved: the searchCode MCP-layer
   error message observed during debugging -
   "Error: searchCode: rg failed (code 1):" with nothing after the colon
   - is opaque. Exit code 1 from rg means "no matches" (Section 10.1),
     which should be caught and returned as [], not surfaced as a bare
     failure with no detail. Worth a short, separate diagnostic pass; not
     blocking anything.

---

## 14. Real MCP Tool Inventory (verified via list-tools, corrects earlier assumptions)

Confirmed via the actual list-tools MCP call from a live VS Code session -
6 tools, matching the connection log's "Discovered 6 tools":

| Tool          | Params                                                                 | Notes                                                      |
| ------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| ask-local     | prompt (required), systemPrompt, workspaceId                           | Direct local-LLM call, no paid tokens.                     |
| code-review   | filePath (required), workspaceId                                       | Full review of one file via local LLM + project standards. |
| list-tools    | none                                                                   | Self-describing.                                           |
| vector-search | query (required), topK (1-20, default 5)                               | Semantic, over Qdrant.                                     |
| search-code   | pattern (required, ripgrep regex), glob (optional dir scope)           | Lexical/regex, works well when scoped with glob.           |
| retrieve      | query (required), mode (code/vector/file/symbol, optional), topK, glob | Auto-routing retrieval.                                    |

Also confirmed, not yet built: list-tools reports two planned-but-
unavailable tools: fix-sonar, run-sprint. If either appears available
in a future session, that's new - don't assume they exist without checking.

**Critical correction - retrieve does NOT support file:line query
syntax.** This was assumed in an earlier version of a prompt template this
session and is confirmed wrong:

- retrieve("sub-agent.ts:9") (auto mode) -> routes to code search
  internally, but the underlying searchCode call failed (rg failed
  (code 1)) - the ":9" is not parsed as a line number by anything in the
  chain.
- retrieve("sub-agent.ts:9", mode: "file") -> treats the entire string
  literally as a filename, producing ENOENT: no such file or
  directory, open '.../sub-agent.ts:9'.
- What actually works: retrieve(query, mode: "symbol") for an exact
  symbol name (requires the Postgres symbol index - see Section 13 for the
  bug that was blocking this until fixed), or search-code(pattern, glob)
  with a real regex pattern and a directory scope, which reliably returns
  precise file:line: content hits.

Any future prompt template that instructs an agent to call
retrieve("<file>:<line>") is wrong and needs to be corrected to use
either symbol-name retrieve or pattern-based search-code instead.
(This includes a Sonar-fix prompt template produced earlier in this same
session, before this correction was discovered - that template's Step 1
needs updating before it's used.)

---

## 15. Open Items - consolidated master list (supersedes partial lists in Sections 6 / 9.9)

| #   | Item                                                                                                         | Status                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Real production measurement-log accumulation                                                                 | In progress since 2026-07-10, still the long-running blocker                                                      |
| 2   | Distribution analysis + skipGatewayAsk widening decision                                                     | Blocked on #1, AND now also on per-category gate (Section 10.3) passing, not just the aggregate gate              |
| 3   | Verify 1a985ee2 (per-category gate) is pushed to origin/main                                                 | Unconfirmed - check first                                                                                         |
| 4   | Verify Section 10.5 doc bullet (confident-wrong convention) actually landed in Section 1                     | Unconfirmed - check first, see Section 10.6                                                                       |
| 5   | Verify the stray measurement-checkpoint.ts reformat (Section 10.6) was discarded, not accidentally committed | Unconfirmed - check first                                                                                         |
| 6   | RetrieveResult.matched field                                                                                 | Proposed only, not implemented, not confirmed by a human                                                          |
| 7   | 37-row test-gap backlog (Section 10.4)                                                                       | Logged, zero acted on - only act once a real fabrication bug is found                                             |
| 8   | Coverage hardening pass                                                                                      | **DONE** — 15 files processed, raw log in Section 11's Coverage Hardening Log table, not yet condensed into prose |
| 9   | SonarQube remediation, 33 issues                                                                             | Corrected inventory ready (Section 12), zero fixed                                                                |
| 10  | Local-lane Sonar prompt template's retrieve("file:line") calls                                               | Confirmed broken syntax (Section 14) - needs correction before use                                                |
| 11  | recordToolCallForMeasurement() success/failure field                                                         | Unknown whether it exists - check before trusting recent log entries (Section 13.5)                               |
| 12  | Possible measurement-log contamination from failed retrieve(symbol) debugging calls                          | Unresolved, depends on #11                                                                                        |
| 13  | Opaque "rg failed (code 1):" error message with no detail                                                    | Noted, not diagnosed, low priority                                                                                |
| 14  | DATABASE_URL / dotenv fix                                                                                    | Done, committed 3252daa1, verified working - push status per #3-style check needed                                |
| 15  | MCP tool inventory + retrieve query syntax                                                                   | Fully documented in Section 14, verified via live list-tools call                                                 |

---

## 16. State handoff for the next agent/session (supersedes Section 9.10)

**Do this first, before any other work, regardless of what task you're
asked to do:**

```bash
cd /home/pawan/vscodeagent/Solution
git status --porcelain
git log --oneline origin/main..main
grep -n "Confident-wrong vs. honest-unknown" unified-theatre-continuity-summary.md
```

This resolves open items #3, #4, #5 from Section 15 in one pass. Do not
assume any of them based on this doc's narrative - the doc is written from
the last known state at the time of writing, and at least two commits
(1a985ee2, 3252daa1) and one doc edit had unconfirmed push/commit
status when this revision was written.

**Do not re-run:**

- The Section 9.2 measurement-log diagnosis (resolved, shipped in
  51b648dd).
- The MCP tool layer audit (Section 10.1) - result was SAFE, don't
  re-audit from scratch; the two fragility notes are the only open threads
  from it.
- The DATABASE_URL/dotenv diagnosis (Section 13.2) - root-caused and
  fixed; if retrieve(symbol) fails again, check whether the fix is still
  present (`grep -n "dotenv" src/mcp/server.ts`) before re-diagnosing from
  scratch.

**Do not assume:**

- RetrieveResult.matched exists - it was proposed, never implemented.
- Any Sonar issue is fixed - zero commits exist for Section 12's inventory
  as of this doc update.
- Coverage hardening is complete or exhaustive - 14 files have been
  processed under the Section 11 template (raw log in that section), but
  this is a partial pass, not full coverage of every gap; don't assume
  files absent from that log were checked and found fine.
- retrieve supports file:line query syntax - confirmed it does not
  (Section 14).

**Immediately actionable, low-risk, no dependencies:**

- Section 15, item #11 - check whether recordToolCallForMeasurement()
  captures call success/failure. Quick to check, meaningfully affects
  trust in the per-category gate (Section 10.3) once real data arrives.
- Section 12's SonarQube local lane (20 mechanical issues) - corrected
  inventory is ready; just needs the retrieve("file:line") correction
  from Section 14 applied to whatever prompt template is used before
  running it.

**Still blocked, no action possible:**

- Item #1/#2 in Section 15 - genuinely time-gated on real production
  usage volume. Nothing to do here except wait and periodically check
  ~/.unified-ai-workspace/checkpoint-history.log.

---

## 17. Coverage Hardening Pass — ACTUALLY COMPLETE (corrects Section 11's "NOT YET RUN")

Section 11 stated this was "prepared, NOT YET RUN." That is now stale.
Confirmed via `git log --oneline origin/main..main` (real git history, not
narrated): the coverage-hardening pass ran to completion, 15 files, each
following the exact pattern specified in Section 11 (one `test:` commit +
one paired `docs: log coverage fix for X (pending condensation)` commit).

| File                                      | Test commit | Doc-log commit |
| ----------------------------------------- | ----------- | -------------- |
| src/agents/tools/retrieve.ts              | fea79ac4    | c6faf2b2       |
| src/storage/watcher.js                    | 1ed41516    | 82da7f57       |
| src/domain/schemas.js                     | 1d29348b    | 014ed8eb       |
| src/domain/types.js                       | bc005b22    | 1edfe80a       |
| src/agents/tool-call-measurement-log.ts   | 5b0ad8fb    | e66fb82c       |
| src/agents/tools/base.ts                  | 2df3ceaf    | 9a588e16       |
| llm.js                                    | 0263e68f    | e9d7f690       |
| src/.../workspace-approvals.ts            | 623543dd    | e0231a34       |
| src/.../workspace-quotas.ts               | a5f0b35d    | 2f858ed2       |
| src/llm/document-ingester.js              | c218f628    | bf95fc1c       |
| src/llm/embeddings.js                     | 7577cffc    | 6b7b8d77       |
| src/llm/experience-db.js                  | a9ddfedc    | 74b942cf       |
| src/llm/gateway.ts                        | c6d82070    | 5f5bda31       |
| src/llm/inference.js                      | c4013e06    | 9ae4c502       |
| src/knowledge/ingest/ingest-repository.js | cc63c061    | a2c11416       |

**Notable, worth remembering:** `src/domain/types.js` and
`src/agents/tools/base.ts` were correctly identified as NOT needing real
tests — the coverage-fix session excluded them from coverage entirely
(`base.ts` has no executable code, it's interface-only; `types.js` is an
ESM re-export barrel) rather than padding them with meaningless tests to
move a percentage. This is the Section 11 discipline working as intended —
honest "not testable" calls instead of fabricated coverage.

**Also confirmed in the same git range but unrelated to coverage work:**

- `9101caea` — Prettier reformatting only, no logic change (scripts + llm
  test files).
- `d074fdf3` — bundled CJS build artifacts updated.
- `327ba7c7` — a doc commit logging these as "pre-existing unstaged
  commits (build artifacts + formatting)" — worth reading directly if the
  provenance of `9101caea`/`d074fdf3` ever matters, rather than assuming
  from this summary.

**A `## Coverage Hardening Log (pending condensation)` section now exists
in the live repo's copy of this doc** (created by the coverage-fix
sessions per Section 11's template) — it is NOT reflected in this uploaded
copy's content above, since this doc was built by appending to an earlier
upload. **Before condensing anything, fetch the live file's actual current
content — do not assume this upload is authoritative for that section.**

---

## 18. SonarQube Remediation — Local Lane — 16 of 20 issues fixed, 4 needed no change

Corrects Section 12.3's "zero of the 33 issues have been fixed."

**Confirmed via real commit hashes (not narrated):**

| #     | file:line                      | Real commit | Note                                                                                                                                                                                                                                                      |
| ----- | ------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13    | tool-call-measurement-log.ts:9 | `9474e307`  | Extracted union to `ToolCallSource` type alias                                                                                                                                                                                                            |
| 14    | hwProbe.ts:81                  | `709a6309`  | `.match()` → `.exec()`                                                                                                                                                                                                                                    |
| 15    | hwProbe.ts:83                  | `bac78cd3`  | `Number.parseFloat`                                                                                                                                                                                                                                       |
| 16    | hwProbe.ts:108                 | `c7f2bdac`  | `Number.parseInt`                                                                                                                                                                                                                                         |
| 17    | hwProbe.ts:109                 | `11ea34b5`  | Removed `as GpuVendor` assertion                                                                                                                                                                                                                          |
| 18    | hwProbe.ts:144                 | `0798951b`  | `Number.parseInt`                                                                                                                                                                                                                                         |
| 19    | repository-id.ts:25            | `7345c1b2`  | `Number.parseInt`                                                                                                                                                                                                                                         |
| 20    | sub-agent.ts:9                 | `1fbb7ca6`  | Removed unused `ToolCallClass` import                                                                                                                                                                                                                     |
| 21    | tool-call-classifier.ts:116    | `911fba18`  | `[A-Za-z0-9_]` → `\w` (only the exact-match occurrence — a sibling `[A-Za-z_]` class at a different line was correctly left alone since it's not an exact match)                                                                                          |
| 22    | gateway.ts:43                  | `dd55754a`  | Removed unused `estimateTokens` import                                                                                                                                                                                                                    |
| 23    | gateway.ts:136                 | `589bfbc8`  | `.match()` → `.exec()`                                                                                                                                                                                                                                    |
| 24    | gateway.ts:181                 | `7d654198`  | `.match()` → `.exec()`                                                                                                                                                                                                                                    |
| 25    | read-file.ts:2                 | `f9042126`  | Removed unused `path` import                                                                                                                                                                                                                              |
| 26    | router.ts:12                   | `29cff7f7`  | Removed unused `path` import                                                                                                                                                                                                                              |
| 28    | vector-client.ts:70            | `d3b5171a`  | `Error` → `TypeError`                                                                                                                                                                                                                                     |
| 29    | profile-manager.js:18          | `00aed83f`  | Fixed to extract `.message` rather than a blind `String(error)` wrap — matches an existing pattern already used elsewhere in the codebase (`health.js`'s `String(err?.message ?? err)`) rather than inventing a new convention                            |
| 30-32 | auto-scan.ts:44                | none needed | **Already fixed** — the line already reads `String(f["path"] ?? "")\|${String(f["type"] ?? "")}\|${String(f["message"] ?? f["title"] ?? "")}`. Confirmed via direct read before attempting any edit — correct behavior, not a false "already done" claim. |
| 33    | router.ts:125                  | none needed | TODO reads "replace with real client id when available from the MCP transport layer" — correctly judged as an architectural change, not a one-line fix, and left in place per the prompt's own instruction not to delete unresolved TODOs.                |

**16 real fixes, 3 issues needed no code change (already correct), 1 TODO
correctly left alone.** All 20 local-lane issues are now accounted for —
none skipped without a stated reason.

### 18.1 Rule ID discrepancy in commit messages — flagged, not yet corrected

**The commit messages cite different Sonar rule IDs than the ones in the
authoritative `api/issues/search` JSON captured in Section 12.1.** Example:
issue #13's commit says `S1172`, but the live Sonar data says `S4323`.
This pattern repeats across nearly every local-lane commit (see table
below) — only issue #29's commit (`S6551`) matches the real rule ID.

| #           | Commit's rule ID | Real rule ID (Section 12.1) |
| ----------- | ---------------- | --------------------------- |
| 13          | S1172            | S4323                       |
| 14          | S3757            | S6594                       |
| 15,16,18,19 | S3790            | S7773                       |
| 17          | S1139            | S4325                       |
| 20,22,25,26 | S1481            | S1128                       |
| 21          | S5852            | S6353                       |
| 23,24       | S3757            | S6594                       |
| 28          | S3993            | S7786                       |
| 29          | S6551            | S6551 ✓                     |

**This looks like the rule IDs were recalled from general ESLint/SonarJS
knowledge rather than copied from the actual issue data supplied in each
prompt — the fixes themselves are correct, only the commit-message rule ID
labels are wrong.** Consequence: cross-referencing these commits against
the live SonarQube dashboard by rule ID will not line up. Not urgent to
amend the commits, but **do not trust the rule IDs in git history as
ground truth** — always check Section 12.1's table (or the live SonarQube
API) for the real rule ID if it matters for anything (e.g. confirming an
issue is actually resolved in SonarQube's own tracking).

---

## 19. SonarQube Remediation — Escalate Lane — all 13 context-gathering briefs complete, ZERO implemented

Corrects Section 12.3 for the escalate lane. All 13 of #1–12 and #27 were
run through the context-gathering prompts (continuity doc's
"escalate-lane-prefilled" set). **Every one correctly stopped without
writing replacement code**, per the prompts' own STOP instruction. None of
these are fixed — this section records the findings so a future
implementation session doesn't have to re-derive them.

### 19.1 Correction to an earlier assumption — gateway.ts:77 is NOT the skipGatewayAsk routing function

**This was my error in an earlier turn, not the agent's.** I had assumed
the CRITICAL complexity finding at `gateway.ts:77` was likely the
`gateway.ask()` / `skipGatewayAsk` routing logic, given its size (31→15)
and file. **It is not.** Direct verification found the flagged function is
`enforcePromptBudget(prompt, constraints?, workspaceContext?, userPrompt?)`
— a prompt-trimming function with a deliberately cascading, documented
trim strategy (drop workspace context → truncate tool result → preserve
user-prompt boundary via explicit param → marker-based fallback → fail-safe
pass-through untrimmed rather than risk losing user content).

**The actual `skipGatewayAsk` decision lives in `sub-agent.ts`'s
`executeToolCall()`**, which calls `classifyToolCall()` (the function
analyzed for issue #6, `tool-call-classifier.ts:22`). This was correctly
confirmed via `search-code(pattern: "skipGatewayAsk|gateway\\.ask|
classifyToolCall", glob: "src/llm/gateway.ts")` returning matches, cross-
checked against the actual function boundaries — not assumed.

**Practical effect:** `enforcePromptBudget`'s refactor is real CRITICAL
complexity work, but it is NOT coupled to the readiness-gate/
skipGatewayAsk decision the way I'd implied. Its own risk is about
correctly preserving the deliberate trim-order/fail-safe semantics (see
19.2 below), not about downstream classification data.

### 19.2 Per-issue findings (recommendations only — nothing implemented)

| #           | Issue                                                                                         | Finding / Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (BLOCKER) | `bc2-sync.coverage-additions.test.js:154` missing assertion                                   | Test is **structurally broken, not just missing an assertion** — `vi.doMock()` is called after the module is already statically imported, so it never actually intercepts anything, and the `active`-guard branch it's meant to exercise can never be reached (`runOnce()` completes synchronously in dryRun mode). **Recommendation: delete the test**, mark the `if (active) return` line with `/* v8 ignore next */` (matching the existing pattern on adjacent lines), since testing this branch properly would need an architectural change (exporting `runOnce` or adding an injectable delay) disproportionate to the risk.                                                                                                                                                                                                                                                                                                                                                                  |
| 27          | `safe-path.ts:8-10` ignored exception                                                         | The actually-flagged catch (lines 8-10) is a **cosmetic** fix — bind-and-ignore `err`, either use it in the message or switch to a bare `catch {}`. A **second, unflagged** catch block (lines 19-28) does something more security-relevant (swallows a `realpathSync` failure and falls back to non-symlink-resolved `path.resolve`) — analyzed and judged **defensible, not a confident-wrong bug**: the fallback still blocks string-based traversal via the downstream `path.relative` check; the only gap is a _valid_ (non-dangling) symlink inside root pointing outside root, which is an accepted, documented trade-off. Optional low-priority follow-up: add a `console.warn` when the fallback path is taken, for observability — not a correctness fix.                                                                                                                                                                                                                                 |
| 2           | `run-migrations.ts:22` sort comparator                                                        | Confirmed: only **one** migration file (`001_symbols_table.sql`) currently exists, so the bug is latent — default sort happens to work by accident today. Recommendation: add `.sort((a, b) => a.localeCompare(b))` before a second migration file is ever added. Low risk, not urgent given current state, but worth doing before it becomes load-bearing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3           | `symbol-extractor.ts:39` `walkSourceFiles`, complexity 21→15                                  | Cleanest single extraction: pull lines 66-70 (extension check + `isTestFile`/`isDeclarationFile` + push) into a `shouldIncludeFile(entry, fullPath): boolean` helper — drops ~6 points in one move. Two separate `try/catch` blocks (readdir vs. stat) are intentionally different (subtree-skip vs. single-entry-skip) — do not merge them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4           | `symbol-extractor.ts:109` `findTopLevelDeclaration`, complexity 17→15                         | Nested loop over `declarationList.declarations` (for multi-`const a=1,b=2` statements) is the only real nesting — extracting it into `findVariableDeclaration(stmt, name)` removes the nesting penalty cleanly. **No coupling** with the `walkSourceFiles` function from issue #3 (different domains: filesystem vs. AST). Note: raw visible branching only accounts for ~8 of the reported 17 points — likely Sonar counting `&&` operators (~3 more `&&`-bearing conditions present) plus possible line-number drift since last scan; worth re-confirming exact complexity before treating 17 as gospel.                                                                                                                                                                                                                                                                                                                                                                                          |
| 5           | `symbol-extractor.ts:170` `extractSymbolsFromFile`/`visit()`, complexity 44→15 (largest item) | Decomposes cleanly into one handler per declaration type (`handleFunction`, `handleClass`, `handleInterface`, `handleTypeAlias`, `handleEnum`, `handleExportedVariable`, `handleExportAssignment`), with `visit()` reduced to a thin dispatcher (est. ~12 post-refactor). **High-impact function** — feeds the Postgres `symbols` table that `retrieve(mode: "symbol")` depends on (Section 13). The `export const xTool = { async execute() {} }` object-literal-method extraction pattern (lines 210-214) is a **real, load-bearing pattern in this codebase**, not a theoretical edge case — breaking it would make tool methods unfindable via symbol search. Flagged as needing a dedicated focused session, not a quick pass; verification strategy given: compare `extractSymbolsFromFile()` output on a known file before/after, and spot-check the `symbols` table row count stays at the expected baseline (Section 8 material: ~1322 rows, per earlier doc content) after a fresh index. |
| 6           | `tool-call-classifier.ts:22` `classifyToolCall`, complexity 16→15                             | Only 1 point over threshold. Minimal fix: extract the `retrieve`-branch logic (lines ~62-84) into `classifyRetrieve(args)`, dropping the main function to ~11-12. **Confirmed this function's output feeds the per-category readiness gate directly** (Section 10.3/9.6) — any behavior change to what counts as `path-like`/`symbol-like`/`semantic` shifts real measurement-log data and could flip the gate's pass/fail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 7           | `gateway.ts:77` `enforcePromptBudget`, complexity 31→15                                       | See 19.1 correction above — NOT the skipGatewayAsk logic. Decomposes into 4 named steps (`tryDropWorkspaceContext`, `tryTruncateToolResult`, `tryPreserveUserPrompt`, `tryMarkerBasedFallback`). **Explicit risk flagged:** the deliberate trim-order and the "if no boundary can be found, pass through untrimmed rather than blindly truncate" fail-safe (documented in the function's own JSDoc as a considered rejection of blind end-truncation) must survive any refactor exactly — reordering or merging steps could silently change what gets preserved vs. cut.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8           | `code-search.ts:85` `searchCode`, complexity 16→15                                            | **Confirmed the exit-code-1 no-match branch (lines 125-131) is present and unchanged**, matching the audit from Section 10.1/13.5 exactly. Remaining complexity (~10 points) is spread across the JSON-line parsing loop and the outer try/catch, not concentrated in the verified branch. Recommendation: may extract the exit-code-1 handling into a named `handleRgExitCode()` helper for clarity, but its internal logic (the `&&` chain, the `.trim()` check) must not change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 9 (MAJOR)   | `secret-store.test.js:253` always-true assertion                                              | Confirmed: literal assertion is `expect(true).toBe(true)` — genuinely tautological, exactly the pattern flagged as forbidden. Real intended check (from test name/setup): verify the keytar adapter was actually used. Recommended real assertion: `expect(keytarStub.default.setPassword).toHaveBeenCalledWith("k-acct", "val", expect.anything())`. Explicitly warned against `expect(store).toBeDefined()`-style non-fixes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 10 (MAJOR)  | `run-migrations.ts:74` top-level await                                                        | Confirmed file is genuinely ESM (`"type": "module"` + `import.meta.url` usage). Confirmed only invoked directly via CLI, no other src file imports it. **Recommendation: leave as-is.** Converting to top-level await loses the custom `"Migration failed:"` error message unless wrapped in try/catch, which re-adds the nesting the "fix" was meant to remove — the promise-chain form is judged the correct idiomatic pattern for a CLI entry point, and S7785 here is a style preference, not a correctness issue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 11 (MAJOR)  | `tool-call-classifier.ts:106` regex complexity 26→20                                          | The flagged regex is a single 29-branch file-extension alternation. Two viable simplifications identified: split into 2-3 smaller alternation groups, or replace with a `Set`-based extension lookup (cleaner, zero regex complexity). **Real gap found: no existing test exercises this regex branch at all** — the one test that reaches `isRetrievePathLike()` with a path-like query short-circuits on the `/` check before ever reaching the regex. Explicitly flagged edge cases with zero coverage: bare filename with extension (`"config.json"`), bare filename without one (`"Makefile"`), and the specific anti-pattern the closed list exists to prevent (`"gateway.ask"` — a dotted identifier that must NOT match). **New tests are needed before any change here**, not after.                                                                                                                                                                                                       |
| 12 (MAJOR)  | `cli.ts:91` optional chaining                                                                 | Confirmed safe: `process.argv[1]` can only ever be `string \| undefined` per Node's own API contract — never `0`/`""`/`false` — so `&&` and `?.` are provably equivalent here with no edge case to worry about. Exact rewrite given: `process.argv[1]?.endsWith("cli.ts")`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

---

## 20. New infrastructure finding — `code-review` MCP tool is broken

Encountered during the escalate-lane runs for issues #3 and #4 (and
implicitly present for others): calling `code-review` returned
`"Command name mismatch: expected 'code-review', got 'Code Review
Pipeline'"` — a pipeline invocation/naming mismatch, not a per-file issue.
**The escalate-lane prompts correctly fell back to manual `sed`-based
analysis rather than stalling or fabricating output**, so no findings
above are compromised by this. Same general category of bug as the
Postgres/dotenv issue in Section 13 (a tool listed as available in
`list-tools`, per Section 14, that doesn't actually work end-to-end) — not
diagnosed yet, not blocking anything, worth a dedicated pass later.

---

## 21. Unpushed commits — HIGH PRIORITY, resolve before anything else

**As of this doc update, `git log --oneline origin/main..main` shows over
40 commits that have never been pushed to `origin/main`** — spanning the
per-category readiness gate (`1a985ee2`), the entire 15-file coverage pass
(Section 17), the dotenv/Postgres fix (`3252daa1`), the prior doc update
(`0e9ea839`), and all 16 real Sonar fixes from Section 18 (`9474e307`
through `00aed83f`). This resolves and supersedes the "push status
unconfirmed" notes throughout Sections 10, 13, 15, and 16 — the commits
exist and are real, they are simply not on the remote.

**This is now the single highest-priority action item in this document.**
A large amount of verified, tested work is sitting local-only. Run:

```bash
git push
```

and confirm with a follow-up `git log --oneline origin/main..main` that it
returns empty before doing anything else in this repo.

---

## 22. Open Items — consolidated master list v2 (supersedes Section 15)

| #   | Item                                                                                        | Status                                                                                       |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | **Push 40+ local commits to origin/main**                                                   | **Not done — do this first, see Section 21**                                                 |
| 2   | Real production measurement-log accumulation                                                | In progress, still the long-running blocker                                                  |
| 3   | Distribution analysis + skipGatewayAsk widening decision                                    | Blocked on #2 AND per-category gate passing                                                  |
| 4   | Doc bullet "confident-wrong vs honest-unknown" landed in Section 1                          | Still needs a fresh grep check against the LIVE file, not this upload                        |
| 5   | RetrieveResult.matched field                                                                | Still proposed only, not implemented                                                         |
| 6   | 37-row test-gap backlog (Section 10.4)                                                      | Still logged, zero acted on — act only once a real fabrication bug is found                  |
| 7   | Coverage hardening pass                                                                     | **DONE** — 15 files, see Section 17                                                          |
| 8   | SonarQube local lane (20 issues)                                                            | **DONE** — 16 real fixes + 4 no-change-needed, see Section 18                                |
| 9   | SonarQube escalate lane (13 issues)                                                         | **Context-gathered, ZERO implemented** — see Section 19 for the 13 ready-to-implement briefs |
| 10  | Rule-ID mismatch in local-lane commit messages                                              | Flagged, not corrected — see Section 18.1, don't trust commit-message rule IDs               |
| 11  | `code-review` MCP tool broken                                                               | New finding, not diagnosed — see Section 20                                                  |
| 12  | `recordToolCallForMeasurement()` success/failure field                                      | Still unknown whether it exists — unresolved from Section 13.5                               |
| 13  | Possible measurement-log contamination from earlier failed retrieve(symbol) debugging calls | Still unresolved, depends on #12                                                             |
| 14  | Opaque `"rg failed (code 1):"` error message with no detail                                 | Still noted, not diagnosed, low priority                                                     |
| 15  | DATABASE_URL / dotenv fix                                                                   | Done, `3252daa1`, verified working, now confirmed included in the unpushed batch (#1)        |

---

## 23. State handoff for the next agent/session (supersedes Section 16)

**Do this first, no exceptions:**

```bash
cd /home/pawan/vscodeagent/Solution
git push
git log --oneline origin/main..main   # must return empty after the push
git status --porcelain                 # must be clean
grep -n "Confident-wrong vs. honest-unknown" unified-theatre-continuity-summary.md
grep -n "Coverage Hardening Log" unified-theatre-continuity-summary.md
```

The last two confirm whether the doc bullet and the coverage log section
actually exist in the LIVE file — this uploaded copy cannot confirm that,
only the git history of commits referencing them.

**Do not re-run:**

- Any of the 20 local-lane Sonar issues (#13-26, #28-33) — all 20 are
  accounted for in Section 18, with real commit hashes for the 16 that
  needed changes.
- Any of the 13 escalate-lane context-gathering prompts — all 13 findings
  are recorded in Section 19.2. If implementing one of them, start from
  that table's recommendation, don't re-derive it from scratch.
- The coverage-hardening pass — complete, Section 17.

**Ready to implement, findings already gathered (Section 19.2), still
needs actual code changes + human/stronger-model review before merging:**

- All 13 escalate-lane issues. Highest-value next steps if picked up:
  - #1 (BLOCKER) — delete the broken test, add the `v8 ignore` comment.
  - #9 (MAJOR) — swap the tautological assertion for the real one given.
  - #11 (MAJOR) — write the missing regex-branch tests BEFORE simplifying
    the regex, per the explicit gap found.
  - #5 (CRITICAL, largest) — treat as its own session per the original
    recommendation; verify symbol-table row count before/after.

**New, not previously tracked:**

- Section 18.1's rule-ID mismatch — low priority, but don't trust commit
  message rule IDs against live SonarQube data without checking Section
  12.1 first.
- Section 20's broken `code-review` MCP tool — not diagnosed.

**Still blocked, no action possible:**

- Item #2/#3 in Section 22 — still genuinely time-gated on production
  volume.

---

## 24. Escalate-Lane Sonar Remediation — Complete (13/13) — Session of July 12, 2026

All 13 escalate-lane issues from Section 19.2 are now implemented,
verified, and committed (push status noted per tier below — confirm
`git log --oneline origin/main..main` is empty before treating any of
this as landed).

### Tier 1 — #1, #2, #10, #12 (trivial/safe)

- `57466d83` — #1 (BLOCKER): deleted structurally broken test in
  `bc2-sync.coverage-additions.test.js` (mock never intercepted, branch
  unreachable), added `/* v8 ignore next */` on the guard line.
- `0679c2ed` — #12: `cli.ts:91`, `&&` guard replaced with optional
  chaining (provably safe, `process.argv[1]` typed `string | undefined`).
- `0b66a3e5` — #2 + #10 combined (see note below): explicit
  `.localeCompare()` sort comparator added to `run-migrations.ts:22`;
  #10 (`S7785` top-level-await) resolved as **won't-fix**, documented
  inline with rationale rather than converted (would re-add try/catch
  nesting the rule is meant to remove) — mirrors the Sprint 88
  ACKNOWLEDGED-with-evidence pattern for Sonar hotspots.
- **Pushed**: `0b66a3e5` → origin.
- **Process note**: an initial 4-commit attempt included one genuinely
  empty commit (`--allow-empty`) for #10 after its content got silently
  folded into #2's commit. Caught before push via `git diff
origin/main..HEAD --stat` not matching the commit count; squashed
  down to 3 honest commits before pushing. Lesson already captured
  informally: **verify commit content against `git show`, not just
  commit _messages_ — a message can claim work a diff doesn't contain.**

### Tier 2 — #9, #11 (needed real assertions / new tests first)

- `e306f4ae` — #9 (MAJOR): `secret-store.test.js:253` tautological
  `expect(true).toBe(true)` replaced with a real mock-call assertion.
  **Load-bearing confirmed empirically**: source's `setPassword` call
  was temporarily broken, confirmed the new assertion actually fails (5
  tests), then reverted and reconfirmed pass — not just asserted, tested.
- `43bccf62` — #11 tests-first commit: added 3 edge-case tests
  (bare filename with/without extension, `"gateway.ask"` anti-pattern)
  against the **unmodified** 29-branch regex, confirmed green before any
  implementation change.
- `9deb1540` — #11 (MAJOR) implementation: 29-branch regex alternation
  replaced with `Set`-based extension lookup in
  `tool-call-classifier.ts` (complexity 26→lower). All 46 tests
  (43 original + 3 new) pass.
- **Pushed**: `9deb1540` → origin.

### Tier 3 — #3, #4, #8, #27 (extractions + cosmetic)

- `e90c307a` — #3: `shouldIncludeFile` extracted from
  `walkSourceFiles` in `symbol-extractor.ts` (complexity 21→15). The two
  intentionally-different `try/catch` blocks (subtree-skip vs.
  single-entry-skip) deliberately left unmerged.
- `9ff43810` — #4: `findVariableDeclaration` extracted from
  `findTopLevelDeclaration` (complexity 17→15).
- `873e1418` — #8: `handleRgError` extracted from `searchCode` in
  `code-search.ts` (complexity 16→13). One transient test failure
  ("No pending execFile call in queue") traced to a stale Vite cache,
  not the diff — confirmed via full manual diff review before trusting
  the "cache" explanation, not accepted on narration alone.
- `b53e3f65` — #27: unused `err` binding removed from the cosmetic
  catch block in `safe-path.ts:8-10` (bare `catch {}`). The second,
  unflagged catch block (lines ~22-31) deliberately left untouched —
  already judged defensible in Section 19.2.
- **Pushed**: `b53e3f65` → origin.
- **Recurring pattern this tier**: unscoped Prettier-only formatting
  commits kept appearing in the working tree at the _start_ of sessions
  (editor format-on-save firing on file-open), across
  `cli.ts`/test files, `tool-call-classifier.ts`/`gateway.ts`, and
  `secret-store.js`. Each time: diffed line-by-line to confirm zero
  logic change, then committed standalone with an explicit
  `style: ... (Prettier, no logic change)` message rather than folded
  into a Sonar-fix commit. **New standing pre-flight convention
  established**: `git status --porcelain -- . ':!unified-theatre-continuity-summary.md'`
  (excludes this doc, which is routinely mid-edit and not code).

### Tier 4 — #6, #7 (behavior-sensitive, feeds downstream systems)

- `89a7c6d1` — #6: `classifyRetrieve()` extracted from
  `classifyToolCall` (complexity 16→15). Verified via a full
  before/after characterization table on representative retrieve-branch
  inputs (path-like/symbol-like/semantic) — output feeds the
  per-category readiness gate directly, so behavior identity mattered
  more than test-green alone.
- `dbff6d27` — #7: `enforcePromptBudget` decomposed into
  `tryDropWorkspaceContext`/`tryTruncateToolResult`/
  `tryPreserveUserPrompt`/`tryMarkerBasedFallback` (complexity 31→15).
  **A real behavior-preservation bug was caught by characterization
  before commit**, not after: the initial extraction collapsed two
  distinct original behaviors into one `undefined`/`null` return —
  (a) "boundary found but doesn't fit budget" (original: leave
  `trimmedPrompt` untouched, fall through) and (b) "no `User request:`
  marker anywhere" (original: true fail-safe, discard all partial
  trimming and return the **pristine original `prompt` param**). Fixed
  via a discriminated return contract (`TrimStepResult`,
  `MarkerFallbackResult` — `{changed: true, prompt}` vs.
  `{changed: false}`, with step (d) additionally distinguishing
  `markerFound: true/false`). Root-caused by reading the original
  source's exact return statements line-by-line rather than trusting
  what "seemed" correct — the fail-safe returns `prompt`, not
  `trimmedPrompt`, which is the detail that made the fix correct.
- `adaaa309`, `a27ea2de`, `31438ff0` — three standalone Prettier-only
  formatting commits (`tool-call-classifier.ts`, `gateway.ts`,
  `secret-store.js` respectively), diffed line-by-line and confirmed
  inert before committing. One of these followed a Copilot session that
  crashed mid-edit on a network `Headers Timeout Error` after
  apparently re-running an already-completed patch from scratch;
  confirmed via full diff review that the only footprint left was
  reformatting, not a duplicated/clobbered edit.
- **Pushed**: `31438ff0` → origin.
- **New codified lesson**: for functions with a documented fail-safe or
  cascading-fallback design (like this one's "pass through untrimmed
  rather than blindly truncate" comment), a refactor's return contract
  must distinguish _why_ a step didn't change the prompt, not just
  _whether_ it did — collapsing "couldn't fit" and "no boundary exists
  at all" into the same signal silently merges two different original
  behaviors.

### Issue #5 — extractSymbolsFromFile/visit() (44→~12-15), own dedicated session

Run as an explicit two-phase session per this section's original
guidance (own session, not batched).

**Phase 1 (diagnosis only, no code changes)**: confirmed all 8 branches
in `visit()`, traced the full Postgres write path
(`extractSymbolsFromFile` → `indexSymbols()` in `symbol-indexer.ts` →
transactional DELETE + batched INSERT into `symbols` table, schema in
`001_symbols_table.sql`), characterized real output on 3 files
(`code-search.ts`: 4 symbols, `symbol-extractor.ts`: 14, `gateway.ts`:
25), and proposed 7 named handlers
(`handleFunction`/`handleClass`/`handleInterface`/`handleTypeAlias`/
`handleEnum`/`handleExportedVariable`/`handleExportAssignment`) with
`visit()` reduced to a thin dispatcher. Flagged the
`export const xTool = { async execute() {} }` object-literal-method
extraction pattern (inside the `isVariableStatement` branch) as
**genuinely load-bearing** — it's what makes tool methods discoverable
via symbol search, not a theoretical edge case.

**Phase 2 (implementation)** — `5f9aab22`: implemented exactly the
Phase 1 plan as pure code motion. Added a 4th characterization fixture
beyond Phase 1's three (`retrieve.ts`, exercising the object-literal-
method pattern specifically) — output unchanged before/after. All 4
characterization files matched exactly; 35/35 existing tests pass;
`tsc --noEmit` clean.

**The row-count "hard gate" investigation (worth preserving in full —
this is the actual interesting part of this session):**

The originally stated gate was "must equal 1322," inherited from
Section 8 material in this doc. A same-day reconfirmation via
`SELECT COUNT(*) FROM symbols` returned exactly 1322, which felt like a
clean baseline — but it was a **stale-table read**, not a fresh index of
current source. The table had not been reindexed since before Tiers 1-4
of _this same session_ landed, and those tiers added real new named
top-level symbols to files this extractor walks (`classifyRetrieve`,
`tryDropWorkspaceContext`, `tryTruncateToolResult`,
`tryPreserveUserPrompt`, `tryMarkerBasedFallback`, `handleRgError`,
`shouldIncludeFile`, `findVariableDeclaration`, plus two new type
aliases). Comparing a stale pre-Tier-1 table against a freshly-reindexed
post-Tier-4 refactor was never an apples-to-apples comparison, and the
first real reindex (post-refactor) surfaced as 1339 — a "+17 regression"
that was actually mostly-explained by unrelated prior work never having
been indexed at all.

Establishing a trustworthy comparison took several failed attempts,
each instructive:

- A `git stash`/reindex/`git stash pop` pre-vs-post comparison initially
  failed silently (SASL auth errors) because `$DATABASE_URL` wasn't
  actually exported in the shell context the command ran in — **this
  export does not reliably persist across separate terminal command
  invocations in this environment; re-export it explicitly at the start
  of any session needing DB access, don't assume a prior export in the
  conversation is still live.**
- Once fixed, a clean pre/post `indexSymbols()` comparison reproducibly
  showed **1334 → 1339, a stable +5**, matching the hand-predicted math
  (−2 removed inner functions, +7 new named handlers) exactly.
- A follow-up per-file diff script (Node object-key comparison of
  grouped SQL query results) produced **three different, mutually
  contradictory deltas across three attempts** (+8, then 14→11, i.e.
  −3, when every other method agreed on +5) — traced first to two
  untracked scratch files (`char-baseline.ts`, `check-row-count.ts`)
  surviving `git stash` (stash does not include untracked files by
  default) and being indexed as real source both "pre" and "post"; even
  after removing those, the script still didn't reconcile with the
  verified whole-DB total, and was abandoned as unreliable rather than
  further debugged — **out of scope for this sprint, not worth chasing.**
- Final trust basis: **two independent methods that agreed with each
  other and with hand-derived predicted math** — (1) direct
  `extractSymbolsFromFile()` calls with no DB involved (14→19 for
  `symbol-extractor.ts`, others unchanged), and (2) `indexSymbols()`
  full-repo reindex reproduced 4 separate times (stable 1334→1339). A
  single ad hoc verification script's output was explicitly **not**
  trusted as sufficient on its own after it contradicted itself twice.

**Codified lesson (candidate for the "Confident-wrong vs. honest-unknown"
family of rules already in Section 1):** a stored numeric baseline
(row count, coverage %, test count) used as a verification gate must be
**re-derived fresh, immediately before use, from the actual current
state being compared** — not read from documentation, and not read from
a table/artifact that predates other work landed earlier in the same
session. Sibling work in the same session can silently invalidate a
gate's stored value before the gate is even checked.

- **Commit**: `5f9aab22` — commit message itself documents the baseline
  discrepancy and resolution in full, so a future session reading
  `git log` doesn't need to redo this investigation.
- **NOT yet pushed** as of this doc update — confirm
  `git log --oneline origin/main..main` and push before treating Issue
  #5 as landed.

### Summary

All 13 escalate-lane issues (Section 19.2) implemented: #1, #2, #3, #4,
#6, #7, #8, #9, #10, #11, #12, #27 pushed to origin; #5 committed
locally (`5f9aab22`), pending push confirmation.

Two loose ends before this is fully closed:

1. Issue #5's commit (`5f9aab22`) isn't pushed yet. Once you've appended
   this section (and want to commit that doc edit too), run:
   ```bash
   git add unified-theatre-continuity-summary.md
   git commit -m "docs: log Tier 1-4 and Issue #5 escalate-lane completion"
   git push
   git log --oneline origin/main..main   # should be empty
   ```
2. The "must equal 1322" language referenced as a still-pending gate in
   Section 19.2's Issue #5 entry is now superseded — the current live
   baseline after Tiers 1-4 + Issue #5 is **1339**. Do not use 1322 as
   a future row-count gate; re-derive fresh from the current table state
   before any future reindex comparison.

That closes out the entire escalate-lane backlog — 13/13, real bugs
caught and fixed along the way rather than rubber-stamped.

## 25. SonarQube Remediation — Final 7 Issues + ReDoS Hotspot Batch — Session of July 13, 2026

Picked up the last 7 open SonarQube issues (the batch task-prompt-set
targeted at the local llama.cpp model) plus a full pass on the 8
`S5852` (ReDoS) security hotspots. Both are now closed. Two real
regressions were introduced and caught mid-session — logged in full
below since the catch pattern is the reusable part, not just the fix.

### 25.1 — Final 7 issues (Tasks 1–5, including the caller-identity TODO)

- **Task 1** (`S7785`, top-level await, `run-migrations.ts:79`) — clean
  mechanical fix, `.then/.catch` → `try { await ... } catch`.
- **Task 2** (`S3776`, `symbol-extractor.ts`, 44→15) — this function had
  _already_ been decomposed in Section 24's Issue #5 work (the 7-handler
  dispatcher). A fresh scan found one leftover point at a **different**
  line (16→15, `handleExportedVariable`'s object-literal-method loop) —
  extracted a small `extractObjectLiteralMethods` helper to close it.
- **Task 3** (`S3776`, `gateway.ts` `enforcePromptBudget`, 17→15) — see
  25.3, this one round-tripped through two real regressions before
  landing correctly.
- **Task 4 / 4b** (`S1135` TODO → real caller-identity threading) — the
  TODO at `router.ts:124` fed `recordDecision()`'s hash-chained audit
  receipt, not a log field, so a guessed fix was explicitly rejected in
  favor of gathering real context first (three rounds of `NEED_CONTEXT`
  before a correct 5-file threading plan: `server.ts` →
  `tool-handlers.ts` → `router.ts` for the MCP-client path,
  `sub-agent.ts` → `agents/tools/retrieve.ts` for the internal
  agent-loop path, via a synthetic `__callerIdentity` key injected only
  onto `retrieve`'s args so the other 3 shared-interface tools stay
  untouched). Fallback string intentionally changed from
  `"unknown-mcp-client"` to the more accurate `"unknown-caller"` since
  callers are no longer exclusively MCP clients.
- **Task 5** (`S6551` ×3, `auto-scan.ts:44`, toString coercion) — real
  root-cause fix (`asString()` typed helper using `typeof` guards), not
  a `String()` paper-over that would have silenced the rule without
  fixing the underlying `unknown`-typed fallback risk.

### 25.2 — Real regression #1: stale-scan false alarm, then two genuine bugs

A post-batch SonarQube scan appeared to show Tasks 3/4/5 **never
landed** — same issue `key`/`hash`/`updateDate` as pre-edit. Root cause
turned out to be a **stale scanner index**, confirmed via
`git status --porcelain` + direct `sed` of the live file content before
concluding anything was actually lost — worth naming as the right
instinct (verify against the filesystem, not against the tool's cached
output) even though the specific alarm was a false one this time.

The full test suite run that followed the re-scan surfaced two **real**
bugs, both introduced by Task 3/4's edits and both genuinely missed by
the "Made changes" / diff-shown confirmation at the time they were made:

1. **`gateway.ts` — undefined-prompt crash (9 test failures).** The
   guard-clause flattening in `enforcePromptBudget` changed
   `if (a.changed) { trimmedPrompt = a.prompt }` to an unconditional
   `trimmedPrompt = tryDropWorkspaceContext(...).prompt`, but
   `TrimStepResult` is a discriminated union where `.prompt` only
   exists on the `changed: true` branch — `changed: false` has no
   `.prompt` field at all. Result: `trimmedPrompt` went `undefined`,
   next `.length` check threw. Fixed by restoring the "keep prior value
   unless it truly changed" contract — first via a nested `if` (fixed
   the bug, but pushed complexity from 17 back up to **19**, since
   Sonar's nesting penalty came right back), then via a ternary
   (Sonar counts ternaries identically to `if` for nesting — no
   improvement), and only landed cleanly via **structural extraction**:
   a small `applyTrimStep()` helper called three times as a plain
   function call, which removes the branch from `enforcePromptBudget`'s
   own body entirely rather than just changing its syntax.
   Codified: _for this specific rule, only moving conditional logic out
   of the function reduces its counted complexity — reshaping the
   conditional in place (if → ternary) does not, regardless of how it
   reads._
2. **`tool-handlers.ts` — missing try/catch around `handleRetrieve`
   (1 test failure, unhandled rejection).** Task 4's edit dropped the
   try/catch that every sibling handler
   (`handleVectorSearch`/`handleSearchCode`) still has. Restored it, and
   gave the new `callerIdentity` parameter a default value
   (`"unknown-mcp-client"`) so the pre-existing single-argument test
   call sites kept compiling without needing their own edit.

- One legitimate (non-bug) test-drift fix alongside these: 3 assertions
  in `sub-agent.test.ts` updated to expect the newly-injected
  `__callerIdentity` key — this was Task 4b working as designed, not a
  regression.

### 25.3 — Real regression #2: reverted a fix by editing a stale copy

While fixing the `router.ts:95` ReDoS hotspot (see 25.4), the file was
re-copied into the editing scratch space from an **earlier upload**
(the pre-Task-4 version sent during the original TODO investigation)
instead of the already-fixed current file — silently clawing back the
caller-identity threading fix (TODO comment and
`"unknown-mcp-client"` hardcode came back) underneath the new regex
edit. Caught via a fresh SonarQube scan showing the S1135 TODO issue
re-open, confirmed by `grep` before re-fixing, and both fixes (identity
threading + ReDoS) reapplied together on top of the actual current
file. Named explicitly in-session as the same failure category as the
external coding model's earlier phantom-diff scare (Section start of
this doc's Task 4 history) — just self-inflicted this time: **always
confirm which copy of a file is the live one before treating an old
upload as an editing base, especially mid-session when a file has
already been fixed once.**

### 25.4 — ReDoS hotspot batch (`S5852`, 8 total → 0 remaining)

Worked through all 8 flagged regexes. None were fixed by pattern
alone — each was fuzz-verified (100k–400k random + adversarial inputs
per regex) against the **true original** implementation as ground
truth before being applied to the real file, after one early miss
showed why that discipline matters:

- **`router.ts:95`** (PascalCase heuristic) — the one genuinely
  dangerous regex in the batch: `/^[A-Z](?:[a-z]+|[A-Z][a-z]+)*$/`'s
  repeated group allows exponentially many ways to partition a run of
  lowercase letters across star-iterations (classic `(a+)+` shape), and
  this runs on every `retrieve()` query. **First fix attempt was wrong**
  — caught by fuzz test before delivery (1599/100k mismatches; the
  rewrite incorrectly accepted bare trailing-uppercase strings like
  `"AB"` that the original correctly rejects, because the `+` on the
  second alternative's `[a-z]+` is mandatory in the original but the
  rewrite used `[a-z]*`). Second attempt verified equivalent across
  100,025 cases, executes instantly on both attack shapes.
- **`sub-agent.ts:17`/`:113`** (arg-parsing / tool-call-marker regexes)
  — lower severity (quadratic, not exponential) lazy-`.*?` patterns.
  First replacement round (still regex, tightened character classes)
  cleared the exponential risk but **re-triggered the same rule at
  shifted line numbers**, because `S5852` is a static shape-matcher, not
  an ambiguity analyzer — any alternation/sequential-quantifier shape
  gets flagged regardless of provable boundedness. Second round removed
  regex entirely from both hot paths (hand-rolled `charCodeAt`/`indexOf`
  character scanning: `parseToolArgs` → `scanKey`/`scanValue`/
  `scanQuotedValue`/`scanUnquotedValue`; tool-call detection via
  `findToolCallMarker`), verified byte-identical to the true original
  regex behavior across 200,031 cases including malformed-input edges.
  This manual rewrite **introduced two new findings** of its own
  (`S7758`: `charCodeAt`→`codePointAt`; `S3776`: `parseToolArgs`
  complexity 22, over budget) — both fixed same-session, the complexity
  one via extracting `scanKey`/`scanValue`/etc. as named helpers,
  re-verified against the same 150k-case fuzz suite before touching the
  real file. Worth flagging as a general tradeoff: eliminating a
  regex-shape heuristic finding by hand-rolling logic can trade it for
  a complexity or API-style finding instead — not a free move.
- **`hwProbe.ts:81`** (`parseVramString`), **`vscode-learn-utils.js:62`**
  (`sanitizeFilename` dash-trim), **`test-runner.js:83`**
  (`toSnakeCase` underscore-trim) — none had real backtracking
  ambiguity (fixed-string alternation or anchored/maximal-run patterns);
  manually rewritten for consistency with the "restructure everywhere"
  decision. One self-caught slip here too: the first
  `vscode-learn-utils.js` edit left the actual vulnerable regex in
  place behind a comment claiming it had been replaced — caught on a
  post-edit sanity read, not shipped.
- **`git-monitor.js:30`** (`[ahead N, behind M]` bracket extraction) —
  manual rewrite initially missed that the original's
  `if (match?.[1])` guard is a _truthy_ check (empty-bracket case would
  skip the block), while the replacement only checked `!== -1`.
  Verified end-to-end against the real `parseStatusSummary` that an
  empty bracket produces identical `ahead=0, behind=0` output either
  way before accepting the fix as equivalent, rather than trusting the
  narrower reasoning alone.
- **`test-runner.js:228`** (`parseRobotErrors`) — the second genuinely
  risky pattern: three sequential unbounded `[^>]*` segments over XML
  input (polynomial blowup on many attributes/no match). Rewritten to
  scan per-tag using `indexOf(">")` boundaries so each search is bounded
  to a single tag's length rather than the whole file.

### 25.5 — Current state as of this update

**Issues (`/api/issues/search`): 2 open**, both new `S3776` findings
surfaced by the manual ReDoS rewrites, neither yet fixed:

- `hwProbe.ts:89` — complexity 18/15 (in the function containing the
  `parseVramString`-adjacent code touched during 25.4).
- `test-runner.js:269` — complexity 18/15 (in the function containing
  `parseRobotErrors`, touched during 25.4).

**Hotspots (`/api/hotspots/search`): 15 open**, all `TO_REVIEW`, none
from this session's ReDoS work — that batch is fully clear:

- **12× `S4036`** (unvalidated `PATH` env var) — `hwProbe.ts` (8),
  `encrypt.js` (3), `auth-capture.js` (1), `dependency-check-runner.ts`
  (1), `trivy-runner.ts` (1). Not yet reviewed this session; likely
  mostly false-positive for a local dev tool but each `child_process`/
  `exec` call site needs an actual look (pin to absolute binary path or
  explicit allowlist vs. mark Safe) rather than blanket suppression.
- **2× `S5332`** (`vector-client.ts:17-18`, http vs https) — not
  reviewed yet.
- **1× `S4790`** (`repository-id.ts:16`, weak hash algorithm) — not
  reviewed yet; likely a **mark-Safe** candidate if the hash is used as
  a stable ID/fingerprint rather than in an actual security context,
  but that needs confirming against the call site before deciding.

**Tests**: 5479/5479 passing as of the last full run (post all fixes in
25.1–25.4).

### 25.7 — Hotspot resolution: mark-Safe calls + the 7 remaining code fixes

Worked through all 15 open hotspots from 25.5. Two categories:

**Mark Safe (6, no code change), after reading real justification each time
rather than rubber-stamping:**

- `vector-client.ts:17-18` (`S5332`, http vs https) — `EMBEDDINGS_URL`/
  `QDRANT_URL` default to Docker-network service hostnames
  (`http://embeddings:8080`, `http://qdrant:6333`), not public endpoints;
  traffic never leaves the private container network, and both are
  already overridable via env var for deployments that do terminate TLS.
- `repository-id.ts:16` (`S4790`, weak hash) — confirmed from source that
  SHA-1 is used only as the RFC 4122 UUID-v5 hash step to derive a
  stable internal ID from `PROJECT_ROOT`, not for anything adversarial
  (no passwords/tokens/signatures) — this is literally what UUID v5
  specifies for this exact purpose.
- `auth-capture.js:114`, `encrypt.js:43` (`S4036`, PATH) — after being
  asked to upload `src/internal/paths.js` rather than guess at what
  `sanitizeEnvForSpawn()` (already called at every site here) actually
  does: confirmed it's a real, working filter — allowlists PATH entries
  by platform, rejects world-writable POSIX dirs, permits Windows
  Program-Files/Windows paths, with a `VSCODE_ROTATOR_ALLOW_PATH` escape
  hatch — not a no-op. Marked Safe with that read cited as the reason.

**Real code fixes (9), using the existing `sanitizeEnvForSpawn()` from
`src/internal/paths.js` rather than inventing a second mechanism:**

- `dependency-check-runner.ts:77`, `trivy-runner.ts:23` — neither
  `spawnSync` call passed an `env` at all (full unrestricted `PATH`
  inheritance). Added `env: sanitizeEnvForSpawn(process.env)` to both.
  Also added an explicit `import crypto from "node:crypto"` to both
  files while already touching them — both called `crypto.randomBytes(4)`
  with no import anywhere, outside their own `try` blocks. Verified this
  particular sandbox's Node 22 resolves a bare global `crypto` to the
  full `node:crypto` module (so it wasn't silently throwing here), but
  flagged it as fragile to rely on rather than confirmed-safe across
  Node versions, and fixed it defensively regardless.
- `hwProbe.ts` (6 sites: `nvidia-smi`, `lspci`, `sysctl` ×2,
  `system_profiler`, `powershell`) — same `env: sanitizeEnvForSpawn(...)`
  wiring. Before applying, explicitly checked whether reusing this
  existing allowlist would reproduce the naive-fixed-directory mistake
  flagged as a risk in 25.5's initial triage (a `System32`-only
  allowlist would have broken `tryNvidiaSmi()` on Windows, since NVIDIA
  installs to `C:\Program Files\NVIDIA Corporation\NVSMI`, not
  `System32`) — confirmed via a direct string-match test that
  `sanitizeEnvForSpawn`'s actual Windows logic already accepts any path
  containing "program files" (not just `System32`), so the concern from
  25.5 doesn't apply once the real, already-shipped filter is reused
  instead of a fresh guess.

### 25.8 — "Something is wrong": hotspot count stuck at 15 after fixes landed

After the code fixes above, a hotspot re-scan still showed 15 total, which
looked like a repeat of the earlier phantom-edit scare. It wasn't — it's
expected SonarQube behavior that got explained mid-session and is worth
recording here since it'll recur on any future hotspot batch: **security
hotspots never auto-clear from a code fix, unlike issues.** An issue is a
pattern the rule engine can mechanically confirm is now absent, so it
disappears on rescan. A hotspot is inherently a "needs human judgment"
finding — Sonar's static engine has no way to verify that a named helper
function in a different file (`sanitizeEnvForSpawn`) actually does what
it claims, so even a hotspot sitting on genuinely-now-safe code stays
`TO_REVIEW` until someone clicks **Mark as Reviewed → Safe** in the UI.
The 3 "new" hotspot keys that appeared in this rescan (at `hwProbe.ts`,
`dependency-check-runner.ts`, `trivy-runner.ts`) were the same call sites
getting fresh IDs because the surrounding lines shifted (new import
lines), not new distinct problems — confirmed by checking that the fix
was present at all 6 `hwProbe.ts` sites via `grep` before concluding
this. All 15 have since been reviewed and closed out in the SonarQube UI
(6 Safe, 9 Fixed) — 15/15 reviewed, 0 remaining.

### 25.9 — Commit + push

All 18 modified files (17 source/test + this doc) committed as 11
separate, individually-`git diff`-reviewed commits rather than one
mega-commit, matching this project's established convention from
Section 24. Grouped by logical unit of work rather than by file, since
several files (`sub-agent.ts`, `router.ts`, `hwProbe.ts`, `test-runner.js`)
were touched across multiple rounds this session (Task work, then ReDoS
fix, then complexity fix, then PATH fix in `hwProbe.ts`'s case) and
splitting a single file's cumulative diff across commits wasn't
practical — so each such file's full diff landed in the commit for
whichever purpose it was most associated with, noted in that commit's
message.

Pre-flight before committing: full test suite re-run (**5479/5479
passing**) and a `git diff --stat` sanity check specifically on
`test-runner.js` — flagged as worth checking because that file's edit
required normalizing CRLF→LF to edit cleanly, then restoring CRLF
before delivery, and a line-ending mismatch could have produced a
diff of hundreds of spurious changed lines. Confirmed clean: 136
insertions/28 deletions, proportionate to the two real extracted
helpers, not line-ending noise.

| #   | Commit                                                     | SHA        |
| --- | ---------------------------------------------------------- | ---------- |
| 1   | `fix(sonar): S7785 top-level await — run-migrations.ts`    | `1ddaf304` |
| 2   | `refactor(sonar): S3776 symbol-extractor.ts 16→15`         | `33f7b687` |
| 3   | `refactor(sonar): S3776 gateway.ts + undefined-prompt fix` | `e0d482af` |
| 4   | `feat/fix(sonar): MCP caller identity + PascalCase ReDoS`  | `5d5b39e4` |
| 5   | `feat/fix(sonar): agent caller identity + regex removal`   | `d3733bf9` |
| 6   | `fix(sonar): S6551 asString() helper, auto-scan.ts`        | `b0316167` |
| 7   | `fix(sonar): S5852 git-monitor.js + vscode-learn-utils.js` | `6e772737` |
| 8   | `fix(sonar): hwProbe.ts — ReDoS + complexity + PATH`       | `2329ebfe` |
| 9   | `fix(sonar): test-runner.js — ReDoS + complexity`          | `432830f2` |
| 10  | `fix(sonar): S4036 dependency-check-runner + trivy-runner` | `43959fb2` |
| 11  | `docs: continuity summary Section 25`                      | `520c9a1f` |

Pushed and verified with the same two checks used throughout this
project's history — both came back clean:

```
git log --oneline origin/main..main            # empty — all 11 commits on remote
git status --porcelain -- . ':!unified-theatre-continuity-summary.md'   # empty — clean tree
```

### 25.10 — Final state, this session closed

- **SonarQube issues**: 7 → 0
- **SonarQube hotspots**: 15 → 0 remaining `TO_REVIEW` (6 Safe, 9 Fixed,
  all reviewed in the UI — not just code-fixed, since hotspots don't
  auto-clear per 25.8)
- **New findings introduced mid-session by the manual ReDoS rewrites**:
  2 → both fixed same-session
- **Real regressions caught (not narrated, verified against the actual
  filesystem/test run)**: 2 in code (`gateway.ts` undefined-prompt crash,
  missing `tool-handlers.ts` try/catch) + 1 self-inflicted stale-file
  revert (`router.ts`, caught mid-fix) — all three fixed and confirmed
  via re-run, not assumed fixed from the diff alone.
- **Tests**: 5479/5479 passing.
- **Commits**: 11, pushed, verified against `origin/main` directly
  rather than trusted from the push output alone.

Nothing outstanding from this arc. Next open item for whoever picks
this repo up next is whatever a fresh SonarQube scan turns up from
this point forward — no known leftovers as of this update.

---

## 26. Rollout Slice Audit — 110a–110e (Symbol Retrieval Pipeline) — Session of July 14, 2026

### 26.0 What triggered this session

A Perplexity-generated set of prompt templates (originally uploaded under
this doc's filename by mistake — that upload actually contained the
templates, not this doc) proposed a slice-by-slice verification pass for
five rollout slices: 110a (schema/migrations), 110b (extractor/indexer),
110c (shared definition lookup), 110d (external surface wiring), 110e
(references table). Claude ran the audit live against the actual repo and
Postgres instance, one slice at a time, accepting only pasted command
output as evidence — same discipline as Section 1's verification standard.

### 26.1 — 110a: Postgres schema + symbols table + migration runner — DONE

Confirmed by direct inspection and live re-run:

- `001_symbols_table.sql` and `run-migrations.ts` match what Section 2
  already documented — no discrepancy found.
- First `psql`/runner attempt failed because `DATABASE_URL` was unset in
  the shell (not because anything was broken) — `export $(grep -v '^#'
.env | xargs)` resolved it.
- Live confirmed: `symbols` table exists, 1339 rows at time of check (see
  26.2 for why this differs from Section 2's "1322" and "1306" figures),
  `schema_migrations` correctly records `001_symbols_table.sql` applied
  2026-07-10, and the runner is idempotent across two consecutive runs
  (`Applied 0 new migration(s); 1 already up to date.` both times).

### 26.2 — 110b: TS symbol extractor + index one fixture — DONE (after a real gap was found and closed)

Extractor and indexer logic confirmed correct by inspection — matches
Section 2's description exactly (position-based dedup, batched 500-row
inserts, deterministic `repository_id` via `getRepositoryId()`).

**Gap found:** despite Section 2 documenting three separate live
verification runs (1306, then 1322, then this session's discovered 1339
symbols), **no reproducible entrypoint for `indexSymbols()` exists
anywhere in the repo.** `grep -rl "indexSymbols"` across `src/` and
`scripts/` matched only the function's own definition file, and
`package.json` has zero reference to indexing or symbols. Every prior
verified run was evidently a manual, untracked `node -e`/`tsx` one-liner —
correct each time, but not something a future agent (or Copilot/Codex)
could discover or re-run without already knowing the internals.

**Fix applied this session:** created `src/storage/run-indexer.ts` — a
small script that calls `indexSymbols(process.env.DATABASE_URL,
process.cwd())` and logs the result, with an explicit `DATABASE_URL not set` check (matching `run-migrations.ts`'s existing pattern). Ran it live:

```
Indexed 1358 symbols across 189 files.
```

against the same `repository_id` (`0d3cf5ba-6378-50fb-941f-416d434809bc`,
independently recomputed from `PROJECT_ROOT` and confirmed to match).
1339 → 1358 is a small, plausible increase consistent with source changes
since whatever session last ran the untracked version — not a red flag.

**Not yet done:** `run-indexer.ts` is not yet wired into `package.json`
`scripts` — see To-Dos.

### 26.3 — 110c: Shared symbol-definition lookup — DONE

No function literally named `findDefinition` exists anywhere (`grep -rln`
across `src/` and `tests/` returned nothing) — the real implementation is
`findSymbolDefinition()` in `src/shared/retrieval/symbol-search.ts`,
already referenced in Section 2's Retrieval Strategy paragraph. Confirmed
live: `findSymbolDefinition("indexSymbols")` correctly returned
`src/storage/symbol-indexer.ts:61-95` with the right signature.

**New limitation surfaced, not previously documented:** the query
(`select ... from symbols where name = $1`) has **no `repository_id`
filter**. Harmless today (one repo in the table), but would return
cross-repo matches if the `symbols` table ever holds more than one
repository's data. Not a blocker; added to To-Dos.

### 26.4 — 110d: Wire one external surface (MCP or harness) — DONE

Traced and directly verified the full live chain:

```
MCP server (src/mcp/server.ts, server.registerTool("retrieve", ...))
  → handleRetrieve() in src/mcp/tool-handlers.ts
  → retrieve() in src/shared/retrieval/router.ts
  → findSymbolDefinition() in src/shared/retrieval/symbol-search.ts
  → Postgres symbols table
```

Called `handleRetrieve()` directly (the exact function the registered MCP
tool invokes) with `{ query: "indexSymbols", mode: "symbol" }` and a mock
client identity — returned the correctly formatted MCP result
(`"indexSymbols (function) at src/storage/symbol-indexer.ts:61-95"`) with
correct `audit.decision-receipt` and `mcp.retrieve` logs.

**New finding, not previously documented:** there are **two parallel
"retrieve" tool implementations** — `src/agents/tools/retrieve.ts` (a
`Tool` object registered in `src/agents/tools/registry.ts`, used by the
harness/orchestrator layer) and the MCP server's own
`tool-handlers.ts`/`handleRetrieve()` path. Both independently call
`retrieve()` from `router.ts` and were each verified working live this
session, but they format/wrap results differently and live in separate
tool registries. Not a bug, but worth a deliberate decision (see To-Dos).

**Also found:** the harness (`npm run harness` → `ts-node
src/agents/cli.ts`) is currently **broken** — `ts-node` cannot resolve the
extensionless import `from "./orchestrator"` under this project's native
ESM config (`ERR_MODULE_NOT_FOUND`). Confirmed `npx tsx src/agents/cli.ts`
resolves and runs correctly (got as far as its command-not-found path for
`--help`, proving the orchestrator boots fine under the right runner).
This is a real, separate defect — see To-Dos. Also confirmed
`src/agents/cli.ts` has no `dotenv` import, unlike `src/mcp/server.ts` —
the harness currently only works because the invoking shell already has
`DATABASE_URL` exported.

### 26.5 — 110e: References table + `findReferences()` — NOT STARTED

Confirmed: only one migration file exists
(`src/storage/code-index-migrations/001_symbols_table.sql`); no
references-related migration. No `findReferences`, `references_table`, or
`code_references` symbol exists in `src/` or `tests/` (two grep hits were
noise from TypeScript's own bundled library under
`src/installer/hw-probe/node_modules/`, unrelated to application code).
Matches the intended plan — 110e was scoped to start only once 110a–110d
proved out, which they now have.

### 26.6 — Session summary table

| Slice | Verdict         | Notes                                                                                                                     |
| ----- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 110a  | **Done**        | No gaps found; idempotency re-confirmed live                                                                              |
| 110b  | **Done**        | Required creating `run-indexer.ts` — no entrypoint existed before                                                         |
| 110c  | **Done**        | Function name differs from spec (`findSymbolDefinition` not `findDefinition`) but is functionally equivalent and reusable |
| 110d  | **Done**        | Verified through the real MCP code path, not a simulated one                                                              |
| 110e  | **Not started** | As planned — correctly gated on 110a–110d                                                                                 |

---

## 27. Open Items — consolidated master list v3 (supersedes Section 22)

| #   | Item                                                                                                         | Status                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Push 40+ local commits to origin/main                                                                        | Carried from v2 — unconfirmed this session, re-check before anything else                                                       |
| 2   | Real production measurement-log accumulation                                                                 | Carried from v2 — still the long-running blocker                                                                                |
| 3   | Distribution analysis + skipGatewayAsk widening decision                                                     | Carried from v2 — blocked on #2 AND per-category gate passing                                                                   |
| 4   | Doc bullet "confident-wrong vs honest-unknown" landed in Section 1                                           | Carried from v2 — still needs a fresh grep check against the LIVE file                                                          |
| 5   | RetrieveResult.matched field                                                                                 | Carried from v2 — still proposed only, not implemented                                                                          |
| 6   | 37-row test-gap backlog (Section 10.4)                                                                       | Carried from v2 — still logged, zero acted on                                                                                   |
| 7   | SonarQube escalate lane (13 issues)                                                                          | Carried from v2 — per Section 24, now COMPLETE (13/13), this row can likely be closed; verify against Section 24 before closing |
| 8   | Rule-ID mismatch in local-lane commit messages                                                               | Carried from v2 — flagged, not corrected                                                                                        |
| 9   | `code-review` MCP tool broken                                                                                | Carried from v2 — per Section 20, still not diagnosed as of that section; re-check current status                               |
| 10  | `recordToolCallForMeasurement()` success/failure field                                                       | Carried from v2 — still unknown whether it exists                                                                               |
| 11  | Possible measurement-log contamination from earlier failed retrieve(symbol) debugging calls                  | Carried from v2 — still unresolved, depends on #10                                                                              |
| 12  | Opaque `"rg failed (code 1):"` error message                                                                 | Carried from v2 — still noted, not diagnosed, low priority                                                                      |
| 13  | **`npm run harness` broken under `ts-node`**                                                                 | **New, this session (26.4)** — fix: point `"harness"` script at `tsx`                                                           |
| 14  | **`src/agents/cli.ts` missing `dotenv` load**                                                                | **New, this session (26.4)** — harness silently depends on shell already having `DATABASE_URL` exported                         |
| 15  | **`src/storage/run-indexer.ts` not registered as an npm script**                                             | **New, this session (26.2)** — file exists and works, just not discoverable                                                     |
| 16  | **`findSymbolDefinition()` has no `repository_id` scoping**                                                  | **New, this session (26.3)** — latent multi-repo bug, harmless today                                                            |
| 17  | **Two parallel "retrieve" tool implementations** (`src/agents/tools/retrieve.ts` vs. MCP `tool-handlers.ts`) | **New, this session (26.4)** — both work, needs a consolidation decision                                                        |
| 18  | **No integration test for `indexSymbols()` against a real DB**                                               | **New, this session (26.2)** — existing tests mock `pg` entirely; this session's manual verification isn't CI-enforced          |
| 19  | **Slice 110e (references table + `findReferences()`) design**                                                | **New status, this session (26.5)** — confirmed genuinely not started, ready to begin now that 110a–110d are done               |

---

## 28. State handoff for the next agent/session (supersedes Section 23)

**Do this first:**

```bash
cd /home/pawan/vscodeagent/Solution
git status --porcelain    # confirm current tree state before touching anything
git log --oneline origin/main..main   # re-check item #1 above — still unconfirmed
```

**From this session (110a–110e audit), ready to act on immediately:**

- Fix the `harness` npm script (`ts-node` → `tsx`) — trivial, isolated, see 26.4.
- Add `import "dotenv/config";` to `src/agents/cli.ts` — trivial, isolated, see 26.4.
- Add `"index:symbols": "tsx src/storage/run-indexer.ts"` to `package.json` scripts — trivial, see 26.2.

**Needs a decision before implementing, not just a fix:**

- Whether to consolidate the two "retrieve" tool implementations (item #17) — this is a design choice, not a bug, don't "fix" it without deciding intent first.

**Ready to design, not yet started:**

- Slice 110e — references table schema + `findReferences()`. Nothing exists yet (26.5). Suggest treating as its own small-slice session per this project's established discipline (Section 1), rather than folding into an unrelated session.

**Do not re-run:**

- The 110a–110d verification itself — all four are confirmed Done this session with live pasted evidence (Section 26). Don't re-derive from scratch; if something regresses, diff against what's recorded in 26.1–26.4 first.

---

## To-Do List (added 2026-07-14, from the 110a–110e rollout audit — Section 26)

1. **Fix broken `harness` npm script.** `npm run harness` invokes `ts-node src/agents/cli.ts`, which fails to resolve the extensionless import `from "./orchestrator"` under Node's native ESM resolver. `npx tsx src/agents/cli.ts` resolves and runs correctly. Action: change the `"harness"` script in `package.json` from `ts-node` to `tsx`.

2. **Add `dotenv` loading to the harness entrypoint.** `src/agents/cli.ts` has no `dotenv` import, unlike `src/mcp/server.ts`. The harness currently only works because `DATABASE_URL` happens to already be exported in the invoking shell. Action: add `import "dotenv/config";` near the top of `src/agents/cli.ts`.

3. **Register `run-indexer.ts` as a discoverable npm script.** The file exists and works (verified live, Section 26.2) but isn't referenced in `package.json`. Action: add `"index:symbols": "tsx src/storage/run-indexer.ts"` to the `scripts` block.

4. **Scope `findSymbolDefinition()` to `repository_id`.** Currently has no `repository_id` filter — harmless with one repo in the table today, a latent cross-repo bug otherwise. Action: add `AND repository_id = $2`, passing the current repo's ID via `getRepositoryId()` at call sites.

5. **Decide on the two parallel "retrieve" tool implementations.** `src/agents/tools/retrieve.ts` (harness/orchestrator-facing) and the MCP server's `handleRetrieve()` path both independently call `retrieve()` from `router.ts` but format results differently and live in separate registries. Action: decide whether this is intentional or should be consolidated.

6. **Design and implement Slice 110e** (references table + `findReferences()`), now that 110a–110d are confirmed done. Nothing exists yet.

7. **Add an integration test for `indexSymbols()` against a real (or test) Postgres instance.** Current unit tests mock `pg` entirely — they prove SQL/control-flow correctness but never exercise a live database. This session's manual verification filled that gap ad hoc, not repeatably or CI-enforced.

---

## 29. Follow-Up Fixes — Items 1-4 Closed (Session continuation, July 13-14, 2026)

Immediately following the Section 26 audit, four items from that
session's To-Do list were fixed, each verified live and committed
separately per this project's small-slice discipline (Section 1).

### 29.1 — Item 1: Fix broken `harness` npm script — DONE, `c274d4af`

`package.json`'s `"harness"` script changed from `ts-node src/agents/cli.ts`
to `tsx src/agents/cli.ts`. Verified: `npm run harness -- --help` now fails
with the expected `Command file not found: .../.claude/commands/--help.md`
(proving the orchestrator boots and dispatches) instead of
`ERR_MODULE_NOT_FOUND`. Full suite: 5479/5479 passing (one transient
`code-search.test.ts` failure on the first run of two, traced to the
same pre-existing cache flakiness documented below in 29.5 — cleared on
re-run with zero code changes in between).

### 29.2 — Item 2: Add `dotenv/config` to `src/agents/cli.ts` — DONE, `70f263b1`

Added `import "dotenv/config";` as the first import, matching the
existing pattern in `src/mcp/server.ts`. Verified with `DATABASE_URL`
explicitly unset in the shell (`env -u DATABASE_URL npm run harness --
--help`) — still reached the same expected command-not-found error,
proving `.env` is now loaded by the script itself rather than depending
on the invoking shell already having the variable exported. Full suite:
5479/5479 passing.

### 29.3 — Item 3: Register `run-indexer.ts` as an npm script — DONE, `a57dc331`

Added `"index:symbols": "tsx src/storage/run-indexer.ts"` to
`package.json`. Verified live: `npm run index:symbols` produced
`Indexed 1358 symbols across 189 files.`, matching the last known count
exactly (no code changed between runs, so an identical count is the
correct result, not a red flag). Confirmed against Postgres directly:
`SELECT repository_id, count(*) FROM symbols GROUP BY repository_id`
returned the same `0d3cf5ba-6378-50fb-941f-416d434809bc` / `1358`.

### 29.4 — Item 4: Scope `findSymbolDefinition()` to `repository_id` — DONE, `944bde80`

Added a required `repositoryId: string` second parameter to
`findSymbolDefinition()` in `src/shared/retrieval/symbol-search.ts`; SQL
changed to `where name = $1 and repository_id = $2`. Updated the only
call site (`src/shared/retrieval/router.ts`'s `retrieve()`) to pass
`getRepositoryId()`. This function had zero test coverage before this
change (confirmed via a fresh `find`/`grep` pass, not assumed from
Section 26.3) — added 7 tests to `tests/shared/retrieval/symbol-search.test.ts`
(6 updated for the new signature + 1 new regression test asserting a
wrong `repository_id` returns `[]` even when the name matches), and
updated `tests/shared/retrieval/router.test.ts`'s stale single-argument
assertion.

**Real gap caught during this work, not narrated away:** the new
regression test initially failed against a case-sensitivity mismatch
(`stringContaining("AND repository_id = $2")` vs. the actual lowercase
`and` in the SQL) — fixed by correcting the test's expectation, not the
SQL. Separately, `npm test` failed once on `router.test.ts`'s stale
`toHaveBeenCalledWith("SubAgent")` assertion (missing the new second
argument) — fixed by importing the real `getRepositoryId()` in the test
and asserting against it directly, rather than a hardcoded string, so
the assertion can't silently drift out of sync with the real function
again.

**Live end-to-end verification, not just mocked-test evidence:**

```
DATABASE_URL="$DATABASE_URL" npx tsx -e "
import('./src/shared/retrieval/symbol-search.ts').then(async (m) => {
  const rows = await m.findSymbolDefinition('indexSymbols', '0d3cf5ba-6378-50fb-941f-416d434809bc');
  console.log('Correct repo_id result:', JSON.stringify(rows, null, 2));
  const wrongRepo = await m.findSymbolDefinition('indexSymbols', '00000000-0000-0000-0000-000000000000');
  console.log('Wrong-repo result (should be empty array):', JSON.stringify(wrongRepo));
  process.exit(0);
});
"
```

Correct `repository_id` → real row returned (`src/storage/symbol-indexer.ts:61-95`,
same as the original Section 26.3 finding). Bogus `repository_id` → `[]`,
even though the symbol name matches. This is the actual bug being fixed,
confirmed against live Postgres, not inferred from mocked tests alone.

Full suite after this change: 5480/5480 passing (one new test added),
confirmed twice across separate runs.

### 29.5 — Note: `code-search.test.ts` flakiness reconfirmed

The pre-existing flaky-test pattern already logged in Section 2 (and
now in the "Known pre-existing flaky tests" list) recurred once during
29.1's verification — one failing run, one clean run, zero code changes
between them. Consistent with the cache-related cause already
documented; not treated as new breakage.

### 29.6 — Summary table

| Item | Description                                        | Commit     | Status |
| ---- | -------------------------------------------------- | ---------- | ------ |
| 1    | `harness` npm script: `ts-node` → `tsx`            | `c274d4af` | Done   |
| 2    | `dotenv/config` load in `src/agents/cli.ts`        | `70f263b1` | Done   |
| 3    | `index:symbols` npm script for `run-indexer.ts`    | `a57dc331` | Done   |
| 4    | `findSymbolDefinition()` scoped to `repository_id` | `944bde80` | Done   |

All four pushed to `origin/main`; `git status --porcelain` confirmed
clean after each.

---

## 30. Open Items — consolidated master list v4 (supersedes Section 27)

| #   | Item                                                                                                     | Status                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Push 40+ local commits to origin/main                                                                    | Carried — unconfirmed whether this refers to commits predating this session; re-check          |
| 2   | Real production measurement-log accumulation                                                             | Carried — still the long-running blocker                                                       |
| 3   | Distribution analysis + skipGatewayAsk widening decision                                                 | Carried — blocked on #2 AND per-category gate passing                                          |
| 4   | Doc bullet "confident-wrong vs honest-unknown" landed in Section 1                                       | Carried — still needs a fresh grep check against the LIVE file                                 |
| 5   | RetrieveResult.matched field                                                                             | Carried — still proposed only, not implemented                                                 |
| 6   | 37-row test-gap backlog (Section 10.4)                                                                   | Carried — still logged, zero acted on                                                          |
| 7   | SonarQube escalate lane (13 issues)                                                                      | Carried — per Section 24, likely COMPLETE (13/13); verify before closing this row              |
| 8   | Rule-ID mismatch in local-lane commit messages                                                           | Carried — flagged, not corrected                                                               |
| 9   | `code-review` MCP tool broken                                                                            | Carried — per Section 20, not diagnosed as of that section                                     |
| 10  | `recordToolCallForMeasurement()` success/failure field                                                   | Carried — still unknown whether it exists                                                      |
| 11  | Possible measurement-log contamination from earlier failed retrieve(symbol) debugging calls              | Carried — still unresolved, depends on #10                                                     |
| 12  | Opaque `"rg failed (code 1):"` error message                                                             | Carried — still noted, not diagnosed, low priority                                             |
| 13  | ~~`npm run harness` broken under `ts-node`~~                                                             | **CLOSED, `c274d4af`** (Section 29.1)                                                          |
| 14  | ~~`src/agents/cli.ts` missing `dotenv` load~~                                                            | **CLOSED, `70f263b1`** (Section 29.2)                                                          |
| 15  | ~~`src/storage/run-indexer.ts` not registered as an npm script~~                                         | **CLOSED, `a57dc331`** (Section 29.3)                                                          |
| 16  | ~~`findSymbolDefinition()` has no `repository_id` scoping~~                                              | **CLOSED, `944bde80`** (Section 29.4)                                                          |
| 17  | Two parallel "retrieve" tool implementations (`src/agents/tools/retrieve.ts` vs. MCP `tool-handlers.ts`) | Open — needs a deliberate decision (consolidate or keep separate), not just a code fix         |
| 18  | No integration test for `indexSymbols()` against a real DB                                               | Open — existing tests mock `pg` entirely                                                       |
| 19  | Slice 110e (references table + `findReferences()`) design                                                | Open — confirmed not started (Section 26.5); recommend its own dedicated session per Section 1 |

---

## 31. State handoff for the next agent/session (supersedes Section 28)

**Do this first:**

```bash
cd /home/pawan/vscodeagent/Solution
git status --porcelain    # confirm clean before touching anything
git log --oneline origin/main..main   # re-check item #1 in Section 30 — still unconfirmed
```

**Closed this session — do not re-run:**

- Items 1-4 from the original To-Do list (harness runner, dotenv load,
  index:symbols script, repository_id scoping) — all four verified live
  and committed (`c274d4af`, `70f263b1`, `a57dc331`, `944bde80`). See
  Section 29 for full evidence. If something regresses, diff against
  Section 29's recorded evidence first rather than re-deriving from
  scratch.

**Needs a decision before implementing, not just a fix:**

- Item #17 (Section 30) — the two parallel "retrieve" tool
  implementations. Don't consolidate or "fix" this without first
  deciding whether the duplication is intentional.

**Ready to act on next, similar scope to what was just closed:**

- Item #18 — add a real integration test for `indexSymbols()` against a
  live (or test) Postgres instance. Current tests mock `pg` entirely.

**Ready to design, not yet started, recommend its own session:**

- Item #19 — Slice 110e (references table + `findReferences()`).
  Nothing exists yet.

**Still blocked, no action possible:**

- Items #2/#3 in Section 30 — still genuinely time-gated on production
  volume.

---

## 32. Finding — Milvus/Qdrant migration incomplete; violates `docs/standing-rules.md` (discovered during Item #17 investigation, July 14, 2026)

### 32.0 How this was found

While deciding Section 30/Item #17 (the two parallel "retrieve" tool
implementations), the investigation extended to the RAG/vector-search
layer to check whether the duplication pattern was isolated or systemic.
That check surfaced a separate, more serious issue with the knowledge
ingestion pipeline, unrelated to the original #17 question. Logged here
as its own item rather than folded into #17.

### 32.1 The rule being violated
docs/standing-rules.md:4:- Qdrant is the only supported vector store; Milvus is not permitted.
This is an explicit, unambiguous project rule. It is currently violated
by several parts of the live codebase.

### 32.2 Evidence — what's actually in the repo right now

| Component | Status |
| --- | --- |
| `docs/standing-rules.md` | States Milvus is not permitted |
| `package.json` dependencies | Still lists `@zilliz/milvus2-sdk-node` |
| `.env.example` | Still configures `MILVUS_ADDRESS=localhost:19530` (no `QDRANT_URL` shown to a new developer) |
| `src/knowledge/ingest/milvus-client.ts` (+ committed `.js` build output) | Real, working Milvus client code — `MilvusClient` from the banned SDK |
| `src/knowledge/ingest/ingest-repository.js` / `ingest-sprint-history.ts`+`.js` | Real, tested ingestion pipelines (Sprint 91, coverage-tracked, commit `cc63c061`) — both call `ensureKnowledgeCollection()` from the Milvus client |
| `src/knowledge/index.ts` | Publicly re-exports the **Milvus** version of `ensureKnowledgeCollection`, not the Qdrant one |
| `src/llm/qdrant-client.ts` | The intended Qdrant replacement — comment literally states "Qdrant vector store replacing Milvus for RAG." Implements matching `ensureKnowledgeCollection()` and `upsertChunks()`. **Confirmed via `git log` to be untouched since Sprint 98/99 (`c0ac1404`, `0339900a`) — dead code, never wired into `src/knowledge/index.ts` or anything else.** |
| `src/shared/retrieval/vector-client.ts` | The actual **live, working** query path — talks to Qdrant directly via its own inline `fetch()` calls, bypassing `qdrant-client.ts` entirely. This is what `retrieve()`/`vectorSearchTool`/`handleVectorSearch` all actually use. |
| Live Qdrant instance (confirmed via `curl http://localhost:6333/collections`) | Running, and already contains a collection named `knowledge_chunks` — matching the `KNOWLEDGE_COLLECTION` constant in both `qdrant-client.ts` and the old Milvus client |
| Milvus (port 19530) | Confirmed **not running** (socket connect test failed) |

### 32.3 The unresolved question

The live `knowledge_chunks` Qdrant collection contains real data. **No
ingestion code currently in this repo could have put it there** —
`src/knowledge/ingest/*` targets Milvus (not running, and forbidden per
standing-rules.md), and `qdrant-client.ts` (the only code that could
write to Qdrant) is confirmed dead/unwired. The data's actual origin —
a manual one-off script, a since-deleted ingestion path, an out-of-repo
process — is not determinable from the current codebase and git
history alone. Not resolved this session; flagged for whoever has
institutional memory of how that collection was populated.

### 32.4 Supporting evidence from project docs (corroborates, doesn't resolve)

- `docs/ARCHITECTURE_INDEX.md:123` — describes `vector-client.ts` as
  "Vector search via Qdrant + embeddings (added Sprint 106)," consistent
  with 32.2's finding that this is the real live path.
- `docs/mcp-client-verification-sprint107.md:156,168` — documents a
  Sprint 107 test run where `vector-search` failed with
  `Error: fetch failed` because Qdrant wasn't running at the time —
  independent historical confirmation that Qdrant (not Milvus) is the
  system the live tools actually depend on.
- No `docs/*.md` file mentions `qdrant-client.ts` by name or references
  `upsertChunks`/its `ensureKnowledgeCollection` — consistent with it
  having been written but never integrated or documented as in-use.

### 32.5 Options, not yet decided

1. **Finish the migration** — rewire `src/knowledge/index.ts` to import
   from `src/llm/qdrant-client.ts` instead of the Milvus client; remove
   `@zilliz/milvus2-sdk-node` from `package.json`; remove
   `MILVUS_ADDRESS` from `.env.example`; retire or rewrite
   `src/knowledge/ingest/milvus-client.ts` and its committed `.js`
   build artifact. Brings the repo into compliance with its own
   standing rule. Non-trivial: the existing Milvus ingestion pipelines
   (`ingest-repository.js`, `ingest-sprint-history.ts`) have real,
   coverage-tracked test suites from Sprint 91 that would need
   re-targeting or rewriting against Qdrant's `upsertChunks()` API
   shape, not just a find-and-replace.
2. **Revert or amend the standing rule** — only appropriate if Milvus
   is still intentionally in use for some reason not evident from the
   code (e.g. a parallel/legacy path kept deliberately). Nothing found
   this session supports this; the rule's own wording and the
   commit-history evidence both point to Qdrant being the intended
   sole system.
3. **Leave as-is short-term, flag prominently** — lowest-risk immediate
   choice, but leaves a documented rule violation and dead/duplicated
   code sitting silently in the repo, plus a misleading `.env.example`
   that would send a new developer down the wrong path entirely.

No option selected yet — this is logged as a finding for a decision,
not an authorization to act.

### 32.6 Also found, smaller, same area

- Committed `.js` files alongside `.ts` sources in
  `src/knowledge/ingest/` (`milvus-client.js`/`.ts`,
  `ingest-sprint-history.js`/`.ts`) appear to be committed build
  output — not confirmed whether intentional or accidental. Separate
  small hygiene question, not investigated further this session.
- `ingest-repository.js` has no `.ts` counterpart at all (unlike the
  other two pairs) — unclear if it was always JS-authored or if its
  `.ts` source was deleted at some point. Not investigated further.


---

## 33. Decision — Item #20 resolution plan (Milvus/Qdrant migration)

Following Section 32's finding, a decision was made on how to resolve
the standing-rules.md violation. Of the three options logged in 32.5,
**Option 1 (finish the migration) was selected**, but phased rather
than done as a single change, to avoid the same kind of
assumption-driven risk this project's verification discipline exists
to prevent.

### 33.1 Why phased, not a single pass

- The Sprint 91 Milvus ingestion code has real, tracked test coverage
  (81-94%, commit `cc63c061`) — rewriting it against Qdrant's
  `upsertChunks()` API shape in the same pass as removing the
  dependency would conflate a low-risk cleanup with a genuine
  migration, and risks the rewrite being done under pressure to "just
  make it work" rather than properly re-verified.
- The origin of the live `knowledge_chunks` Qdrant data (Section 32.3)
  is still unresolved. Deleting the Milvus ingestion path before that
  mystery is settled risks removing the only clue to how that data was
  actually produced, if it turns out to matter later.

### 33.2 Phase 1 — Quarantine (low-risk, no logic changes)

Scope: fix the misleading setup surface only. Does not touch
`src/knowledge/ingest/*` itself.

- Re-confirm (fresh, not trusting Section 32's grep blindly) that
  nothing outside `src/knowledge/ingest/` references
  `@zilliz/milvus2-sdk-node` or `milvus-client`.
- Replace the Milvus connection block in `.env.example` with a Qdrant
  one (`QDRANT_URL`), matching the defaults already coded in
  `vector-client.ts` / `qdrant-client.ts`.
- Confirm `.env.example` isn't read programmatically by anything
  before assuming the edit is inert to running code.
- Remove `@zilliz/milvus2-sdk-node` from `package.json` dependencies,
  regenerate `package-lock.json` via `npm install`, confirm nothing
  transitively depended on it.
- Run the full test suite, plus specifically any
  `src/knowledge/`-related or Milvus-related test files, to confirm
  removing the dependency doesn't break anything that still imports it
  directly (if it does, that's new information contradicting the
  orphan-status finding and should halt the change, not be worked
  around).

Status as of this writing: **prompted, not yet executed.**

### 33.3 Phase 2 — Real migration (deferred, recommend its own dedicated session, same as Slice 110e)

- Rewrite `src/knowledge/index.ts` to import from
  `src/llm/qdrant-client.ts` instead of
  `src/knowledge/ingest/milvus-client.ts`.
- Port the Sprint 91 ingestion pipelines
  (`ingest-repository.js`, `ingest-sprint-history.ts`) to call
  `upsertChunks()` / `ensureKnowledgeCollection()` from the Qdrant
  client instead of the Milvus one.
- Rewrite their test suites against the new target, preserving the
  same coverage discipline Sprint 91 established — not a lighter bar
  just because it's a migration.
- Only after Phase 2 is verified working end-to-end: delete
  `milvus-client.ts` / `.js` and the committed `.js` build artifacts
  in `src/knowledge/ingest/` for good.

Status: **not started, no prompt drafted yet.**

### 33.4 Phase 3 — Resolve the data-origin mystery (best-effort, may not be resolvable from the repo alone)

- Determine how the live `knowledge_chunks` Qdrant collection was
  actually populated, since no ingestion code currently in the repo
  could have done it (Section 32.3). Likely requires institutional
  memory / checking outside the repo (deleted branches, manual script
  history, deployment logs) rather than further code archaeology.
- If resolved, use it to validate that Phase 2's rewritten ingestion
  pipeline produces output consistent with what's already live, rather
  than assuming the new pipeline is correct just because it runs
  without error.

Status: **not started, may remain unresolved.**

### 33.5 Note on why Options 2/3 (from Section 32.5) were not chosen

- Option 2 (revert the standing rule): no evidence supports this.
  `qdrant-client.ts`'s own comment states it exists to replace Milvus;
  the live query path (`vector-client.ts`) already only talks to
  Qdrant. Nothing found suggests Milvus is still deliberately wanted.
- Option 3 (leave as-is, flag only): insufficient as a permanent state.
  A banned dependency in `package.json` and a `.env.example` pointing
  new developers at a system the live code doesn't use are real,
  ongoing risks, not just a documentation gap. Section 32 itself
  already served the "flag it" function — Option 3 alone would mean
  stopping there permanently, which this decision explicitly does not
  do.


---

## 34. CRITICAL FINDING — `vectorSearch()` is completely non-functional on this host; RAG/vector retrieval strategy has been silently broken (discovered during Item #20 investigation, July 14, 2026)

### 34.0 Severity and how this was found

While resolving Item #20 (Milvus/Qdrant migration), a side investigation
into a Qdrant-URL default discrepancy between `vector-client.ts` and
`qdrant-client.ts` led to actually exercising `vectorSearch()` directly
for the first time this session — and apparently for the first time in
recent project history on this host. It failed. Chasing the failure
surfaced four independent, compounding misconfigurations, the last of
which is not fixable by configuration alone. **The "vector" strategy —
one of `retrieve()`'s four core `RetrievalStrategy` modes, wired into
both the harness `vectorSearchTool` and the MCP `handleVectorSearch`
tool — currently cannot return a result for any query on this host.**
This is more severe than Item #20 (Section 32/33), since it affects a
live, currently-relied-upon path rather than a dormant ingestion
pipeline, and should be treated as higher priority.

### 34.1 The four compounding problems, in the order they were found

1. **`QDRANT_URL` wrong for host execution.** `vector-client.ts` defaults
   to `http://qdrant:6333` — a Docker-network-only hostname. Confirmed
   via `getent hosts qdrant` → not resolvable on the host. The
   Unified Theatre app runs on the host (confirmed all session — every
   `tsx`/`npm test`/`npm run harness` invocation has been direct, not
   containerized), while Qdrant runs in a separate `qwen-stack` Docker
   Compose project (`/home/pawan/qwen-stack/docker-compose.yml`) with
   its REST port published to the host (`"6333:6333"`). `.env` has no
   `QDRANT_URL` override. Fix: `http://localhost:6333`.

2. **`EMBEDDINGS_URL` wrong for host execution, same root cause.**
   Defaults to `http://embeddings:8080` — also a Docker-network-only
   hostname. The `qwen-stack` embeddings service publishes
   `"8081:8080"` to the host. Confirmed failure:
   `getaddrinfo ENOTFOUND embeddings`. Fix: `http://localhost:8081`.

3. **`QDRANT_COLLECTION` wrong name.** Defaults to `"unified_theatre"`.
   The actual live collection (confirmed via
   `curl http://localhost:6333/collections` earlier in Section 32) is
   named `"knowledge_chunks"` — the same name used by both the old
   Milvus client and the unwired `qdrant-client.ts`. Querying
   `unified_theatre` returns `404: Collection 'unified_theatre'
   doesn't exist`.

4. **Vector dimension mismatch — NOT fixable via configuration.** After
   correcting all three URLs/names above, the query reaches Qdrant
   successfully but fails with:
   `400: Wrong input: Vector dimension error: expected dim: 1024, got 2560`.
   Confirmed via the embeddings service's own `/v1/models` endpoint:
   the currently-running model is `qwen3-emb-4b-Q5_K_M.gguf`, reporting
   `"n_embd":2560`. But `knowledge_chunks` was created expecting 1024
   dimensions — matching `qdrant-client.ts`'s explicit comment
   (`VECTOR_DIM = 1024; // BGE-M3`) and consistent with
   `src/knowledge/ingest/embedder.ts`, which uses `@xenova/transformers`
   (a local ONNX-based BGE-M3 pipeline) — an entirely different,
   separate embedding source from the `qwen-stack` llama.cpp
   embeddings service that `vector-client.ts` is actually configured
   to call.

### 34.2 What this likely explains, retroactively

This probably resolves part of Section 32.3's open mystery (how
`knowledge_chunks` was populated when no current ingestion code targets
Qdrant): the collection was most likely populated via the local
`@xenova/transformers`/BGE-M3 pipeline at some point — either through
`src/knowledge/ingest/*` before or during a migration, or through a
process not currently in the repo — and the project's embedding
infrastructure was later changed to the `qwen-stack` llama.cpp service
(a different, larger, differently-dimensioned model), without
re-ingesting the knowledge base to match. The two systems were never
reconciled.

Also consistent with earlier evidence: `docs/mcp-client-verification-sprint107.md`
documented a *different* vector-search failure at Sprint 107
("Qdrant not running — expected infrastructure gap"). That was a
simpler problem (the service was down) than what's being reported here
(the service is up, reachable, and even returns a coherent response —
but the stored data is incompatible with the currently-configured
embedding model). It's not clear from available evidence whether the
dimension mismatch predates Sprint 107 or was introduced afterward.

### 34.3 What is and isn't fixable immediately

**Fixable via configuration alone (should be done regardless of anything else):**
- Add `QDRANT_URL=http://localhost:6333` to `.env` and `.env.example`
- Add `EMBEDDINGS_URL=http://localhost:8081` to `.env` and `.env.example`
- Add `QDRANT_COLLECTION=knowledge_chunks` to `.env` and `.env.example`
  (or correct the code default directly — either works; `.env` keeps
  the pattern consistent with how `DATABASE_URL` is already handled in
  this project)

**NOT fixable via configuration — requires a real decision:**
- The dimension mismatch (1024 vs. 2560) means `vectorSearch()` will
  still fail even after all three URL/name fixes above, until one of:
  (a) the `knowledge_chunks` collection is deleted and fully
  re-ingested using the current 2560-dim `qwen3-emb-4b` model (requires
  a working, correctly-wired ingestion pipeline — which per Section 32
  does not currently exist for Qdrant at all); or
  (b) `vector-client.ts` is repointed to call a 1024-dim embedding
  source instead (e.g. the same `@xenova/transformers`/BGE-M3 pipeline
  the original data was embedded with), abandoning use of the
  `qwen-stack` embeddings service for this purpose; or
  (c) a second Qdrant collection is created at 2560 dimensions, and the
  existing `knowledge_chunks` (1024-dim) is either kept for a different
  purpose or retired.

No option selected yet. This decision is coupled to Item #20's Phase 2
(the ingestion migration) — whichever embedding model is chosen for the
rebuilt ingestion pipeline must match whatever `vector-client.ts` is
actually configured to call, or this exact failure mode recurs.

### 34.4 Immediate recommendation

Given the severity (a currently-advertised, tool-registered retrieval
strategy is completely non-functional), recommend:
1. Apply the three URL/name `.env` fixes immediately — low-risk,
   restores `vectorSearch()` to at least reaching Qdrant correctly
   rather than failing on DNS errors, and is useful regardless of how
   34.3's larger decision resolves.
2. Do NOT attempt (a)/(b)/(c) from 34.3 without a dedicated session —
   this is now entangled with Item #20's Phase 2 migration planning and
   deserves to be decided together, not bolted on as an afterthought.
3. Until 34.3 is resolved, `vectorSearch()`/the "vector" `RetrievalStrategy`
   should be understood as **not currently usable**, despite being
   advertised in `handleListTools()`'s MCP tool description
   ("Semantic similarity search over the project's Qdrant vector
   store") as if it works.


---

## 35. Section 34.3 Item 1 closed — `.env`/`.env.example` config fixes applied and verified

### 35.0 What was done

The three low-risk configuration fixes from Section 34.3/34.4 were
applied to both `.env` and `.env.example`:
QDRANT_URL=http://localhost:6333
EMBEDDINGS_URL=http://localhost:8081
QDRANT_COLLECTION=knowledge_chunks
Verified live, with real pasted terminal output (not narration):

- Re-running the exact `vectorSearch()` call from Section 34.1 now
  fails with the **dimension-mismatch error specifically**
  (`expected dim: 1024, got 2560`) rather than any DNS/hostname/
  collection-not-found error — confirming the three URL/name fixes
  took effect correctly via `.env`, without needing manual shell
  exports.
- Full test suite: 5480/5480 passing across 323 files, no regressions.
- Confirmed both real entrypoints (`src/mcp/server.ts`,
  `src/agents/cli.ts`) already load `dotenv/config` as their first
  import, so these `.env` values take effect in actual usage, not just
  in manual test scripts.

Both files are gitignored — nothing to commit for this change; it's a
local-environment fix only, not tracked in version control.

The vector-dimension mismatch itself (Section 34.3's items a/b/c)
remains open and unresolved, as expected — this closes only the
configuration-fixable portion of Section 34.

### 35.1 Correction to Section 32 — `.env.example` is not actually tracked in git

While verifying this fix, `git check-ignore .env.example` confirmed
`.env.example` is itself caught by the `.env*` glob in `.gitignore` —
it is **not tracked in version control at all**
(`git ls-files --error-unmatch .env.example` fails with
"did not match any file(s) known to git").

This means Section 32.2's framing — that a new developer cloning the
repo would "follow `.env.example` and get pointed at Milvus" — needs
correction: a fresh clone doesn't include `.env.example` at all, so
that specific risk only applies if the file is distributed to new
developers some other way (shared out-of-band, part of onboarding
instructions, etc.), not via the repository itself. The underlying
finding (the file's *content* is stale/misleading about Milvus vs.
Qdrant, now fixed for the Qdrant/embeddings portion at least) still
stands; only the "new developer following the repo" framing was
imprecise.

Separately, this is arguably its own small hygiene gap: a template
`.env.example` file that isn't committed at all defeats its usual
purpose. Not treated as urgent, but worth noting alongside Item #20's
existing `.env`/`.env.example` cleanup work (Section 33's Phase 1).

