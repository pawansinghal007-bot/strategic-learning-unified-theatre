# Sprint 27 Patch Integration

## Prerequisites
Sprints 18–26 must already be integrated.

## Files added or replaced
- src/policies/provider-policy.ts
- src/llm/routing-explainer.ts
- src/llm/gateway.ts
- electron-ui/ipc/provider-policy-handlers.cjs
- electron-ui/preload.cjs (appended)
- electron-ui/main.cjs (updated)
- src/ui/types.d.ts
- src/ui/provider-dashboard.html
- src/cli/llm-policy.ts

## Architecture — unchanged from Sprint 26
Main:      electron-ui/main.cjs
Preload:   electron-ui/preload.cjs
IPC:       electron-ui/ipc/provider-telemetry-handlers.cjs
           electron-ui/ipc/provider-policy-handlers.cjs
Dashboard: src/ui/provider-dashboard.html
Services:  src/llm/*.ts, src/policies/*.ts

## Smoke test
1. Run: node cli.js llm:policy
2. Run: node cli.js llm:policy:mode local-only
3. Send a request — verify local is selected
4. Run: node cli.js llm:policy:pin gemini
5. Open dashboard — verify policy snapshot matches CLI state
6. Restart — verify policy persists

## Suggested next sprint hooks
- Add policy presets (research/coding/private/enterprise)
- Add PII local-only detection rules
- Add mode-driven provider behaviour
