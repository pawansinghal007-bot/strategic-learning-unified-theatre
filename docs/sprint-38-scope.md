# Sprint 38 — Audit Log Export and Verification Alerting

## Goal

Add JSON and HTML export of the full audit log (with verification result embedded), and surface audit integrity status in the dashboard via a badge and failure alert notification.

## In scope

- exportAuditLogJson() writes workspace- or global-scoped audit log to disk
- exportAuditLogHtmlReport() writes an HTML audit report with hash chain table
- Both embed the verification result so the export is self-verifying
- audit:exportJson and audit:exportHtmlReport IPC channels
- Preload audit block updated with exportJson and exportHtmlReport
- types.d.ts updated with export result types
- Dashboard audit trail panel with export buttons
- Dashboard verification badge and failure alert on load
- Filter parameter added to verify and latest in preload and types

## Out of scope

- Scheduled or automated audit exports
- Email or external notification hooks
- Approval workflow changes
- New storage layers

## Acceptance criteria

1. exportAuditLogJson() produces a parseable JSON file with verification data.
2. exportAuditLogHtmlReport() produces an HTML file with audit table.
3. Tampered log produces verification.ok === false in export output.
4. Dashboard badge shows "verified" or "failed" on load.
5. Failure alert is visible when verification fails.
6. Sprint 37 approvals surface intact.
