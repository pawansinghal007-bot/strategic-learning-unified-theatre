# strategic-learning-unified-theatre — Architecture

## Purpose
This document explains the system design, major modules, data flow, and operational constraints.

## High-Level Flow
1. User interacts with online LLMs in the browser.
2. Browser capture records relevant conversation data.
3. VS Code passive learning records development signals.
4. Ingestion pipelines normalize content into the experience database.
5. Retrieval and prompt-generation modules use stored knowledge to improve future sessions.
6. Training export prepares paired examples for future local fine-tuning readiness.

## Main Components
- Browser bridge
- Browser Capture v2 data source
- VS Code passive collector
- Document ingester
- Experience database
- Mistake tracker
- Prompt generator
- Handoff and snapshot system
- Training exporter
- Local LLM runtime layer

## Data Flow
### Browser path
Browser LLM session → browser capture store → sync pipeline → document ingester → experience database

### Editor path
VS Code events → staged signals → document ingester → experience database

### Prompt path
Experience database → retrieval/rubric rules/history → prompt generator → next LLM session

### Training path
Experience database → pairing/export logic → JSONL training export

## Storage
### Primary database
- `~/.vscode-rotator/experience.db`

### Export paths
- `~/.vscode-rotator/browser-responses/`
- `~/.vscode-rotator/vscode-signals/`
- `~/.vscode-rotator/training-exports/`

## Key Modules
| Module | Responsibility |
|---|---|
| `src/browser-bridge.js` | Browser LLM communication |
| `src/llm/document-ingester.js` | Normalize and ingest source documents |
| `src/llm/experience-db.js` | SQLite operations for experience data |
| `src/llm/prompt-generator.js` | Build context-aware prompts |
| `src/llm/mistake-tracker.js` | Promote recurring mistakes into reusable rules |
| `src/commands/bc2-sync.js` | Sync Browser Capture v2 chat messages into experience.db |
| `src/llm/training-exporter.js` | Export prompt/response pairs as JSONL |

## Design Principles
- Local-first
- Incremental ingestion
- Idempotent processing
- Audit-friendly history
- Secure local storage
- Minimal disruption to developer workflow

## Constraints
- Local machine performance can be slow
- Windows environment support matters
- Native dependency setup is a real operational constraint
- Paired training data quality is currently limited

## Current Risks
- Sparse high-quality paired training data
- Local inference latency
- Native runtime setup complexity
- Documentation maturity still early

## Future Direction
- Better thread-level capture
- Stronger retrieval and ranking
- Safer local adaptation pipeline
- Product packaging and onboarding improvements
