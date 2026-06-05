# Sprint 29 — Workspace Policy Overrides + Context Injection

## Goal

Add per-workspace policy overrides and workspace context injection into
gateway requests so that routing and LLM behaviour can be tuned per project.

## In scope

- Workspace-scoped policy override storage and resolution
- Workspace context storage (summary, tags, last intent)
- Context prompt injection into gateway requests before routing
- Workspace-aware candidate selection in provider policy
- IPC handlers for workspace policy and context management
- Dashboard workspace panel
- llm:workspace CLI commands

## Out of scope

- Multi-user workspace sharing
- Workspace sync to remote storage
- Automatic context extraction from files
- Usage analytics per workspace (Sprint 30 candidate)

## Acceptance criteria

1. Setting a workspace policy override changes routing for that workspace.
2. Gateway injects workspace context summary into the provider prompt.
3. Workspace override merges with global policy — it does not replace it.
4. Dashboard can set, view, and clear workspace overrides and context.
5. CLI can manage workspace policy and context from the terminal.
6. No regression in Sprint 28 policy, preset, or sensitive-task behaviour.

## Estimated effort

24–32 hours, building on Sprint 28 policy engine.
