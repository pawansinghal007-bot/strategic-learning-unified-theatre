# Sprint 35 Patch Integration

## Prerequisites

Sprints 18–34 must already be integrated.

## Files modified

- src/llm/routing-history.ts (filter params on all analytics functions)
- electron-ui/ipc/workspace-report-handlers.cjs (new — dialog save)
- electron-ui/ipc/workspace-routing-handlers.cjs (filter params added)
- electron-ui/main.cjs (registerWorkspaceReportHandlers wired)
- electron-ui/preload.cjs (workspaceRouting updated, workspaceReport added)
- src/ui/types.d.ts (filter types, workspaceReport interface)
- src/ui/provider-dashboard.html (filter controls and save buttons)

## New IPC channel (Sprint 35)

workspaceReport:save

## Architecture — extended from Sprint 34

Main:      electron-ui/main.cjs
Preload:   electron-ui/preload.cjs
IPC:       electron-ui/ipc/workspace-routing-handlers.cjs
           electron-ui/ipc/workspace-report-handlers.cjs

## Smoke test

1. Apply provider filter and load analytics — verify only that provider appears
2. Apply date range and verify results filtered
3. Click Save HTML to disk — Electron dialog should open
4. Verify saved file contains expected HTML content
5. Run architecture sync check
