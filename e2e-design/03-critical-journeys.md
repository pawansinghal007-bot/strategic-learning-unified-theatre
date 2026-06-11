# Critical User Journeys

## Journey Index

| ID  | Name                                  | Sprints Covered      | Failure Impact                                                                                      |
| --- | ------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| J1  | Account Rotation & AI Capture         | Sprint 11, Sprint 26 | High — breaks core developer workflow and invalidates downstream analytics for captured AI sessions |
| J2  | Workspace Policy & Context Routing    | Sprint 29, Sprint 26 | High — causes inconsistent routing and workspace governance gaps                                    |
| J3  | Approval & Audit Compliance           | Sprint 37, Sprint 38 | High — weakens governance, audit traceability, and sensitive-policy enforcement                     |
| J4  | Quota Governance & Access Control     | Sprint 39, Sprint 29 | High — risks blocked access or uncontrolled usage across workspaces                                 |
| J5  | Explainable Routing & Decision Review | Sprint 26, Sprint 29 | Medium — reduces trust in routing and slows incident response                                       |

## Journey Details

### J1 — Account Rotation & AI Capture

- Business goal
  - Keep developers productive by rotating VS Code/AI credentials securely and capturing browser-based AI interactions for later inspection.
- Features covered
  - Embedded AI browser pane and passive response capture
  - Account capture/storage and secure auth management
  - Browser prompt library and captured response retrieval
  - Daemon/tray monitoring of active state and session health
- Sprints covered
  - Sprint 11 (embedded browser capture foundation)
  - Sprint 26 (routing/dashboard foundation for traceability)
- Failure impact
  - High — if this journey fails, developers lose the main value of integrated AI capture and account switching, and the system cannot reliably surface session history or vendor-specific responses.

### J2 — Workspace Policy & Context Routing

- Business goal
  - Allow teams to tune AI behavior per project by applying workspace-specific policy overrides and injecting workspace context into routing decisions.
- Features covered
  - Workspace policy override store and dashboard management
  - Workspace context storage and prompt injection
  - Workspace-aware provider selection and routing
  - Dashboard workspace policy/context panel
- Sprints covered
  - Sprint 29 (workspace policy/context overrides)
  - Sprint 26 (routing decision and dashboard history foundation)
- Failure impact
  - High — broken workspace policy flows lead to stale or incorrect routing, making compliance controls unreliable and undermining project-level governance.

### J3 — Approval & Audit Compliance

- Business goal
  - Ensure sensitive policy changes are reviewed, approved, and recorded with auditable evidence for governance and compliance.
- Features covered
  - Workspace approvals request and resolution workflows
  - Policy audit event linkage and approval dashboard surface
  - Audit log export, HTML/JSON verification, and dashboard integrity badge
- Sprints covered
  - Sprint 37 (workspace approvals governance)
  - Sprint 38 (audit export and verification)
- Failure impact
  - High — a failure here compromises governance assurance, audit traceability, and the ability to prove that approval workflows were enforced correctly.

### J4 — Quota Governance & Access Control

- Business goal
  - Protect workspace budgets and provider capacity by enforcing per-workspace quotas with alert, fallback, or block behavior.
- Features covered
  - Workspace quota policy store and enforcement modes
  - Quota dashboard/panel with status and alerts
  - Audit events for quota usage and exceeded conditions
  - Integration with routing decision context and workspace governance
- Sprints covered
  - Sprint 39 (workspace quota governance)
  - Sprint 29 (workspace governance and routing context)
- Failure impact
  - High — if quota rules fail or misfire, requests can be blocked incorrectly or allowed unchecked, causing business disruption or overuse.

### J5 — Explainable Routing & Decision Review

- Business goal
  - Give operators and developers confidence by making provider selection reasons visible and easy to inspect across dashboard and CLI.
- Features covered
  - Persistent routing history and explanation recording
  - Dashboard and CLI inspection of recent decisions
  - Policy and fallback visibility in routing records
  - Support for later governance and quota review workflows
- Sprints covered
  - Sprint 26 (routing explanation and history)
  - Sprint 29 (workspace-aware routing context)
- Failure impact
  - Medium — without explainability, teams cannot easily trust or diagnose provider routing, which raises the cost of using the platform and increases governance risk.

## Coverage Rationale

- These journeys were chosen to cover broad, cross-cutting functionality rather than one feature per sprint.
- J1 covers the core developer workflow that spans embedded browser capture, account/session state, and dashboard visibility.
- J2, J3, and J4 each expose a different governance dimension: policy/routing, approvals/audit, and quota/enforcement.
- J5 covers the essential visibility layer that supports both developer troubleshooting and governance review.
- Together, the journeys exercise the main UI surfaces: embedded browser panel, dashboard policy panels, audit/approval interfaces, quota panels, and CLI/dashboard routing history.
- The set is intentionally compact, with 5 journeys that map to the most impactful end-to-end business outcomes in the current sprint timeline.
