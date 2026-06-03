# Sprint 22 — Provider Status & Health CLI

## Goal
Expose provider health and fallback state to developers via a simple CLI,
building on the health-aware routing from Sprint 21.

## In scope
- Provider status rows (name, hasKey, state, available, recoversIn)
- Health-aware availability checks
- llm:health and llm:health:reset CLI commands

## Out of scope
- Dashboard UI
- Persistent storage of health state
- Advanced analytics or charts
- Cost or latency visualization

## Acceptance criteria
1. llm:health prints a row per known provider with state and availability.
2. Health state reflects Sprint 21 classification (exhausted, temporarily_down,
   auth_error, healthy).
3. llm:health:reset clears health for all or one provider.
4. No changes required to gateway or adapters to use the CLI.

## Estimated effort
16–24 hours, as a light follow-up on the Sprint 21 health core.
