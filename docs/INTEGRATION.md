# Sprint 38 Patch Integration

## Prerequisites

Sprints 18–37 must already be integrated.

## Files extended

- src/audit/audit-log.ts (2 new export functions + AuditExportResult interface)
- electron-ui/ipc/audit-handlers.cjs (2 new channels)
- electron-ui/preload.cjs (audit block updated)
- src/ui/types.d.ts (export result types added)
- src/ui/provider-dashboard.html (badge/alert/export buttons added)

## New IPC channels (Sprint 38)

audit:exportJson
audit:exportHtmlReport

## Architecture unchanged from Sprint 37

Main: electron-ui/main.cjs (no changes needed)
Audit: src/audit/audit-log.ts
IPC: electron-ui/ipc/audit-handlers.cjs

## Smoke test

1. Load dashboard — audit badge should show "verified" if log is clean
2. Click Export audit JSON — file written to project root
3. Click Export audit HTML — HTML file written to project root
4. Tamper audit-log.json manually — reload dashboard — badge shows "failed"
5. Run architecture sync check
