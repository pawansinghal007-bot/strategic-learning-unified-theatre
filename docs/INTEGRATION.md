# Sprint 48 Patch Integration

## Prerequisites

Sprints 18–47 must already be integrated.

## New files

- src/security/security-overview/drift.ts

## Extended files

- src/security/security-overview/schema.ts (2 new interfaces)
- src/security/security-overview/index.ts (./drift export)
- electron-ui/ipc/security-overview-handlers.cjs (compare-baseline channel)
- electron-ui/preload.cjs (compareBaseline method)
- src/ui/types.d.ts (SeverityCounts, SecurityOverviewDriftResult, compareBaseline)
- src/ui/provider-dashboard.html (Security Drift panel)

## New IPC channel

security-overview:compare-baseline

## Usage

1. Run Security Overview summarize to populate security-overview-output.
2. Enter baseline JSON file path in Security Drift panel.
3. Click Compare With Baseline.
4. Dashboard shows introduced/persistent/resolved counts.
