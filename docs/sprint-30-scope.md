# Sprint 30 — Workspace Control Plane Consolidation

## Goal
Consolidate the Sprint 29 workspace surface by filling the two intentional
gaps (workspacePolicy:resolve and workspaceContext:prompt) and verifying
complete alignment between IPC, preload, renderer types, dashboard, and CLI.

## In scope
- workspacePolicy:resolve IPC handler and preload method
- workspaceContext:prompt IPC handler and preload method
- Renderer type declarations for both new methods
- Dashboard workspace panel additions for resolve and buildPrompt
- Architecture sync

## Out of scope
- New workspace features beyond filling Sprint 29 gaps
- Multi-workspace analytics
- Routing history filtering by workspace
- Provider health per-workspace

## Acceptance criteria
1. workspacePolicy:resolve accessible from renderer via preload bridge.
2. workspaceContext:prompt (buildPrompt) accessible from renderer via preload bridge.
3. Both new methods typed in src/ui/types.d.ts.
4. Dashboard workspace panel calls resolve and buildPrompt.
5. Architecture sync completed.

## Estimated effort
4–6 hours, gap-fill sprint with no new features.
