# Sprint 39 Patch Integration

## Prerequisites

Sprints 18–38 must already be integrated.

## New files

- src/governance/workspace-quotas.ts

## Files extended

- electron-ui/ipc/workspace-policy-handlers.cjs (8 new quota channels)
- electron-ui/preload.cjs (workspaceQuota block appended)
- src/ui/types.d.ts (workspaceQuota interface added)
- src/ui/provider-dashboard.html (Workspace Quotas panel added)

## New IPC channels (Sprint 39)

workspaceQuota:get
workspaceQuota:list
workspaceQuota:set
workspaceQuota:clear
workspaceQuota:recordUsage
workspaceQuota:usage
workspaceQuota:evaluate
workspaceQuota:clearUsage

## Architecture unchanged from Sprint 38

No new IPC files. No main.cjs changes. No audit-log.ts changes.

## Smoke test

1. Set a quota: dailyLimit=2, mode=block for a workspace
2. Record 3 usage entries — third should trigger exceeded event
3. Evaluate — result.blocked should be true
4. Open audit trail — workspaceQuota.exceeded event should appear
5. Run architecture sync check
