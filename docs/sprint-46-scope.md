# Sprint 46 — Unified Security Overview, Baseline and Suppression Management

## Goal

Bridge scanner outputs from Sprint 44 (secrets) and Sprint 45 (risks)
into a unified security overview with baseline comparison, suppression
management, and a consolidated dashboard panel.

## In scope

- SecurityFindingSummary and SecurityOverviewSnapshot schemas
- loadSecurityBaseline() / saveSecurityBaseline() — reads/writes fingerprints
- loadSecuritySuppressions() / saveSecuritySuppressions() — reads/writes list
- isSecuritySuppressed() — fingerprint priority then file+ruleId fallback
- flattenFindings() — normalises secrets and risks into common shape
- buildSecurityOverviewSnapshot() — aggregates severity/kind counts
- security-overview:summarize/save-baseline/load-suppressions/save-suppressions IPC
- workspaceSecurity preload namespace
- Dashboard Security Overview panel above Secrets/Risks panels

## Out of scope

- Scheduled automatic re-scan on app start
- Suppression UI (add/remove from dashboard table)
- Re-ingestion trigger on sprint close
- Compliance benchmark mapping

## Acceptance criteria

1. summarize() correctly counts total/critical/high/secrets/risks/suppressed.
2. Suppressed finding reduces snapshot.suppressed by 1.
3. Baseline-matched finding sets baselineMatched: true.
4. saveBaseline() writes readable JSON; loadSecurityBaseline() reads it back.
5. Dashboard Security Overview panel renders snapshot metrics.
6. Sprint 44/45 scanner surfaces preserved.
