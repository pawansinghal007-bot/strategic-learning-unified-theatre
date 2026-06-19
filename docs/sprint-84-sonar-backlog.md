# Sprint 84 Sonar Backlog

## Status

Sprint 83 reduced unresolved Sonar issues from 52 to 44. Sprint 84 carries the
remaining backlog forward in tracked groups.

## Priority groups

### Group A: mechanical cleanup

- S1128 unused imports
- S1874 deprecated usage where replacement is straightforward
- S6606 expression simplifications

### Group B: readability and consistency

- S7772
- S2486
- S7748

### Group C: structural refactors

- S7776
- Remaining complexity hotspots in routing/security/reporting modules

## Working rules

- Do not change compatibility strings without paired regression updates.
- Do not weaken ingest guard behavior to satisfy style-only rules.
- Prefer extracting helpers over inlining more logic into already-complex functions.
- Keep cleanup patches small and test after each rule cluster.

## Validation

Each backlog reduction pass must confirm:

- npx vitest run
- npx tsc --noEmit
- sonar-scanner
