# Sprint 46 Patch Integration

## Prerequisites
Sprints 18–45 must already be integrated.

## New files
- src/security/security-overview/schema.ts
- src/security/security-overview/baseline.ts
- src/security/security-overview/suppressions.ts
- src/security/security-overview/normalizer.ts
- src/security/security-overview/index.ts
- electron-ui/ipc/security-overview-handlers.cjs

## Extended files
- electron-ui/main.cjs
- electron-ui/preload.cjs
- src/ui/types.d.ts
- src/ui/provider-dashboard.html

## New IPC channels
security-overview:summarize
security-overview:save-baseline
security-overview:load-suppressions
security-overview:save-suppressions
