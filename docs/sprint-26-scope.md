# Sprint 26 — Explainable Routing + Recent Decisions Log

## Goal
Make routing decisions visible and understandable by recording explanations
for provider selection and surfacing them in the dashboard and CLI.

## In scope
- Persistent recent routing history (JSON-backed)
- Human-readable reason strings for provider choice
- Fallback visibility in routing records
- Gateway hooks that record every routing decision
- Dashboard panel for recent decisions and latest explanation
- CLI commands to inspect and reset routing history

## Out of scope
- Advanced scoring engine
- Per-token cost-based route explanation
- Capability resolver rewrite
- Multi-user audit logs
- Policy engine integration

## Acceptance criteria
1. Each gateway success writes a routing decision with a human-readable reason.
2. Each gateway failure writes a failed routing decision record.
3. Dashboard shows recent routing decisions and latest explanation.
4. CLI can print and reset routing history.
5. Routing history survives restart.

## Estimated effort
24–32 hours, building on Sprint 25 IPC and dashboard patterns.
