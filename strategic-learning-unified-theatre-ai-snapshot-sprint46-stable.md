SPRINT 46 COMPLETE: UNIFIED SECURITY OVERVIEW, BASELINE & SUPPRESSION MANAGEMENT

  SPRINT SUMMARY:
    T1  security-overview backend  src/security/security-overview/ — schema,
                                   baseline, suppressions, normalizer, index
    T2  IPC + main.cjs             security-overview-handlers.cjs created,
                                   main.cjs extended
    T3  preload + types + dash     workspaceSecurity preload namespace,
                                   types.d.ts, dashboard Security Overview panel,
                                   docs (sprint-46-scope.md, sprint-46-checklist.md,
                                   INTEGRATION.md)
    T4  smoke tests + closure      security-overview.test.js (11 tests),
                                   sprint46-smoke.test.js (8 tests)

  STATUS:
    vitest pass — 106 files / 1000 tests
    typecheck clean
    sonar clean
    tagged sprint-46-complete

  DELIVERABLES:
    [x] SecurityFindingSummary and SecurityOverviewSnapshot schemas
    [x] emptySecurityOverviewSnapshot() helper
    [x] buildSecurityOverviewSnapshot() aggregates severity/kind counts
    [x] loadSecurityBaseline() — array and findings-wrapper JSON
    [x] saveSecurityBaseline() — writes generatedAt + findings array
    [x] loadSecuritySuppressions() — returns [] on missing file
    [x] saveSecuritySuppressions() — writes suppression list
    [x] isSecuritySuppressed() — fingerprint priority then file+ruleId
    [x] flattenFindings() — normalises secrets/risks into SecurityFindingSummary
    [x] normalizeSeverity() — maps raw string to SecuritySeverity
    [x] security-overview:summarize IPC channel
    [x] security-overview:save-baseline IPC channel
    [x] security-overview:load-suppressions IPC channel
    [x] security-overview:save-suppressions IPC channel
    [x] registerSecurityOverviewHandlers() wired into main.cjs
    [x] workspaceSecurity preload namespace (4 methods)
    [x] types.d.ts workspaceSecurity inside Window (no duplicate block)
    [x] Dashboard Security Overview panel — 6 metrics above Secrets panel
    [x] Sprint 44/45 scanner surfaces preserved
    [x] Smoke tests passing
    [x] Architecture sync completed — new baseline generated

  ARCHITECTURE CHANGES THIS SPRINT:
  New folder:
    - src/security/security-overview/
  New files:
    - src/security/security-overview/schema.ts
    - src/security/security-overview/baseline.ts
    - src/security/security-overview/suppressions.ts
    - src/security/security-overview/normalizer.ts
    - src/security/security-overview/index.ts
    - electron-ui/ipc/security-overview-handlers.cjs
    - tests/security-overview.test.js
    - tests/sprint46-smoke.test.js
    - docs/sprint-46-scope.md
    - docs/sprint-46-checklist.md
  Extended:
    - electron-ui/main.cjs
    - electron-ui/preload.cjs
    - src/ui/types.d.ts
    - src/ui/provider-dashboard.html
  Overwritten:
    - docs/INTEGRATION.md
  Unchanged:
    - src/security/secrets/*
    - src/security/risks/*
    - src/audit/audit-log.ts
    - electron-ui/ipc/audit-handlers.cjs

  SECURITY OVERVIEW DESIGN NOTES:
    flattenFindings() normalises both SecretFinding (kind="secret") and
    RiskFinding (kind="risk") into a common SecurityFindingSummary shape
    buildSecurityOverviewSnapshot() counts by severity + kind + suppressed
    Baseline and suppressions use file-based JSON (fs sync reads)
    IPC handlers accept raw scanner payloads and apply flattening internally

  IPC SURFACE ADDED (sprint 46):
    security-overview:summarize      — flatten + suppress + baseline findings
    security-overview:save-baseline  — writes fingerprints to JSON file
    security-overview:load-suppressions — reads suppressions list
    security-overview:save-suppressions — writes suppressions list

  PRELOAD SURFACE ADDED (sprint 46):
    window.workspaceSecurity.summarize(payload)
    window.workspaceSecurity.saveBaseline(baselinePath, fingerprints)
    window.workspaceSecurity.loadSuppressions(suppressionsPath)
    window.workspaceSecurity.saveSuppressions(suppressionsPath, suppressions)

  ARCHITECTURE SYNC:
    Trigger files: security-overview-handlers.cjs, main.cjs, preload.cjs, types.d.ts
    Structural change: YES — new folder src/security/security-overview/
    New baseline: PROJECT_ARCHITECTURE_BASELINE-2026-06-12T07-58-46.md
    PROJECT_ARCHITECTURE_AI_CONTEXT.md updated
    PROJECT_ARCHITECTURE_BASELINE.md refreshed

  NEXT:
    Sprint 47: Interactive triage workflow — finding state persistence,
    dashboard triage controls, drift-ready state counts

  ARCHITECTURE SYNC STATUS: [UPDATED]
