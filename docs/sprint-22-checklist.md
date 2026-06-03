# Sprint 22 — Concrete Closure Checklist

## Drop-in checklist
- [x] src/llm/status.ts committed
- [x] src/cli/llm-health.ts committed
- [x] registerLlmHealth() wired into cli.js
- [x] Smoke tests written and passing
- [x] Sonar scan clean
- [x] Git tagged and pushed

## Acceptance bullet closure
- [x] CLI health inspection works (llm:health)
- [x] Health reset works (llm:health:reset)
- [x] Output clearly indicates which providers are available and why
- [x] No code changes required in gateway or adapters

## Suggested next sprint
Sprint 23: usage tracking
- Log tokens per provider
- Expose llm:usage CLI command
