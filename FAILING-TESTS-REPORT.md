# Failing Tests Report — Pre-existing Failures

**Date**: 2026-07-15  
**Test Suite**: `npx vitest run` (324 files, 5479 tests)  
**Failures**: 7 across 3 files  
**Root Cause**: All pre-existing, unrelated to Milvus→Qdrant migration

---

## Summary Table

| #   | Test File                            | Failing Test                  | Root Cause                                      | Severity |
| --- | ------------------------------------ | ----------------------------- | ----------------------------------------------- | -------- |
| 1   | `document-ingester-branches.test.js` | overlap=0 produces 2 chunks   | `{tokens}` vs `{maxChars}` API mismatch         | Medium   |
| 2   | `document-ingester-branches.test.js` | step clamped to 1             | `{tokens}` vs `{maxChars}` API mismatch         | Medium   |
| 3   | `document-ingester-branches.test.js` | stops at boundary (line 143)  | `{tokens}` vs `{maxChars}` API mismatch         | Medium   |
| 4   | `document-ingester-branches.test.js` | last chunk smaller            | `{tokens}` vs `{maxChars}` API mismatch         | Medium   |
| 5   | `document-ingester-coverage.test.js` | whitespace-only → empty array | Implementation doesn't trim before length check | Low      |
| 6   | `document-ingester-coverage.test.js` | overlapping chunks            | `{tokens}` vs `{maxChars}` API mismatch         | Medium   |
| 7   | `sprint90-coverage-policy.test.js`   | 51.98% < 74% statements       | Coverage gap (not code issue)                   | Low      |

---

## Failure #1–4: `tests/llm/document-ingester-branches.test.js`

### Problem

Tests call `chunkText(text, { tokens: N, overlap: M })` but the implementation signature is:

```js
// src/llm/document-ingester.js:117
export function chunkText(text, { maxChars = 3000, overlap = 300 } = {}) {
```

The `tokens` parameter is **ignored** (falls through to default `maxChars=3000`). All 4 failing tests pass `{ tokens: 3-5 }` which gets treated as `maxChars=3000`, so short test strings fit in a single chunk instead of multiple.

### Affected Tests

| Test               | Input                                                | Expected            | Actual                    |
| ------------------ | ---------------------------------------------------- | ------------------- | ------------------------- |
| overlap=0          | 10 words (`"w0 w1 ... w9"`, ~19 chars), `{tokens:5}` | 2 chunks            | 1 chunk (19 chars < 3000) |
| step clamped       | `"a b c d e"` (8 chars), `{tokens:3, overlap:2}`     | step=1, many chunks | step=2700, 1 chunk        |
| exact boundary     | `"a b c d e f"` (11 chars), `{tokens:3}`             | 2 chunks            | 1 chunk                   |
| last chunk smaller | `"a b c d e f g"` (14 chars), `{tokens:3}`           | 3 chunks            | 1 chunk                   |

### Proposed Fix

**Option A (Recommended)**: Update tests to use `maxChars` instead of `tokens`.

```diff
- chunkText(words.join(" "), { tokens: 5, overlap: 0 })
+ chunkText(words.join(" "), { maxChars: 10, overlap: 0 })
```

Adjust maxChars values to match test intent (character positions, not word counts).

**Option B**: Add `tokens` as an alias for `maxChars` in the implementation:

```js
export function chunkText(text, { maxChars, tokens, overlap = 300 } = {}) {
  const chunkSize = maxChars ?? tokens ?? 3000;
  // ...
}
```

---

## Failure #5: `tests/llm/document-ingester-coverage.test.js` — whitespace-only

### Problem

```js
// Test expects:
expect(chunkText("   \n\t  ")).toEqual([]);

// Implementation (line 118):
const str = String(text || "");
if (str.length === 0) return [];
```

`"   \n\t  "` has length 7, so it passes the empty check and returns `["   \n\t  "]` instead of `[]`.

### Proposed Fix

**Option A (Recommended)**: Add trim check in implementation:

```diff
 export function chunkText(text, { maxChars = 3000, overlap = 300 } = {}) {
-  const str = String(text || "");
-  if (str.length === 0) return [];
+  const str = String(text || "").trim();
+  if (str.length === 0) return [];
```

**Option B**: Update test to match current behavior:

```diff
- expect(chunkText("   \n\t  ")).toEqual([]);
+ expect(chunkText("   \n\t  ")).toEqual(["   \n\t  "]);
```

---

## Failure #6: `tests/llm/document-ingester-coverage.test.js` — overlapping chunks

### Problem

```js
// Test uses {tokens: 5, overlap: 2} → ignored, defaults to maxChars=3000
const chunks = chunkText(words.join(" "), { tokens: 5, overlap: 2 });
expect(chunks.length).toBeGreaterThan(1); // FAILS: gets 1 chunk
```

Same root cause as failures #1-4. The 10-word string (~49 chars) fits in one 3000-char chunk.

### Proposed Fix

Same as failures #1-4. Use `maxChars` with appropriate character values:

```diff
- chunkText(words.join(" "), { tokens: 5, overlap: 2 })
+ chunkText(words.join(" "), { maxChars: 25, overlap: 10 })
```

---

## Failure #7: `tests/sprint90-coverage-policy.test.js` — coverage threshold

### Problem

```js
expect(summary.total.statements.pct).toBeGreaterThanOrEqual(74);
// Actual: 51.98%
```

The coverage-summary.json reports 51.98% statement coverage, below the 74% threshold. This is a coverage gap, not a code bug.

### Proposed Fix

**Option A**: Lower the threshold to match current reality:

```diff
- expect(summary.total.statements.pct).toBeGreaterThanOrEqual(74);
+ expect(summary.total.statements.pct).toBeGreaterThanOrEqual(51);
```

**Option B**: Add missing test coverage to bring statements above 74%. This requires identifying uncovered files and writing tests for them.

**Option C**: Exclude low-priority files from coverage analysis in `vitest.config.ts`.

---

## Impact Assessment

| Category                                | Count | Migration-Related? | Action Needed                   |
| --------------------------------------- | ----- | ------------------ | ------------------------------- |
| `{tokens}` vs `{maxChars}` API mismatch | 5     | No                 | Update tests or add alias       |
| Whitespace-only trim behavior           | 1     | No                 | Trim in impl or update test     |
| Coverage threshold gap                  | 1     | No                 | Lower threshold or add coverage |
| **Total**                               | **7** | **0**              | **All pre-existing**            |

## Recommendation

Fix failures #1-6 together by updating the test files to use `maxChars` instead of `tokens` (Option A for each). Fix #5 by adding `.trim()` to the implementation. Leave #7 as-is until coverage improvement sprints are planned.

Estimated effort: ~15 minutes for test fixes, ~5 minutes for trim fix.
