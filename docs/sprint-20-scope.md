# Sprint 20 — Provider Expansion

## Goal
Close the Week 3 acceptance bullet by expanding the provider layer, standardizing streaming behavior, and normalizing provider errors.

## In scope
- Base provider adapter
- OpenAI, Gemini, Groq, Perplexity, and Local adapters
- Streaming contract alignment
- Error normalization mapper
- Expanded provider exports and gateway registration

## Out of scope
- Live API calls
- Health engine and cooldown windows
- Fallback reputation scoring
- Cost optimization engine
- Real analytics persistence

## Acceptance criteria
1. More than one provider adapter is wired through the gateway.
2. Provider adapters share a common base implementation.
3. Streaming returns a normalized token chunk shape.
4. Provider errors map into domain-level provider errors.
5. Gateway continues working without router rewrites when providers are added.

## Estimated effort
28–40 hours, aligned with Week 3 provider expansion estimate.
