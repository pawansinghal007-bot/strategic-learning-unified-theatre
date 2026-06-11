# Sprint 42 — Knowledge Layer: Sprint History RAG Ingestion

## Goal
Build a RAG knowledge layer that ingests sprint history documents, chunks and embeds them using BGE-M3, stores vectors in Milvus, and exposes search via IPC so the dashboard and future AI features can retrieve sprint context.

## In scope
- src/knowledge/schema/ — KnowledgeDocument and KnowledgeChunk types
- src/knowledge/ingest/milvus-client.ts — Milvus connection + collection setup
- src/knowledge/ingest/chunking.ts — word-window chunker 512/64
- src/knowledge/ingest/embedder.ts — BGE-M3 via @xenova/transformers
- src/knowledge/ingest/ingest-sprint-history.ts — full ingest pipeline
- knowledge:ingest and knowledge:search IPC channels
- preload workspaceKnowledge namespace
- Dashboard Knowledge panel with ingest and search controls

## Out of scope
- Real-time streaming search results
- Milvus authentication / TLS
- Multi-modal or image embeddings
- Scheduled automatic re-ingestion

## Acceptance criteria
1. ingestSprintHistory() discovers .md/.txt files and inserts chunks.
2. embedTextBatch() returns 1024-dim vectors.
3. knowledge:search returns ranked results from Milvus.
4. Dashboard can trigger ingest and display search results.
5. Architecture sync completed.
