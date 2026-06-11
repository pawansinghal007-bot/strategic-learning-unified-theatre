# Sprint 42 Patch Integration

## Prerequisites
Sprints 18–41 must already be integrated.
Milvus must be running locally on localhost:19530.

## New files
- src/knowledge/schema/documents.ts
- src/knowledge/schema/metadata.ts
- src/knowledge/ingest/milvus-client.ts
- src/knowledge/ingest/chunking.ts
- src/knowledge/ingest/embedder.ts
- src/knowledge/ingest/ingest-sprint-history.ts
- src/knowledge/index.ts
- electron-ui/ipc/knowledge-handlers.cjs

## Extended files
- electron-ui/main.cjs (registerKnowledgeHandlers)
- electron-ui/preload.cjs (workspaceKnowledge block)
- src/ui/types.d.ts (workspaceKnowledge interface)
- src/ui/provider-dashboard.html (Knowledge panel)

## New IPC channels
knowledge:ingest
knowledge:search

## Runtime requirements
MILVUS_ADDRESS env var (default: localhost:19530)
First ingest downloads BGE-M3 model (~1GB) via @xenova/transformers
