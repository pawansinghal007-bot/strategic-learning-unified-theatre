# Sprint 85 Checklist

## Track 1 — Documentation (parallel, no code risk)

- [ ] T1.1 Create sprint scope file (`docs/sprint-85-scope.md`)
- [ ] T1.2 Create sprint checklist (`docs/sprint-85-checklist.md`)
- [ ] T1.3 Create guard tests (`tests/sprint85-guard.test.js`)

## Track 2 — Fix S2486 in `src/llm/gateway.ts`

- [ ] 2.S Run pre-fix scan (Sonar S2486 hits, NOSONAR lines, catch blocks, helpers)
- [ ] 2.1 Add shared non-fatal error logger to gateway.ts
- [ ] 2.2 Replace each NOSONAR catch block with handler call
- [ ] 2.V Verify: TypeScript → Vitest → Sonar → fetch-violations

## Track 3 — Fix S2486 in `src/ui/dashboard.js`

- [ ] 3.S Run pre-fix scan (Sonar S2486 hits, NOSONAR lines, catch blocks, UI patterns)
- [ ] 3.1 Add or reuse non-fatal UI error handler
- [ ] 3.2 Replace each empty/suppressed catch block
- [ ] 3.V Verify: Vitest → Sonar → fetch-violations

## Track 4 — Regression Check

- [ ] 4.1 Check Sprint 84 rules (S3776, S3358, S7781, S6551, S6571, S1128, S4323, S4325)

## Final Verification

- [ ] F.1 TypeScript: 0 errors
- [ ] F.2 Guard tests pass
- [ ] F.3 Full test suite: ≥ 1711 tests pass
- [ ] F.4 Sonar scan: ANALYSIS SUCCESSFUL
- [ ] F.5 Final violation count: S2486 = 0
- [ ] F.6 Confirm zero NOSONAR remaining in `src/`

## Scan Evidence

### Baseline (Step 0)

- Total violations: 7
- S2486 count: 7 (5 in gateway.ts, 2 in dashboard.js)
- NOSONAR locations: 5 in gateway.ts, 0 in dashboard.js

### Track 2 Evidence

- Scan output: [paste scan output here]
- Fix type: structural (add handler, replace catch blocks)
- Verification: [paste verification output here]

### Track 3 Evidence

- Scan output: [paste scan output here]
- Fix type: structural (add handler, replace catch blocks)
- Verification: [paste verification output here]

### Track 4 Evidence

- Sprint 84 rules checked: [paste output here]
- Regressions: [none found = PASS]

### Final Verification Evidence

- TypeScript: [paste output here]
- Guard tests: [paste output here]
- Full test suite: [paste output here]
- Sonar scan: [paste output here]
- Final count: [paste output here]
- NOSONAR check: [paste output here]
