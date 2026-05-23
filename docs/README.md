# Documentation System

This repository uses a dedicated `docs/` section for curated product, technical, operations, security, marketing, and archive documentation.

## Structure
- `docs/product/` — product strategy, positioning, roadmap, and use cases.
- `docs/technical/` — architecture, system context, module map, data flow, and onboarding.
- `docs/operations/` — sprint workflow, handoff and snapshot practices, documentation policy, and audit trail.
- `docs/security/` — security and privacy guidance, data handling, and trust boundaries.
- `docs/marketing/` — launch briefing, messaging pillars, and FAQ.
- `docs/archive/` — historical or superseded documentation material.

## Intended audience
- Product and strategy teams: `docs/product/`
- Engineers and architects: `docs/technical/`
- Delivery and operations: `docs/operations/`
- Security reviewers and privacy owners: `docs/security/`
- Messaging and launch planning: `docs/marketing/`
- Historical review: `docs/archive/`

## What belongs where
- Database (`experience.db`) holds active sprint state, decisions, lessons, test baselines, and handoff details.
- `strategic-learning-unified-theatre-master-instructions.md` remains the execution manual and stable operating rules.
- Curated docs under `docs/` hold durable product, technical, operational, security, and marketing reference material.
- Archive holds superseded or historical material once it is no longer current.

## Sprint-close expectations
- At sprint close, update affected curated docs in the relevant subfolder when durable product, architecture, security, positioning, or launch outcomes change.
- Do not add active sprint logs, task lists, or temporary handoff notes to curated docs.
- Keep curated docs concise and grounded in verified repo state.
