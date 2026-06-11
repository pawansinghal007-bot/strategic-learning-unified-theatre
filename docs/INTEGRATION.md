# Sprint 41 Patch Integration

## Prerequisites

Sprints 18–40 must already be integrated.

## Files extended

- src/governance/workspace-quotas.ts
- electron-ui/ipc/workspace-policy-handlers.cjs
- electron-ui/main.cjs
- electron-ui/preload.cjs
- src/ui/types.d.ts
- src/ui/provider-dashboard.html

## New IPC channels

workspaceQuota:latestNotification
workspaceQuota:notifications
workspaceQuota:resetDaily

## New IPC event (broadcast from main to renderer)

workspaceQuota:notification

## Architecture notes

Scheduler in main.cjs runs every 60s, resets once per calendar day.
broadcastQuotaNotification() sends to all BrowserWindow instances.
