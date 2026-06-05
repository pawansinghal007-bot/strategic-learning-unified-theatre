# Sprint 29 — Concrete Closure Checklist

## Drop-in checklist

- [x] src/policies/workspace-policy.ts committed
- [x] src/memory/request-context.ts committed
- [x] src/policies/provider-policy.ts extended
- [x] src/llm/gateway.ts replaced
- [x] electron-ui/ipc/workspace-handlers.cjs created
- [x] electron-ui/preload.cjs appended
- [x] electron-ui/main.cjs updated
- [x] src/ui/types.d.ts replaced
- [x] src/ui/provider-dashboard.html replaced
- [x] src/cli/llm-workspace.ts created
- [x] cli.js updated
- [x] Smoke tests written and passing
- [x] Sonar scan clean
- [x] Git tagged and pushed

## Acceptance bullet closure

- [x] Workspace policy override resolves and merges with global
- [x] Context injected into gateway prompt when workspace context exists
- [x] Dashboard workspace panel functional
- [x] CLI workspace commands functional
- [x] Sprint 28 behaviour unchanged

## Suggested next sprint

Sprint 30 candidates:

- Usage analytics per workspace
- Routing history filtering by workspace
- Dashboard workspace context visibility improvements
- Provider health weighted by workspace usage patterns
