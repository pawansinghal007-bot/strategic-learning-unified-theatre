# Sprint 21 — Concrete Closure Checklist

## Drop-in checklist
- [x] src/llm/provider-health.ts committed
- [x] src/llm/gateway.ts replaced with health-aware version
- [x] Smoke tests written and passing
- [x] Sonar scan clean
- [x] Git tagged and pushed

## Acceptance bullet closure
- [x] Health state tracked per provider
- [x] Domain errors drive health classification
- [x] Gateway skips unhealthy providers during fallback
- [x] Local fallback path preserved
- [x] Logs show provider failures and subsequent skips

## Suggested next sprint
Sprint 22: health CLI + advanced routing
- Expose health via CLI or dashboard
- Tune cooldowns per provider
- Layer in latency/cost/reputation routing
