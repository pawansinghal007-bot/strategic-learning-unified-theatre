# Documentation Policy

This file defines where different kinds of project information belong.

## Source of truth
- Database (`experience.db`): active sprint state, lessons learned, architectural decisions, test baselines, and handoff state.
- Master instructions: execution manual, stable operating rules, architecture summaries, and audit-relevant updates at sprint close.
- Curated docs: durable product, technical, operations, security, and marketing records that support the repo over time.
- Archive: superseded or historical documentation material.

## Maintenance matrix
| Area | Source of truth | Update trigger | Owner at sprint close |
|---|---|---|---|
| Active sprint state | Database | During sprint | Sprint lead / agent |
| Lessons and decisions | Database | As decisions are made | Sprint lead / agent |
| Handoff state | Database | During sprint | Sprint lead / agent |
| Execution rules | Master instructions | Sprint close as needed | Release owner |
| Product positioning | Curated docs | Durable product changes | Product owner |
| Architecture details | Curated docs | Durable architecture changes | Technical lead |
| Operations process | Curated docs | Process changes | Operations lead |
| Security guidance | Curated docs | Security posture changes | Security owner |
| Marketing messaging | Curated docs | Launch or positioning changes | Marketing owner |
| Historical records | Archive | When docs are superseded | Documentation steward |

## Principles
- Keep active sprint state in the database, not in curated docs.
- Keep master instructions as the execution manual and stable rule set.
- Keep curated docs focused on durable, audience-specific reference content.
- Keep archive docs for material that is no longer current.
