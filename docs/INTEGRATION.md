# Sprint 25 Patch Integration

## Verified architecture

Main:

- electron-ui/main.cjs

Preload:

- electron-ui/preload.cjs

IPC:

- electron-ui/ipc/provider-telemetry-handlers.cjs

UI:

- src/ui/provider-dashboard.html

Types:

- src/ui/types.d.ts

Services:

- src/llm/provider-health.ts
- src/llm/provider-usage.ts

## Integration flow

Renderer
↓
window.providerTelemetry
↓
electron-ui/preload.cjs
↓
providerTelemetry:\* IPC channels
↓
electron-ui/ipc/provider-telemetry-handlers.cjs
↓
provider-health.ts / provider-usage.ts

## Wiring evidence

IPC HANDLER:
electron-ui/ipc/provider-telemetry-handlers.cjs

PRELOAD:
electron-ui/preload.cjs

UI:
src/ui/provider-dashboard.html

MAIN REGISTRATION:
electron-ui/main.cjs

## Smoke walkthrough

1. Generate provider activity.
2. Open dashboard.
3. Verify health and usage appear.
4. Execute reset action.
5. Verify refresh.
6. Restart application.
7. Verify telemetry persists.

## Next sprint hooks

- Routing decisions log
- Provider selection reasoning
- Latency trends
- Historical telemetry views
