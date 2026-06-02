# Sprint 19 — Base Gateway

## Goal

Close the Week 2 acceptance bullet by shipping the first working gateway, wiring one
provider, normalizing responses, and adding basic logs.

## In scope

- Gateway class and exported singleton
- One provider adapter (local stub)
- Request validation using Sprint 18 schemas
- Response validation and normalization
- Basic JSON logging hooks

## Out of scope

- Multiple cloud providers
- Health engine and cooldowns
- Quota-aware routing
- Streaming pipeline
- Memory injection middleware
- Analytics persistence

## Acceptance criteria

1. Gateway.ask() exists and validates request input.
2. At least one adapter is wired and callable through the gateway.
3. Gateway normalizes provider responses before returning.
4. Gateway emits basic logs for start, try, success, and failure events.
5. Failures are surfaced as domain errors rather than raw opaque exceptions.

## Estimated effort

24–32 hours, aligned with Week 2 estimate for Base Gateway.
