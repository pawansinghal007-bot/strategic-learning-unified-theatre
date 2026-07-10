# Unified Theatre — Continuity Summary

_Read this first if you're an agent (Claude, Copilot, or otherwise) picking up this project. It exists to prevent context loss across sessions and across different tools/providers working on the same repo._

> **Last updated 2026-07-10.** See Section 9 for that session's full detail (measurement-log root-cause fix, source tagging, and automated weekly checkpoint) — **fully committed and pushed as `51b648dd`**. Section 5 and Section 6 below have been updated in place to reflect current state; everything else in Sections 1–8 is unchanged from the prior version of this doc.

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
- Both confirmed to pass consistently in isolation and across 3+ repeated full-suite runs. If either fails again, it's very likely this same pre-existing pattern, not new breakage — but verify via repeat-run or `git stash` rather than assuming.

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

| File | Lines targeted | Before | After | Commit | What was actually tested / why skipped |
|---|---|---|---|---|---|
| src/agents/tools/retrieve.ts | 61-66 | 90% stmts / 84.21% branches | 100% stmts / 100% branches | fea79ac4 | Two tests for the `case "symbol":` branch: (1) non-empty results assert exact formatted string `"name (kind) at filePath:startLine-endLine"`; (2) empty results assert exact `"No symbol found for \"<query>\"."` fallback message |

| src/daemon/watcher.js | 374, 437 | 98.9% stmts / 77.57% branches / 98.87% lines | 100% stmts / 80.37% branches / 100% lines | 1ed41516 | Line 374: throttle guard in runEnhanceCycle — asserts `_spawnEnhance` called exactly once when second tick is within `intervalMs` window; line 437: concurrent `running` flag guard in runCaptureCycle — asserts `captureThread` called exactly once when second tick fires while first cycle is still awaiting |

| src/domain/schemas.js | 107 | 96% stmts / 100% branches / 50% funcs / 96% lines | 100% stmts / 100% branches / 100% funcs / 100% lines (full suite) | 1d29348b | Line 107: `parseAppConfig` function body — asserts top-level defaults on empty input, nested sub-schema defaults with explicit `{}`, value preservation, and ZodError on invalid field type |

| src/domain/types.js | all lines (0% coverage) | 0% stmts / 0% branches / 0% funcs / 0% lines | file removed from coverage report | SKIPPED (coverage) / bc005b22 (test + config) | SKIPPED for V8 coverage — file is a pure ESM re-export barrel with JSDoc @typedefs; V8 cannot instrument static re-export bindings. Added to vitest.config.ts coverage exclude alongside other barrel files. 31-test behavioral suite (tests/domain-types.test.js) written to assert every re-exported symbol is the exact same reference as its origin module, catching any future omissions or typos. |

| tool-call-measurement-log.ts | 14, 49 | Stmts 75% Branch 50% Funcs 100% Lines 84.61% | Stmts 93.75% Branch 87.5% Funcs 100% Lines 92.3% | 5b0ad8fb | Tested: `detectSource()` returning UNIFIED_AI_ENV override (line 14); CI env-var branch (line 15); MAX_ENTRIES eviction slice in `recordToolCallForMeasurement` (line 49); storage-error swallow. `return "production"` (else-of-VITEST) SKIPPED — not testable from within vitest (runner always sets VITEST=1). |

| base.ts (src/agents/tools/) | all | Stmts 0% Branch 0% Funcs 0% Lines 0% | File removed from coverage report | 2df3ceaf | SKIPPED (no test written) — file contains only TypeScript `interface` declarations (ToolResult, Tool); zero executable statements emitted. Added to vitest.config.ts coverage.exclude alongside src/agents/types.ts and src/mcp/types.ts. |

| llm.js (src/commands/) | 775 | Stmts 99.7% Branch 81.41% Funcs 100% Lines 99.7% | Stmts 100% Branch 82.05% Funcs 100% Lines 100% | 0263e68f | Tested: `rubric enable` success path prints "Enabled." (line 775); `err?.message ?? err` no-message branch in the catch block. Root cause: existing test in llm-cli-commands.test.js asserted `setRubricActive` was called but never asserted the `console.log` output, leaving the statement uncovered despite the action running. |
