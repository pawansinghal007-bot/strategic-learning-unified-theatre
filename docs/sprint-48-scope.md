# Sprint 48 — Baseline Drift and Comparison View

## Goal

Track security drift over time by comparing the current normalized
security overview against a saved baseline snapshot. Classify each
finding as introduced, persistent, or resolved.

## In scope

- src/security/security-overview/drift.ts — drift classifier module
- SeverityCounts and SecurityOverviewDriftResult types in schema.ts
- security-overview:compare-baseline IPC channel
- preload workspaceSecurity.compareBaseline method
- types.d.ts SeverityCounts, SecurityOverviewDriftResult, compareBaseline
- Dashboard Security Drift panel with baseline path input and 6 metrics

## Out of scope

- Scheduled automatic re-scan and re-compare
- Bulk triage actions on introduced findings
- Compliance mapping
- Persistent drift history over multiple baselines

## Acceptance criteria

1. compareSecurityOverviewWithBaseline() correctly classifies all 3 categories.
2. bySeverity counts match per-severity breakdown of each category.
3. loadSecurityBaselineSnapshot() returns null for missing path or file.
4. Dashboard Security Drift panel renders counts after compare.
5. Sprint 47 triage surfaces preserved.
