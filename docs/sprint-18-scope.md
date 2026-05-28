# Sprint 18 — Scope and Contracts

## Goal
Close the Week 1 acceptance bullet by shipping the foundation contracts that prevent 
architectural drift and give the next sprints a stable interface.

## Sprint outcome
This sprint is complete when the repo contains:
- a written scope statement for the product foundation
- a provider contract that all adapters must implement
- request and response schemas for gateway traffic
- a domain error hierarchy for provider, routing, memory, and validation failures

## In scope
- Provider adapter contract
- Shared request and response types
- Shared Zod schemas for validation
- Error hierarchy and exported error index
- Concrete folder placement for future work

## Out of scope
- Real provider adapters
- Gateway routing logic
- Health engine implementation
- Memory persistence
- Electron UI
- Analytics and billing logic

## Product boundary
The product is a unified AI workspace and orchestration layer, not a thin chatbot wrapper.
It must preserve continuity, standardize provider behavior, and keep later routing and memory 
work capability-centric rather than provider-centric.

## Acceptance criteria
1. ProviderAdapter exists with ask, optional stream, optional health, and capabilities methods.
2. ProviderRequest and ProviderResponse are defined in shared contracts.
3. Zod schemas exist for provider request, response, health, and token chunk validation.
4. Domain errors exist for provider, routing, memory, and validation classes.
5. All new files are in shared contracts / schemas / errors paths aligned with the WBS direction.

## Estimated effort
20–28 hours, matching the original sprint estimate for Week 1 scope and contracts.
