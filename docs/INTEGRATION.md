# Sprint 22 Patch Integration

## Prerequisites
Sprints 18–21 must already be integrated.

## Files added
- src/llm/status.ts
- src/cli/llm-health.ts

## Wiring
registerLlmHealth() is wired into cli.js alongside other commands.

## Usage
node cli.js llm:health
node cli.js llm:health:reset
node cli.js llm:health:reset groq

## Suggested next sprint hooks
- Add token usage logging per provider
- Expose llm:usage CLI command
- Add latency and cost-aware routing
