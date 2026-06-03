# Sprint 23 — Usage Tracking & CLI

## Goal
Add lightweight provider usage analytics so developers can see request counts,
token volume, and estimated cost per provider.

## In scope
- Per-provider request/success/failure counts
- Token totals and estimated cost
- Basic provider reset schedules
- llm:usage and llm:usage:reset CLI commands
- Health view enriched with usage summary

## Out of scope
- Persistent analytics storage
- Dashboard UI
- Cost-aware routing
- Detailed pricing engine
- Workspace-level analytics

## Acceptance criteria
1. Successful provider calls increment usage counters and token totals.
2. Failed provider calls increment failure counters.
3. llm:usage prints usage rows for all providers.
4. llm:usage:reset clears usage for one or all providers.
5. Sprint 22 health output shows basic usage context.

## Estimated effort
20–28 hours, building on Sprint 22 status and CLI patterns.
