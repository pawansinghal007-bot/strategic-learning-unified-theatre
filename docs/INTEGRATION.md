# Sprint 21 Patch Integration

## Prerequisites
Sprint 18, 19, and 20 files must already exist in the repo.

## Files added or replaced
- src/llm/provider-health.ts
- src/llm/gateway.ts

## Fallback semantics
- Providers tried in order: groq > gemini > openai > perplexity > local
- On domain errors, provider is marked unhealthy with a cooldown
- Unhealthy providers are skipped on subsequent calls until cooldown expires
- Local is always last resort unless explicitly excluded

## Suggested next sprint hooks
- Expose getProviderHealthSnapshot() via a CLI health command
- Add per-provider cooldown configuration
- Add latency and cost-aware routing
