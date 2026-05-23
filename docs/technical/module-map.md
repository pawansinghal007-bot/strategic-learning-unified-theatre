# Module Map

## Key modules
- `src/browser-bridge.js` — browser LLM communication and capture integration.
- `src/llm/document-ingester.js` — normalize and ingest browser and editor source documents.
- `src/llm/experience-db.js` — SQLite operations for experience data.
- `src/llm/prompt-generator.js` — build context-aware prompts from stored signals.
- `src/llm/mistake-tracker.js` — promote recurring mistakes into reusable rules.
- `src/commands/bc2-sync.js` — sync Browser Capture v2 chat messages into the experience database.
- `src/llm/training-exporter.js` — export prompt/response pairs as JSONL.
- `src/ai-memory/memory-db.js` — persistent AI memory storage support.

## Notes
This map highlights the main technical components used in the current repo state.
