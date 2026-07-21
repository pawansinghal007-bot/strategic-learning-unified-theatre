# Function Audit — Canonical Final Report (Prompt 6 + Prompt 7 + Prompt 8 corrections)

**Date:** 2026-07-20 (Prompt 7 + Prompt 8 corrections applied same day)
**Scanner:** `output/repo_function_audit.py` (v2 — substring-collision fix + cross-file widening)
**Repo:** `/home/pawan/vscodeagent/Solution`
**Output:** `output/audit-final/`

---

## Summary

| Metric                                            | Count |
| ------------------------------------------------- | ----- |
| Total functions scanned                           | 1,591 |
| Zero total references                             | 21    |
| False positives (test fixtures)                   | 10    |
| False positives (path-invoked / dynamic dispatch) | 3     |
| **Genuine dead code**                             | **8** |
| Needs human judgment                              | 0     |

**Zero-total reconciliation:** 10 test fixtures + 3 path-invoked + 8 genuine dead code = 21 ✓

**Note on same-file usage:** The 3 same-file usage examples listed below (`seedAccount`, `chunk_text`, `detect_path_invoked_test`) are illustrative examples of the Prompt 2 fix — they have non-zero total references (1, 1, 3 respectively) and are NOT part of the 21 zero-total rows.

---

## False Positives

### Same-file usage — illustrative examples (3)

These are illustrative examples of the Prompt 2 fix (same-file reference detection), not from the zero-total pool. All three have non-zero `total_reference_count` in the CSV:

| Function                   | File:Line                                           | Same-file refs | Total refs | Evidence                                |
| -------------------------- | --------------------------------------------------- | -------------- | ---------- | --------------------------------------- |
| `seedAccount`              | `e2e/smoke/account-rotation-ai-capture.spec.ts:196` | 1              | 1          | Test helper used within same spec file  |
| `chunk_text`               | `index_repo.py:135`                                 | 1              | 1          | Helper called within same Python script |
| `detect_path_invoked_test` | `output/test_detect_path.py:4`                      | 3              | 3          | Test harness function — self-contained  |

**Note:** These functions are NOT part of the 21 zero-total rows. They demonstrate the Prompt 2 fix where same-file references were previously missed by cross-file-only scanning.

### Test fixtures (10)

Functions defined in test files, used only within the test framework context.

| Function                                                              | File:Line                                                 | Language | Evidence                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------- | -------- | ---------------------------------------------- |
| `withHomeDir`                                                         | `output/config-validation.test.js:26`                     | js       | Test helper — `test-only` visibility           |
| `makeToolResultBlock`                                                 | `tests/llm/gateway-prompt-budget.test.ts:46`              | ts       | Test factory — `test-only` visibility          |
| `countOccurrences`                                                    | `tests/llm/gateway-prompt-budget.test.ts:58`              | ts       | Test helper — `test-only` visibility           |
| `containsTailPortion`                                                 | `tests/llm/gateway-prompt-budget.test.ts:71`              | ts       | Test helper — `test-only` visibility           |
| `normalizePaths`                                                      | `tests/shared/retrieval/graph-builder.test.ts:35`         | ts       | Test utility — `test-only` visibility          |
| `alpha`                                                               | `tests/storage/symbol-extractor.test.ts:290`              | ts       | Test fixture — string-only refs in other tests |
| `beta`                                                                | `tests/storage/symbol-extractor.test.ts:291`              | ts       | Test fixture — string-only refs in other tests |
| `thing`                                                               | `tests/test-runner-coverage.test.js:393`                  | js       | Test data — `test-only` visibility             |
| `test_find_references_counts_same_file_usage_without_definition_line` | `output/test_repo_function_audit.py:18`                   | py       | Test function — `test-only` visibility         |
| `buildMinimalDOM`                                                     | `tests/security/security-overview/dashboard.test.js:7708` | js       | Test helper — `test-only` visibility           |

### Path-invoked / dynamic dispatch (3)

Functions loaded dynamically via path strings (e.g., `require("./scenarios/kill-daemon")`). Zero static references by design.

| Function                | File:Line                                     | Path-invoked match           | Evidence                                        |
| ----------------------- | --------------------------------------------- | ---------------------------- | ----------------------------------------------- |
| `burstLoadScenario`     | `scripts/chaos/scenarios/burst-load.js:6`     | `scripts/chaos/run-chaos.js` | Chaos scenario loaded via `readdir` + `require` |
| `corruptConfigScenario` | `scripts/chaos/scenarios/corrupt-config.js:8` | `scripts/chaos/run-chaos.js` | Chaos scenario loaded via `readdir` + `require` |
| `killDaemonScenario`    | `scripts/chaos/scenarios/kill-daemon.js:6`    | `scripts/chaos/run-chaos.js` | Chaos scenario loaded via `readdir` + `require` |

---

## Genuine Dead Code (8)

Functions with zero references anywhere after all checks (cross-file widening, same-file detection, path-invoked scanning).

| Function                  | File:Line                                       | Language | Visibility | Invocation Type   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------- | -------- | ---------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`handleDaemonEvent`**   | `electron-tray/main.js:167`                     | js       | internal   | CLI, Path-invoked | Zero refs. Path-invoked tag is a **proximity false positive**: `tests/sprint25-smoke.test.js` contains `const mainPath = join(process.cwd(), "electron-ui/main.cjs")` on line ~213, followed by `require(` on line 219. The basename `main` (from `electron-tray/main.js`) matches the `main` in the test fixture path `"electron-ui/main.cjs"` which falls within the ~600-char proximity window of `require(`. The test file reads `electron-ui/main.cjs` as a string and asserts on its content — it never imports or calls `handleDaemonEvent`. Proximity to a trigger keyword is not proof the basename is that specific call's argument. Function defined but never exported or called. |
| **`runNpmLink`**          | `scripts/install.js:30`                         | js       | internal   | Direct            | Zero refs. Not exported, not called within own file. Dead code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **`loadAiMemoryContext`** | `src/commands/ai.js:202`                        | js       | internal   | CLI, Path-invoked | Zero refs. Path-invoked tag is a **proximity false positive**: `tests/ai.test.js` contains many `vi.mock()` calls with dynamic `await import(...)` for OTHER modules; the static import of `ai.js` on its own line happens to fall within one of those ~600-char proximity windows. Proximity to a trigger keyword (`import(`) is not proof the basename is that specific call's argument. Function wrapped in `/* v8 ignore */`, never exported or called.                                                                                                                                                                                                                                   |
| **`getNodesForFile`**     | `src/shared/retrieval/graph-incremental.ts:115` | ts       | internal   | Direct            | Zero refs repo-wide (verified via `rg -w`: only matches are definition at line 115, `function_catalog.csv`, and this report). Not exported. Not called within own file. Dead code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **`getEdgesForFile`**     | `src/shared/retrieval/graph-incremental.ts:131` | ts       | internal   | Direct            | Zero refs repo-wide (verified via `rg -w`: only matches are definition at line 131, `function_catalog.csv`, and this report). Not exported. Not called within own file. Dead code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Confirmed dead code — exported functions (zero refs, no published-package boundary)

| Function               | File:Line                                 | Language | Visibility | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`clearGraphCache`**  | `src/shared/retrieval/graph-state.ts:102` | ts       | public     | Exported but zero refs repo-wide. No `exports` field in `package.json` exposes this module. Dead code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **`hasGraphCache`**    | `src/shared/retrieval/graph-state.ts:110` | ts       | public     | Exported but zero refs repo-wide. No `exports` field in `package.json` exposes this module. Dead code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **`getStyleSnapshot`** | `tests/ui/helpers/electronUi.js:39`       | js       | public     | Exported but zero refs. Three spec files import from `electronUi.js` (`browser-pane-hide.spec.js`, `browser-pane-overlap.spec.js`, `local-ai-status.spec.js`), none import `getStyleSnapshot`. Two reconciliation tests (`sprint55-reconciliation.test.js:66`, `sprint56-human-tester-3.test.js:87`) reference the file path as a string in `exists()` calls (`existsSync(join(root, rel))`) — file-existence guards only, no dynamic import, no `Object.keys()` iteration, no functional exercise of any export. No Playwright/Vitest config or CI workflow references it by path or name. Dead code. |

**Bucket reconciliation note:** These three functions were previously in a lower-confidence "additional candidates" bucket. They are promoted to confirmed dead because: (1) zero references repo-wide, (2) no published-package boundary (`package.json` has no `exports` field), and (3) for `getStyleSnapshot`, explicit verification that no external test runner or CI config references it. Export visibility alone does not prevent a dead-code verdict when there is no external consumer surface.

---

## Scanner Blind Spots (Remaining After Both Fixes)

1. **Reflection-based dispatch**: Functions invoked via `eval()`, `new Function()`, or dynamic property access (`obj[methodName]()`) remain invisible.
2. **IPC channel names**: Electron IPC calls using string channel names (`ipcRenderer.invoke('channel-name')`) won't match handler function names unless they coincide.
3. **Decorator-registered handlers**: Functions registered via decorators (e.g., `@Command('name')`) are invisible unless the decorator syntax is parsed.
4. **String-based event wiring**: `process.on('event', handler)` where the handler name doesn't appear as a bare identifier on the same line.
5. **Cross-language boundaries**: Functions in `.py` files called from `.js` via subprocess/child_process won't be detected.
6. **Proximity-based path invocation false positives**: `detect_path_invoked` scans a ~600-char window around trigger keywords (`import(`, `require(`, `readdir`). If a file mixes static imports and dynamic imports (e.g., `tests/ai.test.js` imports `ai.js` statically while also having `vi.mock()` calls with `import(` for other modules), the static import may be falsely tagged as Path-invoked because it falls within a proximity window of an unrelated dynamic import. Proximity to a trigger keyword is not proof the basename is that specific call's argument.

---

## Fixes Applied

### Fix 1: Substring collision in `detect_path_invoked`

**Problem:** Naive `in` operator for substring matching caused `"ai"` to match inside `"ai-memory"`, producing false Path-invoked tags.

**Solution:** Replaced with lookbehind `(?<=["\'`/])`+ lookahead`(?=["\'`/]|\.[A-Za-z0-9]{1,5}["\'`])` regex requiring quote/path boundaries around the basename.

**Verification:** Three hand-verification cases passed:

- `"./scenarios/kill-daemon"` on basename `kill-daemon` → MATCH ✓
- `"../src/ai-memory/memory-db.js"` on basename `ai` → NO MATCH ✓
- `"./foo/ai.js"` on basename `ai` → MATCH ✓

### Fix 2: Cross-file bare-name widening

**Problem:** Cross-file matching used strict `CALL_TEMPLATE` requiring `name(`, missing JSX components (`<Sidebar>`), imports/exports (`import { Sidebar }`), and callback wiring (`.map(handler)`).

**Solution:** Added three trigger conditions for cross-file widening:

- `is_jsx_usage`: `<ComponentName` pattern
- `is_import_export`: `import`/`export` keyword on line
- `is_callback_context`: `.forEach(`, `.map(`, `registerCommand`, `onClick`, etc.

**Verification:** `Sidebar` and `StatusBar` now show `reference_count=3` from `renderer/App.jsx` (was 0 before).

---

## Methodology

1. Ran `python3 output/repo_function_audit.py /home/pawan/vscodeagent/Solution --outdir output/audit-final`
2. Extracted all rows where `total_reference_count=0` (21 functions)
3. Re-bucketed each from scratch (not copied from v3)
4. Classified into: same-file usage, test fixtures, path-invoked, genuine dead code
5. Verified genuine dead code candidates via repo-wide grep (`rg -w` across all directories)
6. Prompt 7 corrections: fixed loadAiMemoryContext explanation (proximity false positive), verified getNodesForFile/getEdgesForFile repo-wide with explicit match listing, reconciled confidence buckets (promoted 3 candidates to confirmed), closed getStyleSnapshot question with explicit code inspection of both reconciliation test files

---

_Supersedes `output/audit-real-v3/TRIAGED-REPORT.md`._
