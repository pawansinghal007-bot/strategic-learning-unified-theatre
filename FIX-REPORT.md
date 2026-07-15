# Detailed Fix Report — chunkText Test Failures

**Date**: 2026-01-24  
**Status**: ✅ 6/6 fixes applied and verified  
**Result**: 7 failures → 1 failure (5478/5479 tests passing)

---

## Summary

| # | Test File | Failure | Root Cause | Fix Applied | Status |
|---|-----------|---------|------------|-------------|--------|
| 1 | `document-ingester-branches.test.js` | Non-overlapping chunks (overlap=0) | Wrong param name (`tokens` vs `maxChars`) | Updated to `{maxChars: 10, overlap: 0}` | ✅ Fixed |
| 2 | `document-ingester-branches.test.js` | Step clamped to 1 | Wrong param name (`tokens` vs `maxChars`) | Updated to `{maxChars: 5, overlap: 4}` | ✅ Fixed |
| 3 | `document-ingester-branches.test.js` | Stops at boundary | Wrong param name (`tokens` vs `maxChars`) | Updated to `{maxChars: 5, overlap: 0}` | ✅ Fixed |
| 4 | `document-ingester-branches.test.js` | Last chunk smaller | Wrong param name (`tokens` vs `maxChars`) | Updated to `{maxChars: 5, overlap: 0}` | ✅ Fixed |
| 5 | `document-ingester-coverage.test.js` | Whitespace-only string | Missing `.trim()` in implementation | Added `.trim()` to `String(text \|\| "")` | ✅ Fixed |
| 6 | `document-ingester-coverage.test.js` | Overlapping chunks | Wrong param name (`tokens` vs `maxChars`) | Updated to `{maxChars: 25, overlap: 10}` | ✅ Fixed |
| 7 | `sprint90-coverage-policy.test.js` | Coverage 51.98% < 74% | Policy threshold, not code bug | Not fixed (requires coverage sprint) | ⏸️ Skipped |

---

## Root Cause Analysis

### Problem 1: Parameter Name Mismatch (Failures #1-4, #6)

**Issue**: Tests used `{tokens: N}` but `chunkText()` signature uses `{maxChars: N}`.

**Why it failed**: The `tokens` parameter was silently ignored, defaulting to `maxChars=3000`. Short test strings (8-49 chars) fit in one 3000-char chunk, so tests expecting multiple chunks failed.

**Implementation signature**:
```js
export function chunkText(text, { maxChars = 3000, overlap = 300 } = {}) {
  const str = String(text || "");
  // ...
}
```

**Fix**: Replace `{tokens: N}` with `{maxChars: N}` and adjust test data to use character-based expectations (not word-based).

### Problem 2: Missing `.trim()` (Failure #5)

**Issue**: `chunkText()` didn't trim input, so whitespace-only strings like `"   \n\t  "` (length 7) passed the empty check and produced a chunk.

**Fix**: Add `.trim()` to the input string:
```diff
- const str = String(text || "");
+ const str = String(text || "").trim();
```

---

## Detailed Fix Breakdown

### Fix 1: Implementation — Add `.trim()` to `chunkText`

**File**: `src/llm/document-ingester.js` (line ~117)

**Before**:
```js
export function chunkText(text, { maxChars = 3000, overlap = 300 } = {}) {
  const str = String(text || "");
  if (str.length === 0) return [];
```

**After**:
```js
export function chunkText(text, { maxChars = 3000, overlap = 300 } = {}) {
  const str = String(text || "").trim();
  if (str.length === 0) return [];
```

**Impact**: Whitespace-only strings now return `[]` instead of `["   \n\t  "]`.

---

### Fix 2: Branch Tests — Character-based test data

**File**: `tests/llm/document-ingester-branches.test.js` (lines 33-82)

**Changes**:
- `"produces non-overlapping chunks when overlap=0"`:
  - Before: `{tokens: 5, overlap: 0}` on `"w0 w1 w2 w3 w4 w5 w6 w7 w8 w9"` (19 chars)
  - After: `{maxChars: 10, overlap: 0}` on `"0123456789abcdefghij"` (20 chars) → 2 chunks: `"0123456789"`, `"abcdefghij"`

- `"step clamped to 1 when maxChars - overlap = 1"`:
  - Before: `{tokens: 3, overlap: 2}` on `"a b c d e"` (8 chars)
  - After: `{maxChars: 5, overlap: 4}` on `"0123456789"` (10 chars) → sliding window: `"01234"`, `"12345"`, ...

- `"stops exactly at boundary"`:
  - Before: `{tokens: 3, overlap: 0}` on `"a b c d e f"` (11 chars)
  - After: `{maxChars: 5, overlap: 0}` on `"0123456789"` (10 chars) → 2 chunks: `"01234"`, `"56789"`

- `"last chunk can be smaller"`:
  - Before: `{tokens: 3, overlap: 0}` on `"a b c d e f g"` (14 chars)
  - After: `{maxChars: 5, overlap: 0}` on `"0123456789a"` (11 chars) → 3 chunks: `"01234"`, `"56789"`, `"a"`

- `"single word produces one chunk"`:
  - Before: `{tokens: 5, overlap: 0}` on `"hello"`
  - After: `{maxChars: 10, overlap: 0}` on `"hello"` → 1 chunk: `"hello"`

---

### Fix 3: Coverage Tests — Character-based test data

**File**: `tests/llm/document-ingester-coverage.test.js` (lines 48-90)

**Changes**:
- `"returns single chunk when text is shorter than maxChars window"`:
  - Before: `{tokens: 512, overlap: 64}` on `"hello world foo bar"`
  - After: `{maxChars: 512, overlap: 64}` on `"hello world foo bar"` → 1 chunk (passes, just param name fix)

- `"produces overlapping chunks when text exceeds maxChars window"`:
  - Before: `{tokens: 5, overlap: 2}` on `"word0 word1 ... word9"` (~49 chars)
  - After: `{maxChars: 25, overlap: 10}` on `"word0 word1 ... word9"` (~49 chars) → step=15, multiple chunks

---

## Verification

### Pre-fix state:
```
Test Files  1 failed | 323 passed (324)
Tests       7 failed | 5472 passed (5479)
```

### Post-fix state:
```
Test Files  1 failed | 323 passed (324)
Tests       1 failed | 5478 passed (5479)
```

### Remaining failure:
- `sprint90-coverage-policy.test.js` — Coverage threshold (51.98% < 74%) is a policy decision, not a code bug. Requires a dedicated coverage improvement sprint to address.

---

## Files Modified

1. `src/llm/document-ingester.js` — Added `.trim()` to `chunkText` input (1 line)
2. `tests/llm/document-ingester-branches.test.js` — Updated 5 tests to use `{maxChars}` instead of `{tokens}` (29 lines)
3. `tests/llm/document-ingester-coverage.test.js` — Updated 2 tests to use `{maxChars}` instead of `{tokens}` (6 lines)

**Total changes**: 3 files, ~36 lines modified

---

## Lessons Learned

1. **Parameter naming matters**: Tests using wrong param names (`tokens` vs `maxChars`) were silently ignored, leading to incorrect test behavior.
2. **Character vs token confusion**: The `chunkText` function is character-based (`str.slice()`), not token-based. Test expectations should use character-based data, not word-based assumptions.
3. **Input sanitization**: Adding `.trim()` to handle whitespace-only strings is a common pattern for text processing functions.
