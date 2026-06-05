# Sprint 29 Patch Integration

## Prerequisites

Sprints 18–28 must already be integrated.

## Files added or replaced

- src/policies/workspace-policy.ts (new)
- src/memory/request-context.ts (new — new folder src/memory/)
- src/policies/provider-policy.ts (extended)
- src/llm/gateway.ts (replaced)
- electron-ui/ipc/workspace-handlers.cjs (new)
- electron-ui/preload.cjs (appended)
- electron-ui/main.cjs (updated)
- src/ui/types.d.ts (replaced)
- src/ui/provider-dashboard.html (replaced)
- src/cli/llm-workspace.ts (new)
- cli.js (updated)

## Architecture — changes from Sprint 28

Main: electron-ui/main.cjs (registerWorkspaceHandlers added)
Preload: electron-ui/preload.cjs (workspacePolicy, workspaceContext namespaces added)
IPC: electron-ui/ipc/workspace-handlers.cjs (new)
Services: src/policies/workspace-policy.ts (new)
src/memory/request-context.ts (new)
CLI: src/cli/llm-workspace.ts (new)

## Paths that do NOT exist — never reference

- src/ipc/
- src/preload/
- src/main/
- tests/\*.test.ts

## Smoke test

1. node cli.js llm:workspace policy:set ws-1 --mode hybrid --provider gemini
2. node cli.js llm:workspace policy:get ws-1
3. node cli.js llm:workspace context:set ws-1 --summary "Routing debug project" --tags routing,debug
4. node cli.js llm:workspace context:get ws-1
5. Confirm gateway ask with workspaceId ws-1 injects context into prompt
6. Open dashboard — confirm workspace panel loads and saves correctly

## Suggested next sprint hooks

- Per-workspace routing history and usage analytics
- Workspace-aware provider health weighting
- Dashboard workspace context visibility
