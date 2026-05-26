# Coverage Baseline — Sprint 15.6

Generated: 2026-05-26  
Threshold: 70% statements / 70% branches  
Framework: Vitest with @vitest/coverage-v8

## Test Execution Summary

- **Total Tests Run**: 328 passed, 1 failed
- **Coverage Command**: `npm run coverage` executed successfully
- **Framework**: vitest v4.1.7 with V8 coverage provider

## Core Module Coverage Status

| Module         | Statements | Branches | Functions | Lines | Gate |
|----------------|-----------|----------|-----------|-------|------|
| secretStore    | TBD       | TBD      | TBD       | TBD   | PENDING |
| daemon         | TBD       | TBD      | TBD       | TBD   | PENDING |
| browserBridge  | TBD       | TBD      | TBD       | TBD   | PENDING |
| handoff        | TBD       | TBD      | TBD       | TBD   | PENDING |
| localLlm       | TBD       | TBD      | TBD       | TBD   | PENDING |
| ideaStore      | TBD       | TBD      | TBD       | TBD   | PENDING |

## Module Files

- Secret Store: `src/secret-store.js`
- Daemon Runner: `src/daemon-runner.js`
- Browser Bridge: `src/browser-bridge.js`
- Agent Handoff: `src/agent-handoff.js`
- Local LLM: `src/local-llm.js`
- Idea Store: `src/idea-store.js`

## Known Issues & Notes

### Coverage Summary Generation
The `npm run coverage` command runs vitest with the V8 coverage provider configured in `vitest.config.js`. The reporter is set to generate JSON summaries, but the `coverage-summary.json` file is not appearing in the `coverage/` directory after execution. The raw V8 coverage data is present in `coverage/.tmp/`. Next steps:

1. Verify that coverage thresholds in vitest.config.js are properly enforcing gate checks
2. Run the coverage-gate test to measure which modules fall below the 70% threshold
3. Extract actual percentages from coverage data and populate this baseline table

### Test Files That Need Coverage Expansion

The following test files test the core modules:
- `tests/secret-store.test.js` → needs expansion
- `tests/daemon-runner.test.js` → needs expansion  
- `tests/browser-bridge.test.js` → integration tests present, unit coverage may be incomplete
- `tests/agent-handoff.test.js` → existing tests present
- `tests/local-llm.test.js` → existing tests present
- `tests/idea-store.test.js` → extensive tests present (30+ tests)

### Next Actions

Modules below the 70% threshold (to be determined after gate test runs):
- Coverage gaps will be identified in Task 4 (regression tests)
- Additional tests should be added to bring statements and branches above 70%
- This baseline serves as the frozen snapshot for Sprint 15.6

## Sprint 15.6 Quality Gate Policy

All core modules must maintain:
- **Statements**: ≥ 70%
- **Branches**: ≥ 70%
- **Functions**: ≥ 70%
- **Lines**: ≥ 70%

Modules failing the gate block sprint completion until coverage is improved through regression tests or enhanced unit test coverage.
