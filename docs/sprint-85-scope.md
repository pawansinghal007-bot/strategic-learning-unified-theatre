# Sprint 85 — Sonar Backlog Closure

**Status:** Planned

**Objective:** Eliminate 7 remaining S2486 violations by structural fixes (no NOSONAR)

**Baseline:** 7 violations (all S2486) in `src/llm/gateway.ts` and `src/ui/dashboard.js`

## Files in Scope

- `src/llm/gateway.ts` — 5 S2486 violations (lines 173, 232, 239, 693, 725)
- `src/ui/dashboard.js` — 2 S2486 violations (lines 1292, 1316)
- `docs/sprint-85-scope.md` — this file
- `docs/sprint-85-checklist.md` — verification checklist
- `tests/sprint85-guard.test.js` — regression guard tests

## Files Explicitly Out of Scope

- `src/installer/hw-probe/node_modules/` — third-party dependencies
- `tests/regression/` — test files with intentional NOSONAR for test-only rules
- `tests/backwards-compat.test.js` — test files with intentional NOSONAR
- `tests/llm/embeddings.test.js` — test files with intentional NOSONAR
- `tests/auto-handoff.test.js` — test files with intentional NOSONAR

## Exit Criteria

- [ ] S2486 count = 0 (confirmed by Sonar)
- [ ] Zero NOSONAR comments remain in `src/llm/gateway.ts`
- [ ] Zero NOSONAR comments remain in `src/ui/dashboard.js`
- [ ] No new NOSONAR comments introduced in `src/`
- [ ] TypeScript: 0 errors
- [ ] All Vitest tests pass (≥ 1711)
- [ ] No Sprint 84 rule regressions (S3776, S3358, S7781, S6551, S6571, S1128, S4323, S4325)
- [ ] `docs/sprint-85-checklist.md` fully checked with scan evidence

## What is Not Allowed

- Adding `// NOSONAR` — suppression, not a fix
- Adding `// intentional` or `// non-fatal` without a handler call — still an empty catch
- Editing only the flagged line without running the pre-fix scan — misses sibling occurrences
- Touching files outside scope — scope creep
- Closing with violations still showing in Sonar — the count in `sonar-all-issues.json` is the source of truth
