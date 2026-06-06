# Sprint 39 — Workspace Quota Governance

## Goal

Add per-workspace request quota enforcement with daily and weekly limits,
three enforcement modes (alert/fallback/block), and full audit event coverage.

## In scope

- WorkspaceQuotaPolicy store (dailyLimit, weeklyLimit, mode, fallbackProvider)
- recordWorkspaceQuotaUsage() records requests and checks limits
- evaluateWorkspaceQuotaStatus() returns routing decision outcome
- Audit events: workspaceQuota.set/clear/usageRecorded/exceeded
- IPC channels: get/list/set/clear/recordUsage/usage/evaluate/clearUsage
- preload workspaceQuota namespace
- types.d.ts workspaceQuota interface
- Dashboard Workspace Quotas panel with status and alert

## Out of scope

- Gateway integration (routing enforcement uses evaluateWorkspaceQuotaStatus — wiring is Sprint 40)
- Quota reset schedules
- Multi-workspace quota rollups
- Notification hooks

## Acceptance criteria

1. setWorkspaceQuotaPolicy() persists policy and writes audit event.
2. recordWorkspaceQuotaUsage() increments usage and writes exceeded event when limit breached.
3. evaluateWorkspaceQuotaStatus() correctly returns blocked/fallback/alert.
4. All 8 IPC channels registered and reachable from renderer.
5. Dashboard quota panel functional.
6. Sprint 38 audit export behavior unchanged.
