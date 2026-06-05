# Sprint 35 — Filtered Analytics and Save-to-Disk Reports

## Goal
Add date range and provider filters to all workspace analytics operations,
and enable save-to-disk of HTML/JSON/CSV reports via Electron dialog.

## In scope
- RoutingHistoryFilter interface (startTime, endTime, provider)
- Filter parameter on all workspace analytics functions
- Electron showSaveDialog integration for HTML, JSON, and CSV reports
- workspaceReport:save IPC channel and workspaceReport preload namespace
- Dashboard filter controls
- Dashboard save-to-disk buttons
- Filter metadata included in JSON export output

## Out of scope
- Report scheduling or auto-export
- Multi-workspace batch export
- Saved filter presets
- Advanced query expressions

## Acceptance criteria
1. All workspace analytics functions respect the filter parameter.
2. Provider filter limits results to matching provider.
3. startTime/endTime filters limit results to the date range.
4. workspaceReport:save triggers Electron dialog and writes file.
5. Dashboard filter controls applied to all analytics loads.
