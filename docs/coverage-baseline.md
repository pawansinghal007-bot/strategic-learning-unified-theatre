# Coverage Baseline - Sprint 15.6

Generated: 2026-05-26
Threshold: 70% statements / 70% branches
Framework: Vitest with @vitest/coverage-v8

## Test Execution Summary

- Total Tests Run: 454 passed
- Coverage Command: `npm run coverage` generated `coverage/coverage-summary.json`
- Gate Result: Failed because branch coverage is below 70%

## Core Module Coverage Status

| Module        | Statements | Branches | Functions | Lines  | Gate |
|---------------|------------|----------|-----------|--------|------|
| secretStore   | 82.85%     | 72.22%   | 88.23%    | 83.82% | PASS |
| daemon        | absent     | absent   | absent    | absent | MISSING SUMMARY |
| browserBridge | 70.64%     | 55.27%   | 74.19%    | 72.49% | FAIL |
| handoff       | 73.39%     | 45.78%   | 72.72%    | 75.12% | FAIL |
| localLlm      | 52.99%     | 38.15%   | 52.63%    | 52.67% | FAIL |
| ideaStore     | 88.07%     | 78.44%   | 93.54%    | 88.97% | PASS |

## Module Files

- Secret Store: `src/secret-store.js`
- Daemon Runner: `src/daemon-runner.js`
- Browser Bridge: `src/browser-bridge.js`
- Agent Handoff: `src/agent-handoff.js`
- Local LLM: `src/local-llm.js`
- Idea Store: `src/idea-store.js`

## Known Coverage Gaps

- `src/daemon-runner.js`: configured as a core module, but absent from `coverage-summary.json`
- `src/browser-bridge.js`: branch coverage is 55.27%
- `src/agent-handoff.js`: branch coverage is 45.78%
- `src/local-llm.js`: statements 52.99%, branches 38.15%, functions 52.63%, lines 52.67%

## Sprint 15.6 Quality Gate Policy

All core modules must maintain at least 70% statement and branch coverage. Current coverage gaps remain sprint blockers until additional tests raise the named modules above threshold.
