# Sprint 26 Patch Integration

## Prerequisites
Sprints 18–25 must already be integrated.

## Files added or replaced
- src/llm/routing-history.ts
- src/llm/routing-explainer.ts
- src/llm/gateway.ts
- electron-ui/ipc/provider-telemetry-handlers.cjs
- electron-ui/preload.cjs
- src/ui/provider-dashboard.html
- src/ui/types.d.ts
- src/cli/llm-routing.ts

## Architecture — unchanged from Sprint 25
Main:     electron-ui/main.cjs
Preload:  electron-ui/preload.cjs
IPC:      electron-ui/ipc/provider-telemetry-handlers.cjs
Dashboard: src/ui/provider-dashboard.html
Services: src/llm/*.ts

## Wiring flow
Gateway → routing-explainer → routing-history (JSON)
     ↓
IPC handler → renderer → dashboard panel

## Smoke test
1. Run one normal request through gateway
2. Run one request that forces a fallback
3. Open dashboard — confirm both appear in Recent routing decisions
4. Run: node cli.js llm:routing
5. Restart app — confirm history persists

## Suggested next sprint hooks
- Add policy modes (cloud/hybrid/local-only)
- Add approved/blocked provider lists
- Add enterprise allow/block rules
