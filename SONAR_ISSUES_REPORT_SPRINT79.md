# SonarQube Issues Report - Sprint 79

**Generated:** 2026-06-19  
**Project:** strategic-learning-unified-theatre  
**Reference Branch:** main  
**Analysis Task:** 2059c44f-4b1e-46f4-8e1c-157374bae58c

---

## Quality Gate Status

| Metric | Value | Status |
|--------|-------|--------|
| **New Coverage** | 0.0% | ❌ FAILED |
| **Security Hotspots Reviewed** | 0.0% | ❌ FAILED |
| **New Violations** | 14 | ❌ FAILED |

---

## Issue Summary

| Category | Count |
|----------|-------|
| **Total New-Code Issues** | 14 |
| **Total Effort (Remediation)** | 58 minutes |
| **Files Affected** | 2 |

---

## Severity Breakdown

| Severity | Count |
|----------|-------|
| **MAJOR** | 1 |
| **MINOR** | 13 |
| **TOTAL** | 14 |

---

## Rule Family Breakdown

| Rule | Count | Category |
|------|-------|----------|
| S6551 (Object Stringification) | 8 | Code Smell |
| S7735 (Unexpected Negated Condition) | 4 | Code Smell |
| S3358 (Nested Ternary) | 1 | Code Smell |
| S6644 (Boolean Literals) | 1 | Code Smell |
| **TOTAL** | 14 | |

---

## Files with Issues

### 1. `src/security/security-overview/drift.ts`

| Line | Rule | Severity | Message |
|------|------|----------|---------|
| 147 | S6644 | MINOR | Unnecessary use of boolean literals in conditional expression |

---

### 2. `src/security/security-overview/normalizer.ts`

| Line | Rule | Severity | Message |
|------|------|----------|---------|
| 49 | S6551 | MINOR | Using `join()` for fingerprintParts will use Object's default stringification format ('[object Object]') when stringified |
| 52 | S7735 | MINOR | Unexpected negated condition |
| 53 | S6551 | MINOR | 'item.scanner' will use Object's default stringification format ('[object Object]') when stringified |
| 54 | S3358 | MAJOR | Extract this nested ternary operation into an independent statement |
| 57 | S6551 | MINOR | 'item.id ?? fingerprint ?? `${kind}:${Date.now()}`' will use Object's default stringification format ('[object Object]') when stringified |
| 58 | S6551 | MINOR | 'item.title' will use Object's default stringification format ('[object Object]') when stringified |
| 60 | S6551 | MINOR | 'item.description' will use Object's default stringification format ('[object Object]') when stringified |
| 61 | S6551 | MINOR | 'item.file' will use Object's default stringification format ('[object Object]') when stringified |
| 61 | S7735 | MINOR | Unexpected negated condition |
| 62 | S6551 | MINOR | 'item.package' will use Object's default stringification format ('[object Object]') when stringified |
| 62 | S7735 | MINOR | Unexpected negated condition |
| 63 | S7735 | MINOR | Unexpected negated condition |
| 63 | S6551 | MINOR | 'item.version' will use Object's default stringification format ('[object Object]') when stringified |

---

## Coverage & Security Metrics

| Metric | Value |
|--------|-------|
| **Coverage (Statements)** | 80.42% |
| **Coverage (Branches)** | 70.85% |
| **New Coverage** | 0.0% |
| **Security Rating** | A |
| **Security Hotspots Reviewed** | 0.0% |

---

## Sprint 79 Context

- **S7785 Fixed:** ✅ Resolved (0 open issues)
- **Scope Boundary:** ✅ Preserved (sonar.newCode.referenceBranch=main)
- **Test Suite:** ✅ 1671 tests passing
- **TypeScript:** ✅ Zero errors

---

## Remaining Violations (Non-Target Rules)

The 14 remaining violations are **outside Sprint 79 scope**:

- **S6551 (8)**: Object stringification - requires `String()` → explicit property access
- **S7735 (4)**: Negated conditions - requires `if (!x)` → `if (x)` with swapped branches
- **S3358 (1)**: Nested ternary - requires extraction to if/else
- **S6644 (1)**: Boolean literals - requires removing redundant `true`/`false`

These rules were **not targeted** in Sprint 79 (focused solely on S7785 async IIFE remediation).

---

## Action Items

1. **Sprint 80 Planning:** Target remaining rules (S6551, S7735, S3358, S6644)
2. **Coverage Gap:** Add unit tests for `normalizer.ts` and `drift.ts` to improve new-code coverage
3. **Security Hotspots:** Review any security hotspots in the codebase

---

## Related Sprints

- **Sprint 78:** S3776, S7735, S6551, S4325, S3358, S2871 remediation (149 files, 1665 tests)
- **Sprint 79:** S7785 async IIFE remediation (1 file, 1671 tests)
- **Sprint 80:** Planned - remaining S6551, S7735, S3358, S6644 violations
