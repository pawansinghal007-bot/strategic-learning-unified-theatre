# Sprint 33 — Time-Bucketed Analytics, Global Analytics, and Export

## Goal
Extend the workspace analytics layer with hourly/daily routing trend buckets,
cross-workspace global rollups, and JSON/CSV export for external reporting.

## In scope
- Hourly and daily routing trend bucketing per workspace
- Global analytics across all workspaces
- JSON export of full workspace analytics payload
- CSV export of daily routing trend buckets
- IPC/preload/types surface for all four new operations
- Dashboard Time Buckets and Global Analytics panels
- Dashboard Export JSON and Export CSV controls

## Out of scope
- Chart rendering / visual graphs
- File-system export (save to disk)
- Time range filtering
- Provider comparison across workspaces

## Acceptance criteria
1. getWorkspaceTimeBuckets() returns daily/hourly bucket data correctly.
2. getGlobalWorkspaceAnalytics() returns per-workspace rollup across all stored history.
3. exportWorkspaceAnalyticsJson() returns valid JSON string.
4. exportWorkspaceAnalyticsCsv() returns CSV with correct header row.
5. All four operations accessible from renderer via preload bridge.
6. Dashboard panels for bucketed trends and global analytics functional.
7. Architecture sync completed.
