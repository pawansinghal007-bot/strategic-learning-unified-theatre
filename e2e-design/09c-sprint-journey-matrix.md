# Sprint-to-Journey Matrix

## Matrix

| Sprint | Capability | Covering Journeys | Coverage Notes |
| --- | --- | --- | --- |
| Sprint 11 | Embedded AI browser pane and passive response capture for ChatGPT, Claude, Gemini, and Perplexity | J1 Account Rotation & AI Capture | J1 covers browser pane visibility, platform switching, seeded response retrieval, capture ingestion, selector fallback, and capture failure behavior across smoke, regression, and full suites. |
| Sprint 26 | Explainable routing decisions with persistent history, reason strings, and CLI/dashboard visibility | J1 Account Rotation & AI Capture; J2 Workspace Policy & Context Routing; J5 Explainable Routing & Decision Review | J5 is the primary journey for routing history and decision review. J2 covers workspace-aware routing explanations. J1 depends on traceable dashboard state for captured AI sessions. |
| Sprint 29 | Per-workspace policy overrides, workspace context injection, and workspace-aware provider routing | J2 Workspace Policy & Context Routing; J4 Quota Governance & Access Control; J5 Explainable Routing & Decision Review | J2 is primary for policy/context behavior. J4 uses Sprint 29 workspace governance as quota context. J5 verifies routing records reflect workspace policy and context. |
| Sprint 37 | Workspace approvals governance with approval requests, resolution, and policy audit event linkage | J3 Approval & Audit Compliance | J3 covers sensitive policy approval request, blocked pre-approval application, resolution, policy application, approval history, and audit linkage. |
| Sprint 38 | Audit log JSON/HTML export with self-verification and dashboard verification badge/alerts | J3 Approval & Audit Compliance | J3 covers audit latest, integrity verification, clean export, tamper detection, export edge cases, and dashboard/API consistency. |
| Sprint 39 | Workspace quota governance with per-workspace daily/weekly limits and alert/fallback/block enforcement modes | J4 Quota Governance & Access Control; J5 Explainable Routing & Decision Review | J4 is primary for quota policy, usage, alert/block/fallback enforcement, reset boundaries, and notifications. J5 verifies quota effects are visible in routing explanations. |

## Sprints With No Journey Coverage

None. Every sprint listed in the current E2E design is mapped to at least one critical journey.

## Journey Legend

| Journey | Name | Primary Sprint Coverage |
| --- | --- | --- |
| J1 | Account Rotation & AI Capture | Sprint 11, Sprint 26 |
| J2 | Workspace Policy & Context Routing | Sprint 29, Sprint 26 |
| J3 | Approval & Audit Compliance | Sprint 37, Sprint 38 |
| J4 | Quota Governance & Access Control | Sprint 39, Sprint 29 |
| J5 | Explainable Routing & Decision Review | Sprint 26, Sprint 29 |
