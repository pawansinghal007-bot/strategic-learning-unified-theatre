# Master Timeline — Sprints 1–55

## Completed Sprints 1–50

Sprint 50 (Security workflow hardening and dashboard unification) is complete.
Sprint 51 (Security overview stabilization and timeline reconciliation) is complete.
Sprint 52 (Bulk triage actions (applyBulkTriage, set-triage-bulk IPC)) is complete.
Sprint 53 (Cross-surface regression hardening (tests-only)) is complete.
Sprint 54 (Auto-scan trigger, drift history storage, security-overview:auto-scan IPC) is complete.
Sprint 55 (Human Tester E2E scaffold + UI validation suite + timeline reconciliation) is complete.

| Sprint | Focus                                                          | Status   |
| ------ | -------------------------------------------------------------- | -------- |
| 1–17   | Core platform, routing, analytics, audit, governance, policies | Complete |
| 18–29  | Provider telemetry, workspace analytics, reporting             | Complete |
| 30–35  | Workspace control plane, unified view, SVG charts              | Complete |
| 36–40  | Audit hardening, approvals governance, quota enforcement       | Complete |
| 41     | Quota notifications, threshold alerts, daily reset scheduler   | Complete |
| 42     | Knowledge layer RAG ingestion, Milvus, BGE-M3                  | Complete |
| 43     | Knowledge search + LLM integration                             | Complete |
| 44     | Secrets scanning, Gitleaks                                     | Complete |
| 45     | Dependency + image risk scanning, Dependency-Check + Trivy     | Complete |
| 46     | Unified security overview, baseline + suppression management   | Complete |
| 47     | Interactive triage workflow and finding state persistence      | Complete |
| 48     | Baseline drift and comparison view                             | Complete |
| 49     | AI-assisted finding explanation                                | Complete |
| 50     | Security workflow hardening and dashboard unification          | Complete |

## Completed Sprints 51–55

| Sprint | Focus                                                                     | Status   |
| ------ | ------------------------------------------------------------------------- | -------- |
| 51     | Security overview stabilization and timeline reconciliation               | Complete |
| 52     | Bulk triage actions (applyBulkTriage, set-triage-bulk IPC)                | Complete |
| 53     | Cross-surface regression hardening (tests-only)                           | Complete |
| 54     | Auto-scan trigger, drift history storage, security-overview:auto-scan IPC | Complete |
| 55     | Human Tester E2E scaffold + UI validation suite + timeline reconciliation | Complete |

## Sprint 54 reality note

Sprint 54 tag was applied to the auto-scan / drift-history sprint
(auto-scan.ts, drift-history.ts, security-overview:auto-scan IPC,
security-overview:list-drift-history IPC, preload autoScan and
listDriftHistory methods). The Human Tester Playwright scaffold was
committed immediately after without a new sprint tag. Sprint 55 covers
that work retroactively and adds the Vitest regression guard.

## Active

| Sprint | Focus                                                          | Status |
| ------ | -------------------------------------------------------------- | ------ |
| 56     | Selector hardening with data-testid + Playwright stabilization | Next   |

## Remaining

| Sprint | Focus                                                       | Status  |
| ------ | ----------------------------------------------------------- | ------- |
| 57     | BrowserPane overlap remediation and click-safety guarantees | Planned |
| 58     | Local-AI dashboard indicator and usability polish           | Planned |
| 59     | Playwright CI integration and artifact publishing           | Planned |
| 60     | Final workstation polish and packaging readiness            | Planned |

## Standing Architecture Rules (all future sprints)

- Never replace preload.cjs entirely — append/extend only
- Never add a second interface Window in types.d.ts
- Never reference dist/ paths in IPC handlers — always src/
- Tests are plain JavaScript (.test.js) — no TypeScript syntax
- Dashboard replacements must preserve all prior compatibility strings
- All IPC handlers use lazy require() inside handler functions
- Playwright tests live in tests/human/ and tests/ui/
  and run via playwright.human.config.cjs / playwright.ui.config.cjs
