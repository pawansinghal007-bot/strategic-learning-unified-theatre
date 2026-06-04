# Sprint 27 — Concrete Closure Checklist

## Drop-in checklist
- [x] src/policies/provider-policy.ts committed
- [x] src/llm/routing-explainer.ts updated
- [x] src/llm/gateway.ts updated with policy filtering
- [x] electron-ui/ipc/provider-policy-handlers.cjs committed
- [x] electron-ui/main.cjs updated
- [x] electron-ui/preload.cjs updated
- [x] src/ui/types.d.ts updated
- [x] src/ui/provider-dashboard.html replaced
- [x] src/cli/llm-policy.ts committed
- [x] cli.js updated
- [x] Smoke tests written and passing
- [x] Sonar scan clean
- [x] Git tagged and pushed

## Acceptance bullet closure
- [x] Policy state persisted
- [x] Gateway respects routing mode
- [x] Gateway respects allow/block rules
- [x] Manual provider pinning works
- [x] Dashboard and CLI both control the same policy state

## Suggested next sprint
Sprint 28: sensitive-task rules + policy presets
- Research mode, coding mode, private mode, enterprise mode
- PII local-only rules
- Mode-driven provider behaviour presets
