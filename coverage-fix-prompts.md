# Coverage Remediation Prompts v2 — strategic-learning-unified-theatre

Source: `COVERAGE-100-ANALYSIS.md`, fresh run 2025-07-18 via `vitest.test-ci.config.ts`.
Current state: 97.84% stmts / **92.13% branches (FAILS 95% threshold, exit 1)** / 98.04% funcs / 98.29% lines.
Target model: Qwen3.6-27B-UD-Q5_K_XL.gguf (local, via llama.cpp)

Already done since last round — no prompt needed: `src/mcp/server.ts`, `src/knowledge/ingest/ingest-sprint-history.js`, `src/llm/qdrant-client.js` (all 100%).

## Run order (matches the report's own phasing + effort estimates)

| Phase | What                                                                                                    | Est. effort | Prompts below                                        |
| ----- | ------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------- |
| 1     | Exclude 6 zero-coverage files; 3 tiny single-test fixes; CLI-entry ignores                              | 2–3h        | Prompts 1–6                                          |
| 2     | inference.js (node-llama-cpp mocks), ingest-repository.js (edge cases), gateway.ts (error/stream paths) | 4–6h        | Prompts 7–9                                          |
| 3     | 18 branch-heavy files, worst first                                                                      | 6–8h        | Prompt 10 (detailed) + Prompt 11 (reusable template) |

## Ground rules (same as last round, still apply to every prompt)

- Never modify source logic to make a test pass. The only source edits allowed are scoped `/* v8 ignore next N */` comments, and only where a prompt below explicitly says so — always show the diff before it's considered applied.
- `globals: true` is active — no `import { describe, it, expect, vi } from 'vitest'` in new/edited test files.
- Qdrant-only — never reference Milvus, including in mocks.
- Use `npx vitest run -c vitest.test-ci.config.ts --coverage` (the CI config, since that's the one enforcing the 95% branch threshold — the default `vitest.config.ts` may have different/no thresholds and will give you a false green).
- Full suite run: redirect to a log file with a 350s timeout, report back only pass/fail count, exit code, and the specific file's updated stmt/branch/func/line % from `coverage/coverage-summary.json`.
- Don't `git push`.
- One prompt = one file (or one tiny cluster of trivial files in Phase 1). Don't drift into unrelated files even if you spot other gaps — note them at the end instead.

---

## Prompt 1 — Exclude the 6 zero-coverage files (config change, not test-writing)

```
Task: update the coverage configuration in vitest.test-ci.config.ts (and
vitest.config.ts if it has its own separate coverage.exclude array) to add
these 6 files, which are confirmed intentional non-runtime files:

  src/knowledge/ingest/chunking.ts       — shadowed by chunking.js (runtime version)
  src/knowledge/ingest/embedder.ts       — shadowed by embedder.js (runtime version)
  src/llm/qdrant-client.ts               — shadowed by qdrant-client.js (runtime version)
  src/shared/contracts/provider.ts       — pure type definitions, no runtime code
  src/shared/errors/index.ts             — barrel re-export only
  src/storage/run-indexer.ts             — CLI entry, import.meta.url guard blocks test execution

Steps:
1. Open vitest.test-ci.config.ts and find the existing coverage.exclude
   array. Match its existing glob style exactly (don't switch from glob
   patterns to plain paths or vice versa).
2. Add these 6 files to that array. Do not remove or alter any existing
   exclusion entries already present.
3. Re-run: npx vitest run -c vitest.test-ci.config.ts --coverage
   and confirm: (a) these 6 files no longer appear at all in
   coverage-summary.json, (b) overall statement % moves toward ~98.2%
   as the report predicted, (c) no test that was passing before now fails.
4. Show me the diff of vitest.test-ci.config.ts before applying anything else.

Do not touch any of these 6 files' actual content — this is a config-only change.
Do not push.
```

---

## Prompt 2 — `src/agents/sub-agent.ts` (92.98% → 100%, one edge case)

```
Target: src/agents/sub-agent.ts. One specific gap: lines 119-120 in
parseArgs — the branch where a key is found in the args string but has no
corresponding value:

  i = keyResult.nextIndex;
  continue;

This is the "malformed args" fallback path.

Steps:
1. Open src/agents/sub-agent.ts and read parseArgs in full, including
   keyResult's shape, to confirm exactly what input reaches this branch
   (e.g. a trailing "--key" with nothing after it, or "--key --other-key"
   with no value in between).
2. Find the existing test file for sub-agent.ts and match its existing
   parseArgs test conventions exactly.
3. Add ONE test: call parseArgs with an args string ending in a bare key
   with no value (e.g. "--key" alone, or whatever exact malformed shape
   step 1 confirmed triggers this branch). Assert on the actual returned
   parse result, not just that it doesn't throw.
4. Run: npx vitest run src/agents/sub-agent.test.ts -c vitest.test-ci.config.ts --coverage
   Confirm lines 119-120 and their branch are now hit, and file reaches 100%
   across all four metrics.
5. Report pass/fail count and the file's updated coverage %.

Don't push.
```

---

## Prompt 3 — `src/agents/tools/retrieve.ts` (92.3% → 100%, error path)

```
Target: src/agents/tools/retrieve.ts. One gap: line 46, the catch block
of the retrieve tool's execute path:

  return {
    toolName: this.name,
    success: false,
    output: "",
    error: `retrieve failed: ${error instanceof Error ? error.message : String(error)}`,
  };

Steps:
1. Open src/agents/tools/retrieve.ts and identify what this tool calls
   internally that could throw (likely a retrieval/search function from
   src/shared/retrieval/ — check the import list at the top of the file).
2. Find the existing retrieve.ts test file and match its existing mocking
   convention for that retrieval dependency exactly.
3. Add ONE test: mock the retrieval call to throw (both an Error instance
   and, separately, a thrown non-Error value like a string, since the code
   explicitly branches on `error instanceof Error` — cover both sides of
   that ternary). Assert the returned object has success: false and the
   error field matches the exact template string shown above for each case.
4. Run: npx vitest run -c vitest.test-ci.config.ts --coverage on just this
   test file, confirm line 46 and its branch are hit, file reaches 100%.
5. Report pass/fail count and updated coverage %.

Don't push.
```

---

## Prompt 4 — `src/agents/tool-call-measurement-log.ts` (93.75% → 100%, two paths)

```
Target: src/agents/tool-call-measurement-log.ts. Two specific gaps:

  Line 17 — detectSource, the CI branch:
    if (process.env.CI) return "ci";

  Line 46 — recordToolCallForMeasurement, a silent catch block:
    catch {
      (no body shown in the report excerpt — read the actual file to see
       what, if anything, happens inside; do not assume it's fully empty)

Steps:
1. Open the file and read detectSource in full (what other branches exist
   besides "ci" — e.g. local/dev/unknown — so your test doesn't
   accidentally already match an existing covered branch), and read the
   catch block in recordToolCallForMeasurement in full to see its actual
   contents before writing an assertion.
2. Find the existing test file and match its conventions for mocking
   process.env and the write-to-disk call (likely writeJsonFile, per the
   report's own fix suggestion — confirm the actual function name in the
   file rather than trusting that name blindly).
3. Add a test that sets process.env.CI = 'true' (and restores it afterward
   in the same test, don't leak env state into other tests) and asserts
   detectSource() returns "ci".
4. Add a test that mocks the write function to throw, calls
   recordToolCallForMeasurement, and asserts on whatever the catch block
   actually does per step 1 — e.g. that it doesn't throw further, and/or
   that it doesn't call a logger. Don't invent an assertion; match reality.
5. Run: npx vitest run -c vitest.test-ci.config.ts --coverage, confirm
   both lines/branches are hit and file reaches 100%.
6. Report pass/fail count and updated coverage %.

Don't push.
```

---

## Prompt 5 — `src/storage/run-migrations.ts` CLI entry (78.04% stmt / 50% br → decide approach first)

```
Target: src/storage/run-migrations.ts, lines 66-73, the CLI entry block:

  if (import.meta.url === `file://${process.argv[1]}`) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error("DATABASE_URL is not set.");
      process.exit(1);
    }
    try {
      await runMigrations(url);
      process.exit(0);
    } catch (err) {
      console.error("Migration failed:", err);
      process.exit(1);
    }
  }

Note: the source report gives two different recommendations for this block
(§3.1 says extract to a separate bin file; §5 Phase 1 says just v8-ignore
it). Default to the faster path below unless told otherwise:

Steps:
1. Confirm this block is truly the only remaining gap in the file — run
   npx vitest run -c vitest.test-ci.config.ts --coverage and re-check
   coverage/lcov.info for src/storage/run-migrations.ts to make sure
   nothing else uncovered has crept in since the report was generated.
2. Add a scoped ignore comment covering exactly lines 66-73 (the whole
   `if (import.meta.url === ...)` block), not the whole file. Use
   `/* v8 ignore start */` and `/* v8 ignore stop */` around just that
   block so runMigrations() itself (the exported function, called from
   elsewhere and already tested) stays fully measured.
3. Show me the diff before considering it final. In the same response,
   note as an alternative: extracting this block into a new
   bin/run-migrations.ts that imports and calls runMigrations() would be
   the cleaner long-term fix per the report's own §3.1 recommendation —
   estimate how many other CLI-entry files in this repo have the same
   shape (run-indexer.ts already excluded, ingest-repository.js has one
   too — see Prompt 8) so I can decide whether a shared bin/ pattern is
   worth doing in one pass instead of ignoring each one individually.
4. Run the full suite with the CI config, 350s timeout, report pass/fail
   count and updated file coverage %.

Do not touch runMigrations() itself, only the CLI bootstrap block. Don't push.
```

---

## Prompt 6 — Report the two remaining Phase-1 items honestly

```
Before moving to Phase 2, run npx vitest run -c vitest.test-ci.config.ts
--coverage once more and give me an updated coverage-summary.json diff
for exactly these 5 files touched so far: sub-agent.ts, retrieve.ts,
tool-call-measurement-log.ts, run-migrations.ts, and confirm the 6
excluded files from Prompt 1 no longer appear. Report the new overall
statement/branch/function/line totals and whether overall branch % has
moved above 92.13%. Do not proceed to inference.js or gateway.ts yet —
stop after this report so I can review Phase 1 as a whole before Phase 2 starts.
```

---

## Prompt 7 — `src/llm/inference.js` (83.42% stmt, 75.8% br → prioritize node-llama-cpp mocks per report)

```
Target: src/llm/inference.js. The report's own priority order: node-llama-cpp
mock tests first (largest gap), Windows-specific code excluded via
v8 ignore, error paths last.

Known uncovered regions (confirm exact current state via lcov.info first —
this may have shifted slightly):
- Lines 37-41 + BRDA 42/45/46: getWindowsOllamaCandidates (Windows path detection)
- Line 68, 97, 294, 311-335 + many BRDA in that range: node-llama-cpp
  provider (importOptional("node-llama-cpp"), isNodeLlamaCppInstalled(),
  getLlama/context/model lifecycle)
- Line 90: ollamaModelExists fallback check
- Line 114: assertReady's "No local LLM model found" throw
- Line 123: verifyLocalLlmRuntime → verifyOllamaInstalled fallback
- Lines 276-277: VSCODE_ROTATOR_MOCK_LLM path in generate()
- BRDA 145/154: parseOllamaListOutput (JSON array path, header-not-found path)
- BRDA 201/222/229/235: runOllama (--json flag fallback, streaming response,
  parse error, final fallback)
- BRDA 361/375: OpenAI provider third-choice and error path

Steps:
1. Run npx vitest run -c vitest.test-ci.config.ts --coverage and re-read
   coverage/lcov.info for src/llm/inference.js fresh — confirm the above
   list against current DA/BRDA data rather than trusting it verbatim.

2. Handle node-llama-cpp first (the priority call): find how
   importOptional() is implemented (check its own source — likely a thin
   dynamic-import wrapper) and mock it at the module level to return a
   fake node-llama-cpp module shaped like what lines 311-335 expect
   (getLlama, or default.getLlama per line 306's branch — test BOTH
   shapes since that's an explicit BRDA branch). Have the fake getLlama
   return a fake runtime/context/model whose methods (context.free,
   model.freeModel per lines 313/314/328) you can assert were called for
   cleanup. Also test the "getLlama missing entirely" throw at line 303,
   and the "unsupported version" error path.

3. Handle Ollama-related gaps: mock ollamaModelExists (line 90),
   isNodeLlamaCppInstalled (line 97), assertReady's throw when neither
   provider is available (line 114), verifyLocalLlmRuntime's fallback to
   verifyOllamaInstalled (line 123), parseOllamaListOutput's JSON-array
   path and header-not-found path (line 145/154), and runOllama's
   --json-flag-unsupported fallback, streaming response handling, parse
   error, and final fallback (lines 201/222/229/235). Match whatever
   process-spawning mock convention the existing passing tests in this
   file already use for runOllama — don't introduce a new child_process
   mocking approach.

4. Handle the VSCODE_ROTATOR_MOCK_LLM path in generate() (lines 276-277) —
   this project already sets this env var for its own test/mock runs per
   the project's test scripts, so check whether this path is actually
   exercised elsewhere and just needs a direct unit test here, or is
   genuinely never hit within inference.js's own test file.

5. For lines 37-41 and their BRDA branches (Windows path detection only):
   do NOT try to fully unit test Windows-only exe path resolution on
   Linux. Either (a) mock process.platform = 'win32' and process.env
   LOCALAPPDATA/ProgramFiles and assert getWindowsOllamaCandidates returns
   the right path list — this IS testable without a real Windows machine
   since it's pure string/path logic — or (b) if you find a part that
   genuinely requires the Windows filesystem itself, propose a scoped
   v8 ignore for just that part and show me the diff before applying.
   Prefer (a); the report itself notes this is "never runs on Linux CI"
   but the branching logic is still plain JS you can exercise.

6. Cover the OpenAI provider's third-choice and error path (BRDA 361, 375)
   with a mocked fetch/client rejection, matching this file's existing
   OpenAI mock pattern.

7. Run the full file's tests alone first, then the CI-config suite with a
   350s timeout. Report pass/fail count and updated stmt/branch/func/line
   % for src/llm/inference.js specifically, plus how many of the ~26
   listed BRDA branches remain uncovered if any.

If any node-llama-cpp cleanup call (context.free / model.freeModel) isn't
actually invoked by the real code in some path, flag that as a possible
resource-leak bug rather than writing a test that just confirms the current
(possibly buggy) behavior. Don't push.
```

---

## Prompt 8 — `src/knowledge/ingest/ingest-repository.js` (87.4% stmt, 68.57% br)

```
Target: src/knowledge/ingest/ingest-repository.js. Three distinct gaps
per the report:

1. attachVectors edge cases:
   - Line 192 + BRDA 191: oversized chunk (>6000 chars per the report's
     own fix suggestion — confirm the actual threshold constant in the
     file rather than trusting "6000" blindly) gets pushed to a `skipped`
     array instead of embedded.
   - Line 198 + BRDA 197: embedTextBatch returning a vector count that
     doesn't match safeChunks.length throws:
     `[knowledge] embedTextBatch returned ${vectors.length} vectors for ${safeChunks.length} chunks`
   - BRDA 141: safeChunks.length === 0 path
   - BRDA 202: vector assignment branch

2. chunkToQdrantPoint field defaults (lines 219-230, multiple BRDA) —
   optional fields on a chunk object that should fall back to defaults
   when absent (read the function to see exactly which fields: likely
   things like featureArea, language, or similar metadata — confirm from
   the actual code, don't guess field names).

3. main() CLI entry (lines 294-306) — gated by `if (process.env.VITEST) return;`
   near the top, meaning main() itself DOES run during tests today but
   exits early; the uncovered part is what happens when VITEST is NOT
   set (real invocation): argv-based baseDir/defaultFeatureArea parsing,
   the ingestRepository() call, and its catch block setting process.exitCode.

Steps:
1. Run npx vitest run -c vitest.test-ci.config.ts --coverage, re-check
   lcov.info for this file to confirm current state against the above.

2. For attachVectors: find the existing test file and match its mocking
   convention for embedTextBatch. Add tests for: a chunk over the size
   threshold (assert it lands in `skipped`, not sent for embedding), an
   empty safeChunks array, embedTextBatch returning a mismatched vector
   count (assert the exact throw message and that it's a real Error, not
   swallowed), and the normal vector-assignment path if not already hit.

3. For chunkToQdrantPoint: add tests constructing a chunk object missing
   each optional field one at a time (not all at once — you want each
   BRDA branch individually attributable) and assert the resulting Qdrant
   point has the correct default value for each.

4. For main(): rather than unsetting process.env.VITEST (fragile — other
   tests likely depend on it being set), test main()'s internals directly
   if they're exported/testable in isolation, OR mock process.argv and
   temporarily delete process.env.VITEST within a single isolated test
   with a try/finally that restores it immediately after, matching
   whatever pattern (if any) other files in this repo use for testing
   VITEST-gated CLI entries. If no safe pattern exists and this genuinely
   can't be tested without env leakage risk, propose a scoped v8 ignore
   for lines 294-306 instead (matching the report's own Phase 1 suggestion
   for this file) and show me the diff before applying — don't guess your
   way into a flaky test that mutates global env state.

5. Run the file's tests alone, then the CI-config full suite (350s
   timeout). Report pass/fail count and updated coverage % for this file.

Do not change the 6000-char threshold or the vector-count-mismatch error
message to make tests easier — if either looks inconsistent with what
chunking.js actually produces, flag it instead of adjusting either side
to match the other. Don't push.
```

---

## Prompt 9 — `src/llm/gateway.ts` (91.15% stmt, 80% br — prioritize provider validation + stream errors)

```
Target: src/llm/gateway.ts. Report priority: #1 provider validation errors
and #3 stream errors first (real error paths); prompt-budget trim-step
edge cases (#2) are lower priority; Proxy singleton (#5) is a v8-ignore
candidate, not a test candidate.

Do NOT refactor this file's structure — it's a stated Sprint 19
prerequisite; only add tests around existing exported behavior.

Priority 1 — validateProviderAvailable (lines 427-429, BRDA 427):
  logger.warn("gateway.provider.missing", { provider: providerName });
  return { valid: false, error: "Provider not found" };
Test: call with a provider name that isn't registered/healthy, assert the
exact returned shape and that the warn log fires with that exact event
name and payload shape (match this file's existing logger mock, if any).

Priority 1 — stream() error paths (lines 640, 661, BRDA 639/660/681/711):
  Line 640: throw new RoutingNoProviderError("No provider candidates available for stream");
  Line 661: throw new RoutingNoProviderError("No streaming-capable healthy provider available");
Test: (a) call stream() when no provider candidates exist at all — assert
the first error type/message; (b) call stream() when candidates exist but
none are streaming-capable/healthy — assert the second error type/message.
Also cover BRDA 681 (a provider IS found — likely already covered by a
happy-path test, confirm) and BRDA 711 (an error occurring mid-stream —
assert how it propagates to the caller).

Priority 3 — appendLocalIfAvailable / appendLocalIfAvailableForStream
(lines 817, 1007-1035, BRDA 816/877/943-948/1030-1031):
  These push/unshift "local" into candidates under different conditions
  (preferredProvider === "local", a policy-state error fallback, local
  already present in candidates). Mock getState() (per the report's own
  fix suggestion — confirm the actual policy-state accessor name in the
  file) to throw, and separately to return each relevant state, and
  assert the resulting candidates array for each of: preferredProvider
  is "local", preferredProvider is not "local", local already in the
  list, and the policy-error fallback. Do this for BOTH the non-stream
  and the ForStream variant — they have separate BRDA gaps (943-948 vs
  1030-1031) so don't assume testing one covers the other.

Lower priority — prompt-budget trim steps (lines 96-103 tryDropWorkspaceContext,
133-137 tryTruncateToolResults, 164 tryPreserveUserPrompt, 203
tryMarkerBasedFallback, 317 enforcePromptBudget "budget not exceeded" path):
  Only pick these up if time remains after the above. Each is one specific
  BRDA branch (see the report's line-by-line list) — construct a prompt
  input specifically shaped to hit each one (e.g. one that doesn't start
  with a workspace-context marker for line 96's false branch, one with no
  userPrompt for line 164, etc.) rather than one big generic test.

Not a test target — Proxy lazy singleton (lines 1061-1070, BRDA
1062/1063/1067): propose `/* v8 ignore next N */` for this block per the
report's own recommendation (#5) and show the diff for review rather than
writing a test for a lazy-singleton Proxy pattern.

Steps:
1. Run npx vitest run -c vitest.test-ci.config.ts --coverage, re-check
   lcov.info for src/llm/gateway.ts against the specifics above.
2. Find the existing gateway test file, match its provider-mock and
   logger-mock conventions exactly.
3. Implement priority 1 tests, then priority 3, then lower-priority if
   time allows, in that order — stop and report after priority 1 and 3
   even if you don't get to the trim-step edge cases, rather than rushing
   all of them.
4. Run this file's tests alone, then the CI-config full suite (350s
   timeout). Report pass/fail count and updated stmt/branch/func/line %.

Don't push.
```

---

## Prompt 10 — `src/knowledge/index.ts` (100% stmt, 60% branches — highest priority Phase 3 file)

```
Target: src/knowledge/index.ts. This file executes every line already
(100% statements) but only 60% of branches are exercised — the single
biggest branch gap in the whole codebase (40 percentage points).

Steps:
1. Run npx vitest run -c vitest.test-ci.config.ts --coverage and read
   coverage/lcov.info for src/knowledge/index.ts specifically — pull the
   exact BRDA lines with 0 taken-count. The source report didn't give a
   line-by-line breakdown for this file (only the summary %), so this
   step is not optional — get the real list before writing anything.
2. Open the file in full. Since statements are already 100%, every
   uncovered branch is the "other half" of something already exercised —
   an early-return guard whose non-triggering path is untested, a
   default-parameter value never actually defaulted-into, an `||`/`??`
   short-circuit only ever hit from one side, or a `switch`/conditional
   branch whose alternate case is unexercised. Go through each BRDA
   line, identify which half is missing, and identify the smallest input
   change from an existing passing test that would hit it.
3. Find the existing test file, match its conventions exactly.
4. Add one targeted test per uncovered branch — don't write broad new
   scenarios; you're filling in specific missing halves of already-tested
   logic, so each test should be small and named after the specific
   branch it closes (e.g. "falls back to default X when Y is undefined").
5. Run this file's tests alone, then the CI-config full suite (350s
   timeout). Report pass/fail count and the file's updated branch %,
   and list any branch you couldn't close along with why (e.g. genuinely
   dead code, in which case flag it as a possible bug/dead-code candidate
   rather than a coverage gap — don't v8-ignore it silently without
   telling me).

Don't push.
```

---

## Prompt 11 — Reusable template for the remaining 17 branch-heavy files

Run this once per file, worst-branch-% first. Fill in `<FILE>` and `<BRANCH_PCT>` from the table below.

Remaining files, in priority order (branch % ascending):
| # | File | Branches |
|---|---|---|
| 1 | `src/llm/storage.ts` | 75% |
| 2 | `src/llm/training-exporter.js` | 75.45% |
| 3 | `src/commands/idea.js` | 76.66% |
| 4 | `src/internal/journal.js` | 77.77% |
| 5 | `src/internal/git-monitor.js` | 77.08% |
| 6 | `src/commands/browser.js` | 79.43% |
| 7 | `src/daemon/watcher.js` | 80.37% |
| 8 | `src/knowledge/ingest/chunking.js` | 83.33% |
| 9 | `src/shared/retrieval/code-search.ts` | 83.33% |
| 10 | `src/llm/routing-history.ts` | 83.01% |
| 11 | `src/commands/llm.js` | 82.05% |
| 12 | `src/policies/provider-policy.ts` | 85.24% |
| 13 | `src/security/security-overview/auto-scan.ts` | 84.78% |
| 14 | `src/policies/workspace-policy.ts` | 87.5% |
| 15 | `src/llm/experience-db.js` | 87.98% |
| 16 | `src/storage/symbol-extractor.ts` | 89.41% |
| 17 | `src/shared/retrieval/vector-client.ts` | 89.65% |

```
Target: <FILE>, currently at <BRANCH_PCT> branch coverage (statements are
already high/complete per the source report — this is branch-only work).

Steps:
1. Run npx vitest run -c vitest.test-ci.config.ts --coverage and read
   coverage/lcov.info for <FILE> specifically. Pull every BRDA line with
   a 0 taken-count. This is your authoritative list — the summary report
   didn't include a line-by-line breakdown for this file.
2. Open <FILE> in full. For each uncovered BRDA branch, identify what kind
   of branch it is (early-return guard, default-parameter fallback,
   `||`/`??` short-circuit, ternary, switch/case, error-instanceof check)
   and what specific input or mocked dependency state would take the
   untaken path.
3. Find the existing test file for <FILE> and match its existing
   conventions (mocking style, fixture style, assertion style) exactly —
   do not introduce a new pattern for this file alone.
4. Add one small, specifically-named test per uncovered branch. Do not
   write broad new test scenarios or refactor existing tests — this is
   branch-gap-filling, not a rewrite. Do not touch any line/branch that's
   already covered.
5. Run <FILE>'s test file alone first, then the CI-config full suite with
   a 350s timeout. Report pass/fail count and <FILE>'s updated
   statements/branches/functions/lines %.
6. If any branch turns out to be genuinely dead code (unreachable given
   how the function is actually called elsewhere in the codebase) rather
   than a real missing test case, say so explicitly and stop — don't
   force a synthetic test to hit it, and don't silently v8-ignore it
   without flagging it to me first.

Do not modify <FILE>'s logic to make a branch easier to hit. Don't push.
```

---

## Phase 1 result (recorded)

324/324 test files, 5,495/5,495 tests passing, no regressions. 3 of 4 Phase-1 files hit 100% across all metrics (retrieve.ts, tool-call-measurement-log.ts, run-migrations.ts). sub-agent.ts landed at 97.36% stmt / **94.93% branches** / 100% fn / 100% lines — 4 branches short of 100%. Overall branches moved 92.13% → 92.8% (still failing the 95% threshold, exit code 1). The 6 Prompt-1 exclusions all took effect, though see the verification note in Prompt 6c below before trusting that fully.

## Prompt 6b — close sub-agent.ts's last 4 branches (cheap, do before Phase 2)

```
Target: src/agents/sub-agent.ts, 4 remaining uncovered branches:

  BRDA:16,0,0,0    — isWordChar, undefined-input path
  BRDA:151,15,0,0  — findToolCallMarker, edge case
  BRDA:156,17,0,0  — findToolCallMarker, edge case
  BRDA:191,20,1,0  — executeToolCall, edge case

Steps:
1. Open src/agents/sub-agent.ts and read isWordChar (around line 16) and
   findToolCallMarker (around lines 151/156) and executeToolCall (around
   line 191) in full — don't guess what triggers each branch from the
   name alone, confirm from the actual code.
2. For isWordChar: identify what "undefined input" means here concretely
   (called with undefined/no argument, or called where a char lookup at
   an out-of-range index returns undefined?) and add a test hitting that
   exact case.
3. For findToolCallMarker's two edge cases at lines 151 and 156: these are
   likely a marker-not-found path and a malformed-marker path, or similar
   — read both branches' surrounding conditions and add one test per branch.
4. For executeToolCall's edge case at line 191: read the condition at that
   line (branch choice 1 specifically, per BRDA:191,20,1,0) and add a test
   for that specific input shape.
5. Run npx vitest run src/agents/sub-agent.test.ts -c vitest.test-ci.config.ts --coverage
   and confirm all 4 branches are now hit and the file reaches 100%.
6. Run the full CI-config suite (350s timeout), report pass/fail count
   and confirm no regressions, plus the new overall branch %.

Don't push.
```

## Prompt 6c — verify the index.ts exclusion caught the right file

```
Two files in this repo are named index.ts: src/shared/errors/index.ts
(a barrel re-export, correctly meant to be excluded per Prompt 1) and
src/knowledge/index.ts (a real file at ~60% branch coverage, the top
Phase 3 priority — must NOT be excluded).

1. Open vitest.test-ci.config.ts's coverage.exclude array and show me the
   exact glob/path entry that was added for the errors/index.ts exclusion.
2. Confirm it's an exact or sufficiently-scoped match (e.g. includes
   "shared/errors/" in the pattern) and could not also match
   src/knowledge/index.ts.
3. Run npx vitest run -c vitest.test-ci.config.ts --coverage and confirm
   src/knowledge/index.ts DOES appear in coverage-summary.json with a
   real (non-zero, non-100%) branch percentage — if it's missing entirely
   or shows 0/0, the exclusion is too broad and needs to be scoped down
   to the errors barrel file specifically.
4. Report back: the exact exclude pattern used, and src/knowledge/index.ts's
   current branch % from coverage-summary.json.
```

## After Phase 3

Once branch coverage clears 95% globally, re-run the full CI-config suite once more standalone (no source changes) to confirm the threshold check passes with exit code 0, and get a fresh `coverage-summary.json` snapshot — that's the actual definition of done here, not any individual file hitting 100%.
