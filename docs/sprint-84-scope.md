# Sprint 84 Scope

## Objective

Sprint 84 closes the quality and static-analysis work left open after Sprint 83
while preserving the validated ingest, governance, and security-overview behavior
already achieved.

## Carry-forward from Sprint 83

Sprint 83 completed:

- ingest-sprint-history.ts coverage uplift to 84.37%
- 8 Sonar issue fixes
- TypeScript clean build
- full green test suite
- quality-gate and checklist documentation

Sprint 83 also left 44 unresolved Sonar issues. Sprint 84 reduces that backlog
without regressing scope guards, ingest behavior, or security-overview flows.

## Sprint 84 deliverables

- Add a structured Sonar backlog tracker file checked into the repo.
- Add regression tests that pin Sprint 83 and Sprint 84 quality assumptions.
- Preserve ingest entry behavior required by existing scope guard tests.
- Document remaining roadmap scope mapped back to the master timeline.
- Keep the master timeline unchanged for Sprints 1-54.

## Exit criteria

- TypeScript passes with no errors.
- Vitest passes.
- Sprint 84 guard tests pass.
- Sonar backlog is explicitly tracked in repo with categories and next actions.
- Master sprint plan reflects Sprint 83 complete and Sprint 84 next.
