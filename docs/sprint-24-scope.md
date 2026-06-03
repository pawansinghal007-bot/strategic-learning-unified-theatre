# Sprint 24 — Persistent Health & Usage Storage

## Goal

Persist provider health and usage telemetry so the system survives restarts
and becomes ready for dashboard consumption.

## In scope

- Local JSON file storage under the user home directory
- Persistent provider health state
- Persistent provider usage state
- Reset commands that modify persisted state
- Telemetry reset helper for health and usage together

## Out of scope

- SQLite migration
- Encryption at rest
- Dashboard UI
- Multi-workspace telemetry partitioning
- Cloud sync

## Acceptance criteria

1. Health state survives process restart.
2. Usage counters survive process restart.
3. Reset commands clear persisted data correctly.
4. Storage failures are logged instead of crashing the gateway.
5. The design remains compatible with a future move to SQLite.

## Estimated effort

20–28 hours, building on Sprint 23 usage and health modules.
