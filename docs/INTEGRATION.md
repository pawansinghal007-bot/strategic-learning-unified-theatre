# Sprint 28 Patch Integration

## Prerequisites

Sprints 18–27 must already be integrated.

## Files added or replaced

- src/policies/policy-presets.ts
- src/policies/sensitive-task-rules.ts
- src/policies/provider-policy.ts
- src/llm/routing-explainer.ts
- src/llm/gateway.ts
- electron-ui/ipc/provider-policy-handlers.cjs
- electron-ui/preload.cjs (updated)
- src/ui/types.d.ts
- src/ui/provider-dashboard.html
- src/cli/llm-policy.ts

## Architecture — unchanged from Sprint 27

Main: electron-ui/main.cjs
Preload: electron-ui/preload.cjs
IPC: electron-ui/ipc/provider-telemetry-handlers.cjs
electron-ui/ipc/provider-policy-handlers.cjs
Dashboard: src/ui/provider-dashboard.html
Services: src/llm/_.ts, src/policies/_.ts

## Smoke test

1. Run: node cli.js llm:policy:presets
2. Run: node cli.js llm:policy:preset research
3. Confirm research tasks prefer Perplexity
4. Send a prompt with password or API key — confirm local routing forced
5. Open dashboard — confirm active preset shown

## Suggested next sprint hooks

- Workspace memory store
- Context injection per workspace
