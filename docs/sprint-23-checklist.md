# Sprint 23 — Concrete Closure Checklist

## Drop-in checklist
- [x] src/llm/provider-usage.ts committed
- [x] src/llm/status.ts updated with usage fields
- [x] src/llm/gateway.ts updated with usage hooks
- [x] src/cli/llm-usage.ts committed
- [x] src/cli/llm-health.ts updated with usage totals
- [x] cli.js wired with registerLlmUsage
- [x] Smoke tests written and passing
- [x] Sonar scan clean
- [x] Git tagged and pushed

## Acceptance bullet closure
- [x] Usage counters increment on success and failure
- [x] Token totals visible per provider
- [x] Estimated cost visible per provider
- [x] Usage reset works for all or one provider
- [x] CLI health and usage outputs consistent

## Suggested next sprint
Sprint 24: persistent usage + health storage
- Counters survive app restarts
- Usable in dashboard
