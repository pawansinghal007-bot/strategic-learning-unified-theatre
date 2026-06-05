# Sprint 33 Patch Integration

## Prerequisites

Sprints 18–32 must already be integrated.

## Files extended

- src/llm/routing-history.ts (4 new functions)
- electron-ui/ipc/workspace-routing-handlers.cjs (4 new channels)
- electron-ui/preload.cjs (4 new methods in workspaceRouting block)
- src/ui/types.d.ts (4 new method signatures)
- src/ui/provider-dashboard.html (Time Buckets + Global Analytics panels)

## New IPC channels (Sprint 33)

workspaceRouting:buckets
workspaceRouting:globalAnalytics
workspaceRouting:exportJson
workspaceRouting:exportCsv

## Architecture unchanged from Sprint 32

Main: electron-ui/main.cjs
Preload: electron-ui/preload.cjs
IPC: electron-ui/ipc/workspace-routing-handlers.cjs (now 10 channels)
Services: src/llm/routing-history.ts

## Smoke test

1. Run: node cli.js llm:workspace context:set ws-1 --summary "test"
2. Open dashboard — Load Time Buckets for ws-1
3. Open dashboard — Load Global Analytics
4. Open dashboard — Export JSON for ws-1
5. Open dashboard — Export CSV for ws-1
6. Run architecture sync check
