# SPRINT 28 — ARCHITECTURE SYNC RULES

## Purpose

This file defines the mandatory architecture synchronisation rules
enforced after every sprint closure. It exists to prevent stale context
from causing phantom file references, wrong IPC assumptions, and
incorrect gateway or CLI bindings in subsequent sprints.

---

## Trigger matrix

The following file changes ALWAYS require an architecture update:

| Changed path                   | Update required                          |
| ------------------------------ | ---------------------------------------- |
| electron-ui/main.cjs           | PROJECT_ARCHITECTURE_AI_CONTEXT.md       |
| electron-ui/preload.cjs        | PROJECT_ARCHITECTURE_AI_CONTEXT.md       |
| electron-ui/ipc/\*\*           | PROJECT_ARCHITECTURE_AI_CONTEXT.md       |
| src/llm/gateway.ts             | PROJECT_ARCHITECTURE_AI_CONTEXT.md       |
| src/llm/\*.ts (new file)       | PROJECT_ARCHITECTURE_AI_CONTEXT.md       |
| src/policies/\*.ts (new file)  | PROJECT_ARCHITECTURE_AI_CONTEXT.md       |
| src/cli/\*.ts (new file)       | PROJECT_ARCHITECTURE_AI_CONTEXT.md       |
| src/ui/types.d.ts              | PROJECT_ARCHITECTURE_AI_CONTEXT.md       |
| src/ui/provider-dashboard.html | No update required unless wiring changed |
| docs/\*\*                      | No update required                       |
| tests/\*\*                     | No update required                       |

A new PROJECT_ARCHITECTURE_BASELINE-<timestamp>.md is generated when
structural changes occur (new folders, new entry points, new IPC files,
new service layers). PROJECT_ARCHITECTURE_BASELINE.md is then refreshed
to point to the latest baseline.

---

## Sprint closure enforcement

Every sprint T6 (smoke tests + closure) prompt must include:
