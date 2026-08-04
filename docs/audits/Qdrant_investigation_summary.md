# RAG / Qdrant Investigation Summary

## Issue

During the investigation of the Retrieval-Augmented Generation (RAG) pipeline, it was discovered that the project contains **multiple Qdrant retrieval implementations that have diverged over time**. While the repository ingestion pipeline is actively indexing data into Qdrant, not all retrieval paths are querying the same data source.

The investigation identified the following key issues:

### 1. Duplicate Qdrant Clients

There are two implementations of the Qdrant client:

- **`src/llm/qdrant-client.js`**
  - Live runtime implementation
  - Used by repository ingestion
  - Used by Electron desktop RAG
  - Used by Gateway RAG
  - Fully functional

- **`src/llm/qdrant-client.ts`**
  - Legacy implementation
  - Zero runtime imports
  - Excluded from coverage
  - Documented as shadowed/dead
  - No production usage

This creates confusion because there appear to be two implementations, but only one is actually used.

---

### 2. Two Independent Retrieval Pipelines

The system currently has **two different semantic search implementations**.

#### Retrieval Path 1 (Working)

```
User Question
      │
Electron IPC / Gateway
      │
searchChunks()
      │
qdrant-client.js
      │
knowledge_chunks
```

This path powers:

- Desktop application chat
- Gateway RAG
- Agent execution context

---

#### Retrieval Path 2 (Broken)

```
Agent Tool
MCP Tool
Retrieval Router
        │
vectorSearch()
        │
vector-client.ts
        │
Qdrant
```

This path powers:

- Agent vector-search tool
- MCP vector-search tool
- Generic retrieval router

Instead of using the same implementation, it performs its own embedding, HTTP calls and payload parsing.

---

### 3. Historical Configuration Drift

The investigation showed that `vector-client.ts` was originally built using Docker-oriented defaults:

| Setting           | Old Default                                      | Correct Runtime Value                          |
| ----------------- | ------------------------------------------------ | ---------------------------------------------- |
| QDRANT_URL        | [http://qdrant:6333](http://qdrant:6333)         | [http://localhost:6333](http://localhost:6333) |
| EMBEDDINGS_URL    | [http://embeddings:8080](http://embeddings:8080) | [http://localhost:8081](http://localhost:8081) |
| QDRANT_COLLECTION | unified_theatre                                  | knowledge_chunks                               |

The runtime `.env` now overrides these values, but the incorrect defaults still exist in code.

---

### 4. Payload Schema Divergence

The ingestion pipeline stores rich metadata.

Example payload:

- chunk_id
- doc_id
- path
- section
- source_type
- feature_area
- sprint
- file_hash
- hash
- importance
- content
- text
- dense_vector

However, `vector-client.ts` only expects:

```
{
    source,
    text
}
```

Since `source` is not present in the ingestion payload, it falls back to the Qdrant point ID instead of a readable file path.

---

### 5. Duplicate Retrieval Logic

Both implementations independently perform:

- Query embedding
- Qdrant HTTP communication
- Payload parsing
- Result formatting
- Error handling
- Configuration loading

This duplication has allowed the implementations to drift over multiple sprints.

---

# Investigation Performed

A detailed investigation was carried out to determine whether the issue was configuration-related, dead code, or an architectural problem.

## 1. Repository-wide Code Search

Searched for:

- Qdrant usage
- Qdrant client implementations
- Vector search implementations
- Embedding logic
- Chunk generation
- Collection names
- Environment variables

This identified:

- `qdrant-client.js`
- `qdrant-client.ts`
- `vector-client.ts`
- ingestion pipeline
- retrieval router
- gateway
- MCP handlers
- Electron handlers

---

## 2. Runtime Import Analysis

Every production importer was traced.

### qdrant-client.js

Confirmed runtime usage by:

- ingest-repository.js
- ingest-sprint-history.js
- gateway.ts
- Electron IPC handlers
- runtime tests

Result:

**Active production implementation**

---

### qdrant-client.ts

Verified:

- no runtime imports
- excluded from coverage
- documented as shadowed
- not exported
- not dynamically imported

Result:

**Dead code**

---

### vector-client.ts

Verified runtime imports from:

- vector-search tool
- MCP handlers
- retrieval router
- formatter

Result:

**Active production component**

---

## 3. Call Chain Analysis

Every retrieval path was traced back to the originating user action.

### Working path

Desktop Chat

↓

Electron IPC

↓

searchChunks()

↓

knowledge_chunks

---

Gateway RAG

↓

queryTopK()

↓

searchChunks()

↓

knowledge_chunks

---

### Second path

Agent Tool

↓

vectorSearch()

↓

vector-client.ts

↓

Qdrant

---

MCP Tool

↓

vectorSearch()

↓

vector-client.ts

↓

Qdrant

---

Retrieval Router

↓

vectorSearch()

↓

Qdrant

---

This confirmed there are **two independent retrieval implementations**, not simply two different entry points.

---

## 4. Collection Verification

Compared collection usage.

### Ingestion

```
knowledge_chunks
```

### Retrieval

Originally configured for

```
unified_theatre
```

Current runtime depends on `.env` overrides.

---

## 5. Payload Verification

Compared:

### Stored payload

Rich metadata including:

- content
- path
- sprint
- feature_area
- source_type
- section

### Retrieval expectations

Only:

- source
- text

Confirmed schema mismatch.

---

## 6. Embedding Verification

Verified both implementations ultimately use the same embedding service:

```
localhost:8081
```

with

```
qwen3-emb-4b
```

and

```
2560-dimensional vectors
```

Therefore, the current issue is **not embedding compatibility**.

---

## 7. Error Handling Investigation

Verified failures are not silently ignored.

Failures propagate correctly through:

- Agent tools
- MCP handlers
- Retrieval router

Historical Sprint 107 documentation also records retrieval failures when the wrong collection was queried.

---

# Root Cause

The investigation indicates that the system evolved over several sprints:

1. Original retrieval implementation
2. Shared retrieval abstraction introduced
3. Repository ingestion rewritten
4. New Qdrant client introduced
5. Old retrieval implementation never migrated

As a result:

- ingestion uses one implementation
- agent tools use another
- duplicate retrieval logic exists
- configuration drift accumulated
- payload expectations diverged

This is best characterized as an **unfinished architectural migration**, rather than a single coding bug.

---

# Recommended Solution

## Preferred Approach

**Make `searchChunks()` in `qdrant-client.js` (or its eventual TypeScript replacement) the single authoritative retrieval implementation.**

Rather than maintaining two separate Qdrant clients, every semantic search request should pass through the same retrieval pipeline.

The architecture would become:

```
Desktop Chat
Agent Tool
MCP Tool
Retrieval Router
Gateway
        │
        ▼
searchChunks()
        │
        ▼
Qdrant
```

`vectorSearch()` should remain only as a thin compatibility wrapper that delegates to `searchChunks()` and transforms the richer search results into the simplified format expected by its existing callers.

---

## Why This Solution

This approach provides several advantages:

### Eliminates Duplicate Logic

Only one implementation would be responsible for:

- embedding requests
- Qdrant communication
- collection selection
- payload parsing
- error handling
- retries
- configuration

---

### Prevents Future Drift

With a single retrieval implementation:

- collection names cannot diverge
- payload schemas remain consistent
- embedding configuration stays centralized
- future enhancements only need to be implemented once

---

### Preserves Existing APIs

Current consumers (agent tools, MCP handlers, retrieval router) can continue using `vectorSearch()` without any interface changes, while the implementation delegates to the canonical retrieval layer.

This minimizes migration effort and reduces regression risk.

---

### Improves Maintainability

The system becomes easier to understand:

- one ingestion pipeline
- one retrieval implementation
- one Qdrant client
- one configuration source
- one payload model

This significantly reduces architectural complexity.

---

# Expected Outcome

After consolidation:

- ✅ One authoritative Qdrant client
- ✅ One semantic retrieval implementation
- ✅ One collection (`knowledge_chunks`)
- ✅ Consistent payload handling
- ✅ Shared configuration
- ✅ Removal of dead code (`qdrant-client.ts`)
- ✅ Elimination of duplicated retrieval logic
- ✅ Reduced maintenance overhead and lower risk of future regressions
