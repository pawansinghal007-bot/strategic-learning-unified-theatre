# Sprint 35 — Concrete Closure Checklist

## Drop-in checklist

- [x] RoutingHistoryFilter interface added to routing-history.ts
- [x] Filter parameters added to all analytics functions
- [x] electron-ui/ipc/workspace-report-handlers.cjs created
- [x] electron-ui/ipc/workspace-routing-handlers.cjs updated
- [x] electron-ui/main.cjs updated
- [x] electron-ui/preload.cjs workspaceRouting updated + workspaceReport added
- [x] src/ui/types.d.ts updated
- [x] src/ui/provider-dashboard.html updated with filters and save buttons
- [x] docs/sprint-35-scope.md committed
- [x] Smoke tests written and passing
- [x] Sonar scan clean
- [x] Git tagged and pushed

## Suggested next sprint

Sprint 36: audit trail hardening

- Immutable append-only audit log separate from routing history
- Policy change audit events (mode change, block/allow, preset apply)
- Tamper-evident checksums
