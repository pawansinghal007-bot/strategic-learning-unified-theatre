# Sprint 25 — Dashboard IPC + Provider Telemetry Panel

## Goal
Expose persistent provider telemetry in Electron through IPC handlers, preload bridges, and a lightweight dashboard panel.

## In scope

- Provider telemetry IPC handlers
- Safe preload bridge exposure using contextBridge
- Provider telemetry dashboard
- Provider health reset actions
- Provider usage reset actions
- Global telemetry reset action

## Out of scope

- React migration
- Charts library
- Multi-tab dashboard
- Authentication
- Workspace memory UI

## Acceptance criteria

1. Renderer fetches provider status through IPC.
2. Renderer resets provider health and usage through IPC.
3. Dashboard displays availability, failures, tokens, and estimated cost.
4. Dashboard reflects persisted telemetry.
5. Renderer uses no direct Node APIs.

## Implementation files

- electron-ui/main.cjs
- electron-ui/preload.cjs
- electron-ui/ipc/provider-telemetry-handlers.cjs
- src/ui/provider-dashboard.html
- src/ui/types.d.ts
- src/llm/provider-health.ts
- src/llm/provider-usage.ts

## Estimated effort
20–28 hours.
