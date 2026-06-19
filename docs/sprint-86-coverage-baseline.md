# Sprint 86 — Coverage Baseline

## Current State

- **Statements**: 51.58% (4647/9009)
- **Branches**: 46.7% (2746/5880)
- **Functions**: 58.85% (987/1677)
- **Lines**: 51.95% (4365/8402)

## Threshold Target

- **Current**: 100% (global threshold)
- **Proposed Interim**: 70% or 80% (standard Sonar default)

## Lowest-Covered Files

1. `src/ui/dashboard.js` — 0% coverage (1951 lines)
2. `src/shared/ipc/contract.ts` — 0% coverage (38 lines)
3. `src/storage/storageStatus.js` — 5% coverage (65 lines)
4. `src/shared/errors/memory.error.ts` — 50% coverage
5. `src/shared/errors/routing.error.ts` — 50% coverage

## Priority Targets

1. **Sprint 85 files**: `gateway.ts`, `dashboard.js`
2. **High-value modules**: Auth, requests, data parsing
3. **New code**: Non-fatal handlers added in Sprint 85
4. **Quota/decision logic**: Gateway routing logic

## Notes

- 100% coverage is not a standard Sonar default (typical: ~80%)
- 100% line coverage on 9.6k-line codebase is significant effort
- Consider setting realistic interim target (70-80%)
- Update `sonar-project.properties` or quality gate config if needed
