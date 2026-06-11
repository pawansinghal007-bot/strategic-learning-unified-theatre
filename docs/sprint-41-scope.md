# Sprint 41 — Quota Notifications, Threshold Alerts, Daily Reset Scheduler

## Goal

Add automated daily quota reset scheduling in Electron main, live threshold and exceeded notifications pushed to the renderer via IPC broadcast, and alertThresholdPct-based threshold detection.

## In scope

- alertThresholdPct field on WorkspaceQuotaPolicy
- thresholdReached fields in WorkspaceQuotaUsage and WorkspaceQuotaEvaluation
- WorkspaceQuotaNotification store per quota event
- getLatestWorkspaceQuotaNotification and listWorkspaceQuotaNotifications
- shouldRunWorkspaceQuotaDailyReset — one-per-day guard
- broadcastQuotaNotification to all Electron renderer windows
- workspaceQuota:latestNotification/notifications/resetDaily IPC channels
- Scheduler: setInterval 60s in main.cjs, starts on app.whenReady
- preload onNotification subscription method
- Dashboard live notification panel

## Out of scope

- Per-provider quota sub-limits
- External notification delivery
- Configurable scheduler interval
- Quota history retention TTL

## Acceptance criteria

1. thresholdReached true when count >= ceil(limit \* pct/100).
2. Threshold notification pushed when threshold crossed on recordUsage.
3. Exceeded notification pushed when limit exceeded.
4. dailyReset notification pushed and broadcast when reset runs.
5. Scheduler runs once per day, idempotent.
6. Renderer onNotification called when quota event occurs.
7. Dashboard shows live notification on push.
