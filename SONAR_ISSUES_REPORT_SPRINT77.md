# SonarQube Issues Report - Sprint 77

**Generated:** 2026-06-19  
**Project:** strategic-learning-unified-theatre  
**Total Issues:** 149  
**Analysis Date:** After Sprint 77 fixes applied

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Issues | 149 |
| Open Issues | 98 |
| Closed Issues | 51 |
| Critical | 9 |
| Major | 15 |
| Minor | 125 |
| Code Smells | 147 |
| Bugs | 2 |

**Quality Gate Status:** FAILED  
**Coverage:** 14.2%  
**New Security Hotspots Reviewed:** 0.0%

---

## Severity Breakdown

```
MINOR:    125 (83.9%)
MAJOR:     15 (10.1%)
CRITICAL:   9 (6.0%)
```

---

## Type Breakdown

```
CODE_SMELL: 147 (98.7%)
BUG:          2 (1.3%)
```

---

## Status Breakdown

```
OPEN:    98 (65.8%)
CLOSED:  51 (34.2%)
```

---

## Top 15 Rules by Issue Count

| Rule | Count | Description |
|------|-------|-------------|
| javascript:S7764 | 50 | Prefer `globalThis` over `window` |
| typescript:S7735 | 13 | Unexpected negated condition |
| typescript:S6551 | 10 | Using `join()` or stringification on objects |
| typescript:S4325 | 9 | Unnecessary type assertion |
| typescript:S3358 | 8 | Nested ternary operations |
| typescript:S3776 | 7 | High Cognitive Complexity |
| typescript:S1128 | 7 | Unused imports |
| typescript:S7772 | 7 | Missing type annotations |
| typescript:S2486 | 5 | Exception handling issues |
| typescript:S6582 | 4 | Optional chain expression |
| typescript:S7748 | 4 | Missing type annotations |
| typescript:S7776 | 4 | Missing type annotations |
| typescript:S1874 | 4 | Unused private members |
| typescript:S6606 | 3 | Missing type annotations |
| javascript:S2486 | 2 | Exception handling issues |

---

## Critical Issues (9)

### Cognitive Complexity Issues (S3776)

1. **src/security/security-overview/drift.ts:94** - Complexity 21 (max 15)
2. **src/security/security-overview/schema.ts:79** - Complexity 19 (max 15)
3. **src/security/risks/dependency-check-runner.ts:13** - Complexity 19 (max 15)
4. **src/llm/gateway.ts:83** - Complexity 50 (max 15) ⚠️
5. **src/llm/gateway.ts:332** - Complexity 22 (max 15)
6. **src/llm/routing-explainer.ts:4** - Complexity 22 (max 15)
7. **src/policies/provider-policy.ts:105** - Complexity 16 (max 15)

### Other Critical Issues

8. **src/knowledge/ingest/ingest-sprint-history.ts:31** - S2871: String.localeCompare
9. **src/audit/audit-log.ts:38** - S2871: String.localeCompare

---

## Major Issues (15)

### Top-Level Await Issue (S7785)

1. **src/knowledge/ingest/ingest-sprint-history.ts:148** - Prefer top-level await over async IIFE

### Nested Ternary Operations (S3358)

2. **src/security/security-overview/auto-scan.ts:104**
3. **src/security/security-overview/ai-explain.ts:291**
4. **src/security/security-overview/baseline.ts:15**
5. **src/security/security-overview/normalizer.ts:24**
6. **src/security/secrets/baseline.ts:17**
7. **src/governance/workspace-quotas.ts:146**
8. **src/llm/routing-history.ts:93**
9. **src/cli/llm-health.ts:18**

### Optional Chain Expression (S6582)

10. **src/security/security-overview/drift-history.ts:35**
11. **src/knowledge/ingest/ingest-sprint-history.ts:37**
12. **src/knowledge/ingest/ingest-sprint-history.ts:43**

### Other Major Issues

13. **src/llm/routing-history.ts:558** - S4624: Nested template literals
14. **src/llm/routing-history.ts:100** - S6564: Redundant type alias

---

## Minor Issues (125)

### Dashboard.js Issues (javascript:S7764 - 50 total, 0 open)

All 50 issues in `src/ui/dashboard.js` are **CLOSED** - Sprint 76 fixes applied successfully.

### Remaining Minor Issues by Category

#### Unexpected Negated Conditions (S7735)
- src/ui/dashboard.js:452
- src/security/security-overview/auto-scan.ts:121
- src/security/security-overview/normalizer.ts:35

#### Exception Handling (S2486, S6582)
- src/ui/dashboard.js:1277, 1301
- Various security-overview files

#### String Replacement (S7781)
- src/ui/dashboard.js:1483 - Prefer String#replaceAll()

#### Type Assertion Issues (S4325)
- Multiple files: unnecessary type assertions

#### Unused Imports (S1128)
- src/security/security-overview/ai-explain.ts:1 - fs import

#### Object Stringification (S6551)
- src/security/security-overview/normalizer.ts:36, 37, 52

#### Type Annotation Issues (S7772, S7776, S6606)
- Various files missing type annotations

---

## Files with Most Issues

| File | Total Issues | Open Issues |
|------|-------------|-------------|
| src/ui/dashboard.js | 50 | 0 |
| src/security/security-overview/normalizer.ts | 16 | 16 |
| src/security/security-overview/auto-scan.ts | 13 | 13 |
| src/security/security-overview/triage.ts | 12 | 12 |
| src/security/security-overview/drift.ts | 11 | 11 |
| src/security/security-overview/ai-explain.ts | 10 | 10 |
| src/security/security-overview/baseline.ts | 9 | 9 |
| src/security/security-overview/schema.ts | 8 | 8 |
| src/security/security-overview/drift-history.ts | 7 | 7 |
| src/security/secrets/baseline.ts | 6 | 6 |
| src/llm/gateway.ts | 6 | 6 |
| src/llm/routing-history.ts | 6 | 6 |
| src/knowledge/ingest/ingest-sprint-history.ts | 5 | 5 |
| src/policies/provider-policy.ts | 4 | 4 |
| src/cli/llm-health.ts | 4 | 4 |

---

## Sprint 76/77 Progress

### Completed Fixes

✅ **Sprint 76 - window→globalThis cleanup**
- 50 S7764 violations in dashboard.js → 0
- All 50 issues CLOSED
- Dashboard.js now uses globalThis consistently

✅ **Sprint 77 - Build Stabilization**
- Fixed top-level await in ingest-sprint-history.ts
- Wrapped in `require.main === module` guard for CJS compatibility
- Build now passes `npm run build:electron-main`

---

## Quality Gate Blockers

### Coverage (new_coverage: 0.0%)
- **Status:** FAILED (threshold: 80%)
- **Root Cause:** Sonar new_coverage measures coverage of code changed within the configured new-code-period window only
- **Action:** Git history confirms browser-bridge.js, agent-handoff.js, and local-llm.js were not modified in any Sprint 60+ commit
- **Resolution:** Requires human Sonar admin decision to reset new-code-period

### Security Hotspots (new_security_hotspots_reviewed: 0.0%)
- **Status:** FAILED (threshold: 100%)
- **Action:** Human security judgment required in Sonar UI
- **Process:** Mark as Safe/Fixed/Acknowledged with justification

### New Violations (new_violations: 0)
- **Status:** PASSED (threshold: 0)
- **Action:** No new violations in new-code period

---

## Recommendations for Sprint 78

### Priority 1 - Critical Issues

1. **Reduce Cognitive Complexity (S3776)**
   - src/llm/gateway.ts:83 (50→15) - HIGH priority
   - src/llm/gateway.ts:332 (22→15)
   - src/llm/routing-explainer.ts:4 (22→15)
   - src/security/security-overview/drift.ts:94 (21→15)
   - src/security/security-overview/schema.ts:79 (19→15)
   - src/security/risks/dependency-check-runner.ts:13 (19→15)
   - src/policies/provider-policy.ts:105 (16→15)

2. **Fix String.localeCompare (S2871)**
   - src/knowledge/ingest/ingest-sprint-history.ts:31
   - src/audit/audit-log.ts:38

### Priority 2 - Major Issues

3. **Refactor Nested Ternaries (S3358)**
   - 9 files with nested ternary operations

4. **Fix Optional Chain (S6582)**
   - 3 files with replaceable optional chains

5. **Fix Exception Handling (S2486)**
   - 5 files with improper exception handling

### Priority 3 - Minor Issues

6. **Type Annotations (S7772, S7776, S6606)**
   - Add missing type annotations across multiple files

7. **Unused Imports (S1128)**
   - Remove unused imports (7 files)

8. **String Replacement (S7781)**
   - Replace String#replace() with String#replaceAll() where appropriate

---

## Summary

**Current State:** 149 issues (98 open, 51 closed)  
**Sprint 76/77 Progress:** Dashboard.js S7764 issues fully resolved, build fixes applied  
**Quality Gate:** FAILED due to coverage and security hotspots (process blockers)  
**Next Sprint Focus:** Reduce cognitive complexity in gateway.ts and security-overview files
