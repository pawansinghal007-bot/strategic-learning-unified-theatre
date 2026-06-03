# Sprint 23 Patch Integration

## Prerequisites
Sprints 18–22 must already be integrated.

## Files added or replaced
- src/llm/provider-usage.ts
- src/llm/status.ts
- src/llm/gateway.ts
- src/cli/llm-usage.ts
- src/cli/llm-health.ts

## Wiring
registerLlmUsage() wired into cli.js alongside registerLlmHealth().

## Usage
node cli.js llm:health
node cli.js llm:usage
node cli.js llm:usage:reset
node cli.js llm:usage:reset groq

## Suggested next sprint hooks
- Persist usage counters to disk between restarts
- Add cost-aware routing based on estimatedCostUsd
- Dashboard UI over health and usage state
