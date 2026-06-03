# Sprint 21 — Fallback & Health Core

## Goal

Add health-aware fallback routing on top of Sprint 20 so the system can
gracefully skip failing providers and fall back to local.

## In scope

- Provider health state model
- Error to health classification
- Health-aware provider selection in the gateway
- Basic logging for health transitions

## Out of scope

- Persistent health storage
- Cooldown tuning per provider
- CLI status commands
- Reputation scoring or cost-aware fallback

## Acceptance criteria

1. Provider errors (quota, auth, timeout, unavailable) map into health states.
2. Gateway skips providers in a non-recovered unhealthy state.
3. Gateway still tries local as a last resort when cloud providers fail.
4. Health changes are logged with enough context for debugging.

## Estimated effort

24–36 hours, aligned with Week 4 fallback core expectations.
