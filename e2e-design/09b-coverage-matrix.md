# Test Coverage Matrix

## Feature Coverage

| Feature | Smoke | Regression | Full |
| --- | --- | --- | --- |
| Electron app boot and preload/IPC readiness | Covered | Covered | Partial |
| Account storage, health, and fake auth target switching | Partial | Covered | Covered |
| Embedded browser response listing and capture retrieval | Partial | Covered | Covered |
| Browser response ingestion and local learning state | Not Covered | Covered | Covered |
| Browser selector fallback, unknown platforms, and failed capture handling | Not Covered | Not Covered | Covered |
| Prompt library validation and persistence | Not Covered | Not Covered | Covered |
| Daemon status, stale PID, switch lock, and scheduled work | Partial | Partial | Covered |
| Workspace policy overrides and effective policy resolution | Partial | Covered | Covered |
| Workspace context and routing explanation metadata | Not Covered | Covered | Covered |
| Workspace approval request and resolution workflow | Partial | Covered | Covered |
| Audit latest, integrity verification, and clean export | Partial | Covered | Covered |
| Audit tamper detection and export edge cases | Not Covered | Partial | Covered |
| Workspace quota alert and block enforcement | Partial | Covered | Covered |
| Workspace quota fallback, reset, boundary, and notification isolation | Not Covered | Partial | Covered |
| Explainable routing history and provider fallback review | Partial | Covered | Covered |
| Routing large dataset filtering, pagination, and export boundaries | Not Covered | Partial | Covered |
| Feature flags fail-closed behavior | Partial | Not Covered | Covered |
| Governance store corruption and concurrent write recovery | Not Covered | Partial | Covered |
| Storage monitor path handling | Not Covered | Not Covered | Covered |
| CI artifact collection for screenshots, traces, videos, and reports | Covered | Covered | Covered |

## Sprint Coverage

| Sprint | Smoke | Regression | Full |
| --- | --- | --- | --- |
| Sprint 11: Embedded AI browser pane and passive response capture | Partial | Covered | Covered |
| Sprint 26: Explainable routing decisions and persistent history | Partial | Covered | Covered |
| Sprint 29: Workspace policy overrides, context injection, and workspace-aware routing | Partial | Covered | Covered |
| Sprint 37: Workspace approvals governance | Partial | Covered | Covered |
| Sprint 38: Audit export and self-verification | Partial | Covered | Covered |
| Sprint 39: Workspace quota governance and enforcement modes | Partial | Covered | Covered |
