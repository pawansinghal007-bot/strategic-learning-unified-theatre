# SonarQube Report - Sprint 74 T1

## Quality Gate Status

**Status: FAILED**

| Metric | Threshold | Actual | Status |
|--------|-----------|--------|--------|
| coverage | 100% | 14.2% | ❌ ERROR |
| duplicated_lines_density | 3% | 2.7% | ✅ OK |
| new_violations | 0 | 0 | ✅ OK |
| security_hotspots_reviewed | 100% | 0.0% | ❌ ERROR |
| violations | 0 | 148 | ❌ ERROR |

## Overall Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Bugs | 2 | ⚨ |
| Vulnerabilities | 0 | ✅ |
| Code Smells | 146 | ⚨ |
| Violations | 148 | ⚨ |
| Security Rating | 1.0 (A) | ✅ |
| Reliability Rating | 4.0 (D) | ⚨ |
| SQALE Rating | 1.0 (A) | ✅ |
| Security Hotspots | 16 | ⚨ |
| Duplicated Lines Density | 2.7% | ✅ |

## Issues by Severity

| Severity | Count |
|----------|-------|
| MINOR | 125 |
| MAJOR | 14 |
| CRITICAL | 9 |
| **Total** | **148** |

## Top 10 Rules by Issue Count

| Rule | Count | Description |
|------|-------|-------------|
| javascript:S7764 | 50 | Prefer `globalThis` over `window` |
| typescript:S7735 | 13 | Unexpected negated condition |
| typescript:S6551 | 10 | Unused function parameter |
| typescript:S4325 | 9 | Unused local variable |
| typescript:S3358 | 8 | Unused private member |
| typescript:S3776 | 7 | Unused import |
| typescript:S1128 | 7 | Unused namespace import |
| typescript:S7772 | 7 | Unused type parameter |
| typescript:S2486 | 5 | Unused type alias |
| typescript:S6582 | 4 | Unused variable |

## Top 10 Files by Issue Count

| File | Issues |
|------|--------|
| src/ui/dashboard.js | 54 |
| src/security/security-overview/normalizer.ts | 16 |
| src/llm/gateway.ts | 13 |
| src/knowledge/ingest/ingest-sprint-history.ts | 8 |
| src/audit/audit-log.ts | 5 |
| src/security/security-overview/auto-scan.ts | 4 |
| src/security/security-overview/triage.ts | 4 |
| src/security/security-overview/drift.ts | 4 |
| src/cli/llm-health.ts | 4 |
| src/security/security-overview/ai-explain.ts | 3 |

## Coverage Summary

| Metric | Value |
|--------|-------|
| Statements | 80.42% (826/1027) |
| Branches | 70.85% (423/597) |
| Functions | 81.52% (150/184) |
| Lines | 81.05% (783/966) |

## Security Hotspots

**Token does not have hotspot permissions.**

Total hotspots: 16 (from measures API)

## New Code Period (after sonar.newCode.referenceBranch=main)

| Metric | Value |
|--------|-------|
| new_violations | 0 |
| new_bugs | 0 |
| new_code_smells | 0 |
| new_vulnerabilities | 0 |

## Recommendations

1. **High Priority**: Fix `src/ui/dashboard.js` issues (54 issues)
   - Replace `window` with `globalThis` (50 occurrences)
   - Review negated conditions (13 occurrences)

2. **Medium Priority**: Fix TypeScript issues in security-overview files
   - Unused imports, parameters, and variables

3. **Coverage**: Increase test coverage from 14.2% to meet 100% threshold

4. **Security Hotspots**: Review 16 security hotspots (requires elevated permissions)

## Notes

- The `sonar.newCode.referenceBranch=main` change in Sprint 73 resets the new-code period
- New-code scope now shows 0 violations (comparing against main branch)
- Full code scope shows 148 violations that need remediation
- Token permissions: Browse, Execute Analysis (no hotspot permissions)
