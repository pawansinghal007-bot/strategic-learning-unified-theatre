# Sprint Dependencies

## Dependency List

- Sprint 11 is foundational. It delivers the embedded browser pane and passive response capture, which later dashboard analytics and capture-related UI panels build on.
- Sprint 26 depends on prior routing and dashboard capabilities, especially the gateway and provider-selection surfaces introduced before Sprint 26. It is a prerequisite for later explainability, audit, and quota features.
- Sprint 29 depends on workspace policy and routing engine foundations from earlier policy and gateway sprints (notably Sprint 28 policy engine work). It enables workspace-specific routing behavior and workspace context injection.
- Sprint 37 depends on Sprint 29 workspace policy overrides and related audit event infrastructure. Workspace approvals are a governance extension of policy overrides and require the workspace policy/approval IPC namespace.
- Sprint 38 depends on existing audit log infrastructure and the governance/audit UI surfaces. It extends audit capability with export and verification, and explicitly preserves Sprint 37 approvals visibility.
- Sprint 39 depends on workspace governance and routing history features. Workspace quota enforcement is layered on top of workspace policy, audit events, and routing decision recording.

## Dependency Map

- Sprint 11
  - foundational for embedded browser/dashboard capture surfaces
- Sprint 26
  - depends on prior routing/dashboard foundation
  - provides explainable routing history used by later governance and quota analysis
- Sprint 29
  - depends on Sprint 26 and earlier policy/gateway work
  - provides workspace overrides, context injection, and workspace-aware routing
- Sprint 37
  - depends on Sprint 29 workspace policy and audit integration
  - adds approval workflows and dashboard approval panel
- Sprint 38
  - depends on audit infrastructure and Sprint 37 approval visibility
  - adds export and verification alerts for audit logs
- Sprint 39
  - depends on Sprint 29 workspace governance and routing history
  - brings quota enforcement and dashboard quota panel

## Key Risk Points (sprints where a failure cascades broadly)

- Sprint 11: A failure here would undermine the browser pane capture experience and any downstream analytics tied to captured AI sessions.
- Sprint 26: If explainable routing history is unreliable, later governance, quota, and audit tracing lose critical decision context.
- Sprint 29: Broken workspace policy overrides would compromise workspace-specific routing and make approvals and quota enforcement inconsistent.
- Sprint 37: Approval workflow failure would cascade into governance coverage gaps and weaken sensitive-policy enforcement.
- Sprint 39: Workspace quota enforcement issues would directly affect access control and could disrupt many downstream request routing decisions.
