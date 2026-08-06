# RAG System — Production Readiness Audit

**Date:** 2026-08-04
**Auditor:** Principal Architect
**Scope:** Complete RAG pipeline — from repository ingestion through LLM prompt construction
**Method:** File reads, import tracing, call chain analysis, architectural review
**Assumption:** Current implementation works unless proven otherwise. No speculation without evidence.

## Resolution (2026-08-06 — post-remediation branch update)

The current branch materially improves the RAG architecture compared with the pre-remediation state captured in this audit. The canonical path is now:

- ingestion: `src/knowledge/ingest/ingest-repository.js` → `src/knowledge/ingest/embedder.js`
- storage and retrieval: `src/llm/qdrant-client.js`
- hybrid retrieval: `src/llm/hybrid-search.js` plus optional reranking in `src/llm/reranker.js`
- context assembly: `src/shared/retrieval/context-assembler.js`

The earlier split-path problem around embedding and retrieval is now addressed in practice: `src/shared/retrieval/vector-client.ts` is a thin delegate and no longer carries a second embedding/retrieval implementation. The implementation also adds persistent embedding caching, retry-aware embedding requests, hybrid vector+lexical retrieval, optional reranking, and token-budgeted context assembly.

This does not change the historical findings below; those findings remain valuable as an audit trail of the pre-remediation architecture. The post-remediation status is better, but it is still not a claim of full production readiness: the remaining work is operational hardening, live evaluation, and explicit fallback policy rather than basic architecture consolidation.

---

## PART 1 — Architecture Review

### Complete RAG Pipeline

```
Repository Files
    ↓ (ingest-repository.js, ingest-sprint-history.js)
Chunking
    ↓ (document-ingester.js: chunkText, chunking.js: chunkDocument)
Embedding
    ↓ (embedder.js: embedTextBatch, vector-client.ts: embed)
Qdrant Storage
    ↓ (qdrant-client.js: upsertChunks, searchChunks)
Retrieval
    ↓ (qdrant-client.js: searchChunks, vector-client.ts: vectorSearch)
Context Building
    ↓ (gateway.ts, handlers.cjs: prompt injection)
LLM Prompt
    ↓ (inference.js, gateway.ts: ask)
Response
```

### Stage-by-Stage Analysis

#### Stage 1: Repository Discovery

**File:** `src/knowledge/ingest/ingest-repository.js`

| Property           | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| **Responsibility** | Walk filesystem, discover supported files                           |
| **Inputs**         | `baseDir`, `defaultFeatureArea`, `maxFileBytes`                     |
| **Outputs**        | Array of file paths                                                 |
| **Dependencies**   | `node:fs`, `node:path`                                              |
| **Failure Points** | Permission errors (logged, skipped), large files (skipped silently) |
| **Recovery**       | Graceful skip with `console.warn`                                   |

**Supported extensions:** `.md`, `.markdown`, `.txt`, `.js`, `.ts`, `.jsx`, `.tsx`, `.json`
**Excluded dirs:** `node_modules`, `.git`, `coverage`, `dist`, `build`, `.tmp`, `.venv`, `electron-ui`, `baselines`, `reports`, `release`, `test-results`, `playwright-report`
**Max file size:** 512 KB (`DEFAULT_MAX_FILE_BYTES = 512 * 2560`)

**⚠️ Issue:** `.json` files are ingested as text. Package.json, sonar issues JSON, and other structured JSON are chunked as raw text — losing semantic structure.

#### Stage 2: Chunking

**Files:** `src/llm/document-ingester.js` (`chunkText`), `src/knowledge/ingest/chunking.js` (`chunkDocument`)

| Property           | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **Responsibility** | Split text into fixed-size windows with overlap                  |
| **Inputs**         | Raw text string                                                  |
| **Outputs**        | Array of chunk strings (max 3000 chars each)                     |
| **Dependencies**   | `node:crypto` (for chunk hashing)                                |
| **Failure Points** | Empty text (returns []), oversized chunks (>6000 chars, skipped) |
| **Recovery**       | Skips oversized chunks with `console.warn`                       |

**Chunk parameters:**

- `CHUNK_MAX_CHARS = 3000` (document-ingester.js)
- `CHUNK_OVERLAP_CHARS = 300` (chunking.js)
- Step size: `3000 - 300 = 2700` characters
- Token estimation: `chars / 2` (CHARS_PER_TOKEN_ESTIMATE = 2)
- Token cap: `500 tokens × 2 = 1000 chars` — but `min(3000, 1000) = 1000` chars effective max

**⚠️ Critical Finding:** The effective max chunk size is **1000 characters** (token-derived), not 3000. This is because `chunkText` applies `Math.min(maxChars, tokenDerivedChars)` where `tokenDerivedChars = maxTokens * 2 = 500 * 2 = 1000`.

**⚠️ Issue:** Two different chunking implementations exist:

1. `document-ingester.js: chunkText()` — used by `ingest-repository.js` (repo files)
2. `chunking.js: chunkDocument()` — used by `ingest-sprint-history.js` (sprint reports)

They have different parameters and produce different output shapes.

#### Stage 3: Embedding

**Files:** `src/knowledge/ingest/embedder.js` (batch), `src/shared/retrieval/vector-client.ts` (single)

| Property           | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| **Responsibility** | Convert text to 2560-dimensional vectors                                     |
| **Inputs**         | Array of text strings (batch) or single string (retrieval)                   |
| **Outputs**        | Array of 2560-dim vectors                                                    |
| **Dependencies**   | HTTP endpoint at `http://localhost:8081/v1/embeddings`, `qwen3-emb-4b` model |
| **Failure Points** | HTTP 5xx, timeout (20 min for batch, 10s for retrieval), malformed response  |
| **Recovery**       | Throws error — no retry logic                                                |

**Batch parameters:**

- Token budget: 6000 tokens per request
- Max items per batch: 64
- Timeout: 1,200,000 ms (20 minutes) for cold start survival
- Custom undici Agent with extended headers/body timeouts

**⚠️ Issue:** No retry logic on embedding failures. A transient HTTP 503 will abort the entire ingestion run.

#### Stage 4: Qdrant Storage

**File:** `src/llm/qdrant-client.js`

| Property           | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Responsibility** | Upsert chunks, search by vector similarity, scroll for hash comparison                |
| **Inputs**         | Vector + payload (upsert), vector + limit + scoreThreshold (search)                   |
| **Outputs**        | Upsert acknowledgment, search results with payloads                                   |
| **Dependencies**   | Qdrant REST API at `http://localhost:6333`                                            |
| **Failure Points** | HTTP errors, collection not created, vector dimension mismatch                        |
| **Recovery**       | `ensureKnowledgeCollection()` creates collection if missing; throws on upsert failure |

**Collection configuration:**

- Name: `knowledge_chunks`
- Vector size: 2560
- Distance: Cosine
- **No HNSW config specified** (uses Qdrant defaults)
- **No payload indexes created**
- **No optimization config specified**

**⚠️ Critical Finding:** Collection is created with minimal configuration — only `size` and `distance`. No HNSW m/max_level, no scalar/index configuration, no sparse vector support. This means:

- Default HNSW settings (m=16, ef=128, ef_construct=100)
- No optimized search for payload filtering
- Linear scan fallback for filtered searches

#### Stage 5: Retrieval

**Files:** `src/llm/qdrant-client.js` (`searchChunks`), `src/shared/retrieval/vector-client.ts` (`vectorSearch`)

| Property           | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| **Responsibility** | Embed query, search Qdrant, map results                                     |
| **Inputs**         | Query string (vectorSearch) or vector + limit + threshold (searchChunks)    |
| **Outputs**        | Array of {content, path, section, feature_area, sprint, source_type, score} |
| **Dependencies**   | Embedding service, Qdrant REST API                                          |
| **Failure Points** | Embedding timeout, Qdrant unavailable, score threshold filters all results  |
| **Recovery**       | Returns empty array (gateway), throws error (vectorSearch)                  |

**Search parameters:**

- Default limit: 6 (Electron chat), 5 (Gateway), 5 (vectorSearch)
- Default score threshold: 0.4 (Cosine similarity)
- `with_payload: true`
- `with_vector: false` (not returned)

**⚠️ Issue:** Score threshold of 0.4 on Cosine distance means only chunks with ≥40% similarity are returned. For complex queries, this may filter out all results silently.

#### Stage 6: Context Building

**Files:** `src/llm/gateway.ts` (Gateway), `electron-ui/ipc/handlers.cjs` (Electron)

**Gateway context injection:**

```typescript
// gateway.ts line 484
const chunks = await queryTopK(requestData.prompt, 5);
const chunkText = chunks.map((c => c.text).join("\n\n");
prompt = `${prompt}\n\nRelevant context:\n${chunkText}`;
```

**Electron context injection:**

```javascript
// handlers.cjs lines 295-300
const contextBlock = knowledgeHits.length
  ? knowledgeHits
      .map(
        (hit, idx) =>
          `[${idx + 1}] sprint=${hit.sprint} area=${hit.feature_area} ` +
          `source=${hit.source_type} score=${hit.score.toFixed(3)}\n${hit.content}`,
      )
      .join("\n\n---\n\n")
  : "";
```

| Property           | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| **Responsibility** | Inject retrieved chunks into LLM prompt                                  |
| **Inputs**         | Retrieved chunks (array)                                                 |
| **Outputs**        | Extended prompt string                                                   |
| **Dependencies**   | Prompt template, RAG_ENABLED flag                                        |
| **Failure Points** | No token budget enforcement on context injection, no context compression |
| **Recovery**       | Silent skip if RAG fails (try/catch in gateway.ts)                       |

**⚠️ Critical Finding:** No token budget enforcement on RAG context injection. If retrieved chunks total 50KB of text, they are appended to the prompt without checking if the LLM can handle it. The `maxTokens` constraint exists but is applied to tool results, not RAG context.

#### Stage 7: LLM Prompt

**File:** `src/llm/gateway.ts`

| Property           | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Responsibility** | Assemble final prompt with workspace context, standing rules, RAG context, user query |
| **Inputs**         | User prompt, workspace context, standing rules, RAG chunks                            |
| **Outputs**        | ProviderRequest with assembled prompt                                                 |
| **Dependencies**   | Provider routing, budget enforcement, workspace context extraction                    |
| **Failure Points** | Prompt exceeds context window, provider unavailable                                   |
| **Recovery**       | Truncates tool results, falls back to legacy provider                                 |

#### Stage 8: Response

**File:** `src/llm/inference.js` (OpenAI-compatible), `src/llm/gateway.ts` (streaming)

| Property           | Value                                             |
| ------------------ | ------------------------------------------------- |
| **Responsibility** | Send prompt to LLM, stream response               |
| **Inputs**         | Assembled prompt                                  |
| **Outputs**        | Text response, token chunks                       |
| **Dependencies**   | LLM provider (qwen on port 8080, or fallback)     |
| **Failure Points** | Provider timeout, rate limiting, context overflow |
| **Recovery**       | Provider health tracking, fallback routing        |

### Duplicated Responsibilities

| Responsibility         | Duplication                                                                                                                                          | Impact                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Chunking**           | `document-ingester.js:chunkText()` vs `chunking.js:chunkDocument()`                                                                                  | Different parameters, different output shapes            |
| **Embedding**          | `embedder.js:embedTextBatch()` vs `vector-client.ts:embed()`                                                                                         | Same endpoint, different batching/timeout/error handling |
| **Qdrant import**      | `gateway.ts` imports `qdrant-client.js` directly; `handlers.cjs` imports `qdrant-client.js` directly; Agent/MCP/Router go through `vector-client.ts` | Inconsistent architecture paths                          |
| **Context formatting** | Gateway uses `c.text`; Electron uses `hit.content` with metadata headers                                                                             | Different prompt structures                              |

---

## PART 2 — Retrieval Quality Review

### Issues Identified

#### 1. Fixed Chunk Size (1000 chars effective)

**Evidence:** `document-ingester.js` line ~155: `const effectiveMaxChars = Math.min(maxChars, tokenDerivedChars)` where `tokenDerivedChars = 500 * 2 = 1000`.

**Why it matters:** 1000-character chunks are **too small** for meaningful semantic retrieval. A single function definition, a class, or a short paragraph often exceeds 1000 characters. This means:

- Related content is split across multiple chunks
- No single chunk contains complete semantic units
- Retrieval returns fragments, not coherent context
- User sees disjointed snippets

#### 2. No Hierarchical Chunking

**Evidence:** `chunking.js` uses simple sliding window. No heading-aware, no section-aware, no code-block-aware chunking.

**Why it matters:** Code files have natural boundaries (functions, classes, modules) that the chunker ignores. A 1000-char window may split a function in half, making neither chunk semantically complete.

#### 3. No Deduplication at Ingestion

**Evidence:** `rag-dedup.js` exists with `dedupeRagChunks()` but is **never called** during ingestion. `ingest-repository.js` does not import or use it.

**Why it matters:** If the same content appears in multiple files (e.g., README duplicated in docs/, code comments matching API docs), Qdrant stores duplicate vectors. This:

- Wastes storage (~16KB payload × duplicates)
- Skews similarity scores (duplicate chunks inflate relevance)
- Reduces effective recall (limited top-K filled with duplicates)

#### 4. No Reranking

**Evidence:** Search returns raw Cosine similarity scores. No cross-encoder, no BGE reranker, no MMR.

**Why it matters:** Cosine similarity on 2560-dim embeddings is a weak signal for relevance. A chunk with 0.45 similarity might be ranked above a chunk with 0.52 similarity simply because the embedding model didn't capture the semantic relationship well. Reranking with a cross-encoder typically improves NDCG@10 by 15-30%.

#### 5. No MMR (Maximal Marginal Relevance)

**Evidence:** `searchChunks` returns top-K by score. No diversity logic.

**Why it matters:** If the top 5 results are all from the same file/section, the user gets redundant context. MMR would balance relevance with diversity.

#### 6. Weak Score Threshold (0.4)

**Evidence:** `searchChunks(vector, limit = 6, scoreThreshold = 0.4)` in `qdrant-client.js`.

**Why it matters:** Cosine similarity of 0.4 is quite low. It means the chunk is only marginally related to the query. This increases noise in the context block. However, a higher threshold risks returning zero results for complex queries.

#### 7. No BM25 / Keyword Search

**Evidence:** `search-code.ts` uses ripgrep for lexical search, but this is a **separate tool** (`search-code`), not integrated with vector search. No hybrid search exists.

**Why it matters:** Vector search is poor at finding exact symbol names, specific error messages, or precise code patterns. BM25 excels at these. Without hybrid search, users must choose between semantic (vector) and exact (ripgrep) — they can't get both.

#### 8. No Metadata Filtering at Search Time

**Evidence:** `searchChunks` does not accept filter parameters. The Qdrant search body is:

```json
{ "vector": ..., "limit": 6, "with_payload": true, "score_threshold": 0.4 }
```

No `filter` field.

**Why it matters:** Users cannot restrict search to specific modules, sprints, file types, or feature areas. All chunks compete equally regardless of relevance to the user's actual need.

#### 9. No Query Expansion

**Evidence:** Query is embedded and searched directly. No synonyms, no related terms, no multi-query generation.

**Why it matters:** If a user asks "How do I handle authentication?", the embedding may not match chunks that say "JWT token validation" or "OAuth flow" if those terms weren't in the training data. Query expansion would improve recall.

#### 10. No Context Compression

**Evidence:** All retrieved chunks are appended to the prompt verbatim. No summarization, no deduplication, no relevance scoring within the context block.

**Why it matters:** If 5 chunks total 8000 characters, all 8000 characters are sent to the LLM. Many tokens are wasted on low-relevance or redundant content. Context compression would reduce token cost and improve signal-to-noise ratio.

---

## PART 3 — Chunking Audit

### Current Implementation

**File:** `src/llm/document-ingester.js` (repo files), `src/knowledge/ingest/chunking.js` (sprint reports)

| Property                 | Value                                | Evidence                                        |
| ------------------------ | ------------------------------------ | ----------------------------------------------- |
| **Chunk size**           | 1000 chars effective (token-derived) | `document-ingester.js`: `Math.min(3000, 500*2)` |
| **Overlap**              | 300 chars                            | `chunking.js`: `CHUNK_OVERLAP_CHARS = 300`      |
| **Chunk boundaries**     | Fixed character windows              | `splitIntoWindows()`: `start += step`           |
| **Markdown handling**    | None — raw text                      | No markdown parsing, no heading detection       |
| **Code handling**        | None — raw text                      | No AST parsing, no function/class detection     |
| **Heading preservation** | None                                 | Chunks contain raw text, no heading metadata    |
| **Section preservation** | None                                 | `section` field is always `""` for repo files   |
| **Language awareness**   | None                                 | Same chunking for .md, .ts, .json, .js          |

### Problems Identified

#### 1. No Semantic Boundaries

Chunks split at arbitrary character positions, not at semantic boundaries (function ends, paragraph breaks, heading changes).

**Impact:** A chunk may contain the end of one function and the beginning of another, making neither chunk useful for retrieval.

#### 2. No Heading/Section Metadata

**Evidence:** `createChunksForFile()` in `ingest-repository.js` sets `section: ""` for all repo file chunks. Sprint report chunks set `section: undefined`.

**Impact:** No way to filter or rank by section. No way to reconstruct document structure from chunks.

#### 3. No Code-Aware Chunking

**Evidence:** `.ts`, `.js`, `.tsx`, `.jsx` files are chunked identically to `.md` files. No AST-based splitting.

**Impact:** Code functions are split mid-definition. Import statements may end up in a different chunk than the code they import. Class definitions may be split across chunks.

#### 4. No Markdown Structure Preservation

**Evidence:** Markdown files are read as raw text. No heading detection, no list parsing, no code block awareness.

**Impact:** A markdown heading and its content may end up in different chunks. Code blocks within markdown lose their formatting context.

### Suggested Strategies

| Strategy                      | Expected Impact                                                            | Complexity |
| ----------------------------- | -------------------------------------------------------------------------- | ---------- |
| **Heading-aware chunking**    | High — chunks align with document sections                                 | Low        |
| **Code-aware chunking (AST)** | High — chunks align with functions/classes                                 | Medium     |
| **Variable chunk sizes**      | Medium — larger chunks for docs, smaller for code                          | Low        |
| **Parent-child retrieval**    | High — small chunks for retrieval, large parent for context                | Medium     |
| **Semantic chunking**         | Medium — split at paragraph/sentence boundaries using embedding similarity | High       |

---

## PART 4 — Metadata Audit

### Current Payload Fields

**Ingestion writes (from `chunkToQdrantPoint`):**

| Field          | Type     | Populated | Notes                                                 |
| -------------- | -------- | --------- | ----------------------------------------------------- |
| `chunk_id`     | string   | ✅        | Deterministic UUID from SHA-256                       |
| `doc_id`       | string   | ✅        | `repo:relative/path`                                  |
| `source_type`  | string   | ✅        | `markdown`, `typescript`, `javascript`, etc.          |
| `sprint`       | number   | ⚠️        | Always `-1` for repo files                            |
| `module`       | string   | ⚠️        | Top-level directory name (e.g., `src`, `electron-ui`) |
| `feature_area` | string   | ✅        | Same as module                                        |
| `version`      | string   | ⚠️        | Always `"latest"`                                     |
| `path`         | string   | ✅        | Relative path from baseDir                            |
| `section`      | string   | ❌        | Always `""` for repo files                            |
| `importance`   | number   | ⚠️        | Always `0.5`                                          |
| `hash`         | string   | ✅        | SHA-256 of chunk text (16 chars)                      |
| `created_at`   | number   | ✅        | `Date.now()` at ingestion time                        |
| `file_hash`    | string   | ✅        | SHA-256 of full file (64 chars)                       |
| `text`         | string   | ✅        | Chunk text (duplicated as `content`)                  |
| `content`      | string   | ✅        | Chunk text (duplicated from `text`)                   |
| `dense_vector` | number[] | ✅        | 2560-dim embedding (stripped from payload)            |

### Missing Metadata

| Field                     | Impact if Missing                                            |
| ------------------------- | ------------------------------------------------------------ |
| `language`                | Cannot filter by programming language                        |
| `symbol`                  | Cannot identify which function/class a chunk belongs to      |
| `class`                   | Cannot filter by class context                               |
| `function`                | Cannot filter by function context                            |
| `imports`                 | Cannot understand module dependencies                        |
| `exports`                 | Cannot identify public API surface                           |
| `repository`              | Cannot support multi-repo                                    |
| `branch`                  | Cannot support multi-branch                                  |
| `commit`                  | Cannot track chunk provenance                                |
| `sprint` (meaningful)     | Sprint is always `-1` for repo files — no sprint association |
| `importance` (meaningful) | Importance is always `0.5` — no differentiation              |
| `file_size`               | Cannot prioritize smaller/faster-to-read chunks              |
| `last_modified`           | Cannot prioritize recently changed files                     |
| `is_test`                 | Cannot exclude test files from search                        |
| `is_generated`            | Cannot exclude auto-generated files                          |

### Metadata Quality Issues

1. **`sprint` is always `-1` for repo files** — Sprint history chunks have meaningful sprint numbers, but repo file chunks do not. This creates inconsistent metadata.

2. **`importance` is always `0.5`** — No differentiation between critical architecture docs and trivial utility files.

3. **`module` is just the top-level directory** — `src/llm/gateway.ts` gets `module: "src"`, which is useless for filtering.

4. **`section` is always empty** — No section/heading information is extracted from markdown or code files.

5. **`version` is always `"latest"`** — No version tracking for schema evolution.

---

## PART 5 — Embedding Audit

### Current Implementation

**Batch embedding (ingestion):** `src/knowledge/ingest/embedder.js`
**Single embedding (retrieval):** `src/shared/retrieval/vector-client.ts`

| Property                | Value                                          |
| ----------------------- | ---------------------------------------------- |
| **Model**               | `qwen3-emb-4b`                                 |
| **Dimensions**          | 2560                                           |
| **Endpoint**            | `http://localhost:8081/v1/embeddings`          |
| **Batching**            | Token-budget-aware (6000 tokens, 64 items max) |
| **Timeout (batch)**     | 1,200,000 ms (20 minutes)                      |
| **Timeout (retrieval)** | 10,000 ms (10 seconds)                         |

### Issues Identified

#### 1. No Embedding Cache

**Evidence:** No caching layer between ingestion runs. Every ingestion re-embeds all chunks from scratch.

**Impact:** For a repository with 10,000 chunks, ingestion takes 10,000 embedding API calls. If 95% of chunks are unchanged (detected by file hash), this is 9,500 wasted API calls.

#### 2. No Duplicate Embedding Avoidance

**Evidence:** `rag-dedup.js` exists but is never called during ingestion. Chunks with identical text get identical embeddings stored separately.

**Impact:** Wasted storage and skewed similarity scores.

#### 3. No Stale Embedding Detection

**Evidence:** Ingestion uses file hash (`fileHash`) to detect changed files, but chunk-level hash (`hash`) is only used for deduplication (which is never called).

**Impact:** If a file changes but the hash comparison fails (e.g., due to encoding differences), old embeddings persist alongside new ones.

#### 4. No Incremental Embedding Optimization

**Evidence:** `attachVectors()` in `ingest-repository.js` embeds ALL chunks in a file, even if only one chunk changed.

**Impact:** For a file with 10 chunks where only 1 changed, 9 embeddings are regenerated unnecessarily.

#### 5. No Retry Logic

**Evidence:** `embedTextBatch()` throws on HTTP error. No retry, no exponential backoff.

**Impact:** A transient embedding service outage aborts the entire ingestion run.

#### 6. Two Embedding Implementations

**Evidence:** `embedder.js:embedTextBatch()` vs `vector-client.ts:embed()`. Same endpoint, different batching, different timeouts, different error handling.

**Impact:** Maintenance burden. Changes to embedding endpoint must be duplicated.

---

## PART 6 — Qdrant Audit

### Current Configuration

**Evidence:** `qdrant-client.js` lines 52-62:

```json
{
  "vectors": {
    "size": 2560,
    "distance": "Cosine"
  }
}
```

### Issues Identified

#### 1. No HNSW Configuration

**Evidence:** Collection created with default HNSW parameters:

- `m = 16` (default)
- `ef = 128` (default)
- `ef_construct = 100` (default)

**Impact:** For 2560-dimensional vectors, default HNSW may not provide optimal recall. Higher `ef_construct` (e.g., 256) would improve index quality. Higher `ef` (e.g., 256) during search would improve recall at the cost of latency.

#### 2. No Payload Indexes

**Evidence:** No `create_payload_index` calls anywhere in the codebase.

**Impact:** All payload filtering (if ever added) would require a full scan. For large collections, this is O(n) per filtered search.

#### 3. No Optimizer Configuration

**Evidence:** No `optimization_config` specified during collection creation.

**Impact:** Default optimizer settings may not be optimal for the ingestion pattern (bulk upserts, rare deletes).

#### 4. No Sparse Vector Support

**Evidence:** Only dense vectors (2560-dim) are stored. No sparse vector field for BM25-style keyword matching.

**Impact:** Cannot do hybrid search (dense + sparse) within Qdrant. Would require separate ripgrep search + result merging.

#### 5. No Quantization

**Evidence:** Vectors stored as full 32-bit floats. No product quantization, no scalar quantization.

**Impact:** For 2560-dim vectors, each vector uses 10,240 bytes. A 100K-chunk collection uses ~1GB just for vectors. Quantization could reduce this by 4-8x with minimal quality loss.

#### 6. No Disk Offloading

**Evidence:** No `memory_map` or disk-based storage configured.

**Impact:** All vectors must fit in RAM. For large collections, this increases infrastructure costs.

---

## PART 7 — Retrieval Pipeline Audit

### Capabilities Matrix

| Capability                  | Supported | Evidence                                              |
| --------------------------- | --------- | ----------------------------------------------------- |
| **Semantic search**         | ✅        | Cosine similarity on 2560-dim embeddings              |
| **Keyword search**          | ⚠️        | Separate `search-code` tool (ripgrep), not integrated |
| **Hybrid search**           | ❌        | No fusion of vector + keyword results                 |
| **BM25**                    | ❌        | No BM25 implementation                                |
| **Metadata filtering**      | ❌        | No filter parameter in search request                 |
| **Path filtering**          | ❌        | No path filter in search request                      |
| **Language filtering**      | ❌        | No language filter in search request                  |
| **Repository filtering**    | ❌        | Single repository, no repo field                      |
| **MMR**                     | ❌        | No diversity logic                                    |
| **Reranking**               | ❌        | Raw Cosine scores only                                |
| **Cross-encoder reranking** | ❌        | No reranker                                           |
| **Deduplication**           | ⚠️        | `rag-dedup.js` exists but unused                      |
| **Diversity**               | ❌        | No diversity logic                                    |

### Impact Assessment

**Missing hybrid search** is the highest-impact gap. Users asking "How does the authentication middleware work?" need semantic understanding. Users asking "Where is `authenticateToken` defined?" need exact symbol matching. Currently, they must choose between two separate tools.

**Missing metadata filtering** means all chunks compete equally. A chunk from `node_modules/README.md` (if ingested) ranks equally with a chunk from `src/llm/gateway.ts`.

**Missing reranking** means the top-5 results are ordered purely by embedding similarity, which is a weak relevance signal for complex queries.

---

## PART 8 — Context Construction Audit

### Current Implementation

**Gateway:** `src/llm/gateway.ts` line 484:

```typescript
const chunks = await queryTopK(requestData.prompt, 5);
const chunkText = chunks.map((c) => c.text).join("\n\n");
prompt = `${prompt}\n\nRelevant context:\n${chunkText}`;
```

**Electron:** `electron-ui/ipc/handlers.cjs` lines 295-300:

```javascript
const contextBlock = knowledgeHits.length
  ? knowledgeHits
      .map(
        (hit, idx) =>
          `[${idx + 1}] sprint=${hit.sprint} area=${hit.feature_area} ` +
          `source=${hit.source_type} score=${hit.score.toFixed(3)}\n${hit.content}`,
      )
      .join("\n\n---\n\n")
  : "";
```

### Issues Identified

#### 1. No Token Budget on Context Injection

**Evidence:** Gateway appends all retrieved chunks without checking token count. The `maxTokens` constraint exists but is applied to tool results, not RAG context.

**Impact:** If 5 chunks total 15,000 characters (~5,000 tokens), they are appended to the prompt regardless of remaining context window. This can cause:

- Prompt truncation (losing earlier context)
- Provider errors (context window exceeded)
- Wasted tokens on low-relevance content

#### 2. No Duplicate Chunk Detection

**Evidence:** No deduplication of retrieved chunks before context injection.

**Impact:** If the same chunk appears in multiple search results (e.g., from different doc_ids), it is included multiple times in the context.

#### 3. No Ordering by Relevance

**Evidence:** Chunks are appended in search result order (by Cosine score descending). No reordering by metadata (sprint, importance, recency).

**Impact:** A chunk with score 0.52 from 2 years ago may appear before a chunk with score 0.51 from last week. Recency bias could improve relevance.

#### 4. No Adjacent Chunk Merging

**Evidence:** Each chunk is independent. No merging of adjacent chunks from the same file/section.

**Impact:** If chunks 3, 4, and 5 from the same file are all relevant, they are presented as three separate snippets instead of one coherent block.

#### 5. No Parent-Child Retrieval

**Evidence:** Chunks are stored and retrieved at the same granularity (1000 chars). No parent document retrieval.

**Impact:** Retrieved chunks are small fragments. The LLM receives context without surrounding document structure.

#### 6. No Context Compression

**Evidence:** All retrieved chunks are included verbatim. No summarization, no relevance scoring within the context block.

**Impact:** Low-relevance chunks (score 0.40-0.45) consume tokens without adding value.

#### 7. Inconsistent Context Formatting

**Evidence:** Gateway uses `c.text`; Electron uses `hit.content` with metadata headers. Different prompt structures for the same underlying data.

**Impact:** The LLM receives different context formats depending on the entry point, making behavior non-deterministic.

---

## PART 9 — Repository Knowledge Coverage

### What Is Indexed

| Knowledge Type             | Indexed | Evidence                                                  |
| -------------------------- | ------- | --------------------------------------------------------- |
| **README**                 | ✅      | `.md` files are supported                                 |
| **Architecture docs**      | ✅      | `.md` files in docs/                                      |
| **Sprint history**         | ✅      | `ingest-sprint-history.js`                                |
| **Design decisions**       | ⚠️      | Only if documented in `.md` files                         |
| **API contracts**          | ⚠️      | Only if documented in `.md` or `.ts` files                |
| **Configuration**          | ✅      | `.json`, `.ts`, `.js` files                               |
| **Tests**                  | ✅      | `.test.ts`, `.spec.ts` files                              |
| **CI/CD**                  | ⚠️      | Only if `.yml`/`.yaml` files are supported (they are NOT) |
| **Schemas**                | ✅      | `.json`, `.ts` files                                      |
| **Prompts**                | ✅      | `.md` files                                               |
| **MCP definitions**        | ✅      | `.ts` files in `src/mcp/`                                 |
| **Standing rules**         | ✅      | `.md` files                                               |
| **Digital Twin**           | ⚠️      | Only if documented                                        |
| **Capability descriptors** | ⚠️      | Only if documented                                        |
| **Run traces**             | ❌      | Not indexed                                               |

### Missing Knowledge Sources

| Source              | Extension                          | Indexed? | Impact                              |
| ------------------- | ---------------------------------- | -------- | ----------------------------------- |
| **CI/CD configs**   | `.yml`, `.yaml`                    | ❌       | No pipeline knowledge               |
| **Docker files**    | `Dockerfile`, `docker-compose.yml` | ❌       | No infrastructure knowledge         |
| **Shell scripts**   | `.sh`, `.bash`                     | ❌       | No build/deploy knowledge           |
| **SQL files**       | `.sql`                             | ❌       | No database schema knowledge        |
| **GraphQL schemas** | `.graphql`, `.gql`                 | ❌       | No API contract knowledge           |
| **Protobuf**        | `.proto`                           | ❌       | No service contract knowledge       |
| **Terraform**       | `.tf`                              | ❌       | No infrastructure-as-code knowledge |
| **Helm charts**     | `.yaml` (in charts/)               | ❌       | No K8s knowledge                    |
| **Makefiles**       | `Makefile`                         | ❌       | No build system knowledge           |
| **Editor configs**  | `.vscode/`, `.idea/`               | ❌       | No dev environment knowledge        |

### Excluded Directories

| Directory                 | Reason                  | Impact                               |
| ------------------------- | ----------------------- | ------------------------------------ |
| `electron-ui/`            | Excluded from ingestion | No Electron UI knowledge             |
| `docs/archive/baselines/` | Excluded                | No historical architecture baselines |
| `reports/`                | Excluded                | No analysis reports                  |
| `release/`                | Excluded                | No release notes                     |
| `test-results/`           | Excluded                | No test output history               |
| `playwright-report/`      | Excluded                | No E2E test reports                  |

---

## PART 10 — Scalability Review

### Scaling Analysis

| Scale                    | Current Behavior                            | Bottleneck                                            | Impact                                           |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| **100K chunks**          | ~1GB vector storage, ~1.6GB payload storage | Qdrant RAM for HNSW index                             | Acceptable with 8GB+ RAM                         |
| **500K chunks**          | ~5GB vector storage, ~8GB payload storage   | HNSW index quality degrades, search latency increases | Needs quantization + disk offloading             |
| **1M chunks**            | ~10GB vector storage, ~16GB payload storage | Linear scan for filtered searches, no payload indexes | Needs payload indexes + quantization             |
| **Multiple repos**       | Not supported                               | No `repository` field in payload                      | Requires schema change + ingestion rewrite       |
| **Multiple branches**    | Not supported                               | No `branch` field in payload                          | Requires schema change + ingestion rewrite       |
| **Multiple users**       | Not supported                               | No user isolation                                     | Requires tenant field + filtering                |
| **Multiple projects**    | Not supported                               | Single collection, no project field                   | Requires collection-per-project or project field |
| **Incremental indexing** | ✅                                          | File hash comparison                                  | Works, but re-embeds entire file                 |
| **Continuous indexing**  | ❌                                          | No watcher, no event-driven ingestion                 | Requires file system watcher + queue             |

### Bottlenecks

1. **Embedding service is the primary bottleneck.** Each chunk requires an HTTP call to `localhost:8081`. For 100K chunks, that's 100K HTTP calls. Even with batching (64 items/batch), that's ~1,562 requests. At 100ms per request, that's ~156 seconds just for embedding.

2. **No embedding cache.** Every ingestion re-embeds unchanged chunks. For incremental updates where 95% of chunks are unchanged, this is 95% wasted work.

3. **No parallel embedding.** `embedTextBatch` processes batches sequentially. No concurrency.

4. **Qdrant upsert is sequential.** `insertChunkBatch` processes batches one at a time. No parallel upserts.

5. **No payload indexes.** Any future filtering requires full scan.

---

## PART 11 — Production Readiness

### Issues Preventing Production Deployment

| Issue                             | Severity    | Evidence                                                       |
| --------------------------------- | ----------- | -------------------------------------------------------------- |
| **No observability/metrics**      | 🔴 Critical | No metrics for retrieval latency, success rate, token usage    |
| **No health checks for Qdrant**   | 🔴 Critical | No health endpoint for Qdrant/embedding service                |
| **No retry logic**                | 🟡 High     | Embedding failures abort entire ingestion                      |
| **No context window enforcement** | 🟡 High     | RAG context can exceed LLM context window                      |
| **No logging structure**          | 🟡 High     | Only `console.log`/`console.warn`, no structured logging       |
| **No backup/restore**             | 🟡 High     | No Qdrant snapshot mechanism                                   |
| **No collection migrations**      | 🟡 High     | Schema changes require manual intervention                     |
| **No embedding model versioning** | 🟡 High     | No way to track which model version generated which embeddings |
| **No security controls**          | 🟡 High     | No auth on Qdrant/embedding endpoints                          |
| **No timeout on Qdrant searches** | 🟡 High     | `searchChunks` has no timeout                                  |
| **No circuit breaker**            | 🟡 High     | If embedding service is down, all RAG calls fail               |
| **No graceful degradation**       | 🟡 High     | RAG failure returns empty results, no fallback                 |

### Observability Gap

**Evidence:** No metrics collection for:

- Retrieval latency (embed + search)
- Retrieval success/failure rate
- Token usage (embedding + LLM)
- Qdrant query latency
- Score distribution of retrieved chunks
- Empty result rate

**Impact:** Cannot diagnose slow retrievals, cannot detect embedding service degradation, cannot optimize based on data.

---

## PART 12 — Improvement Opportunities

### High-Impact Improvements

#### 1. Hybrid Search (BM25 + Dense)

**Expected Impact:** +20-30% NDCG@10 improvement
**Complexity:** Medium
**Implementation:**

- Add sparse vector field to Qdrant collection
- Compute BM25 scores alongside Cosine similarity
- Fuse scores using reciprocal rank fusion or weighted average
- Use ripgrep results as sparse vector proxy

#### 2. Cross-Encoder Reranking

**Expected Impact:** +15-25% NDCG@10 improvement
**Complexity:** Medium
**Implementation:**

- Retrieve top-20 via vector search
- Rerank top-20 with cross-encoder (e.g., BGE-reranker)
- Return top-5 reranked results
- Can run locally with `cross-encoder` model

#### 3. Parent-Child Retrieval

**Expected Impact:** +10-20% context quality improvement
**Complexity:** Medium
**Implementation:**

- Store parent documents (full files or sections) in Qdrant
- Store child chunks (1000 chars) with parent_id reference
- Retrieve child chunks by vector search
- Return parent document content for context
- Benefits: small chunks for retrieval, large context for LLM

#### 4. Embedding Cache

**Expected Impact:** 90%+ reduction in embedding API calls for incremental updates
**Complexity:** Low
**Implementation:**

- Store embedding hash → vector mapping in local SQLite/JSON
- On ingestion, check hash before calling embedding service
- Cache invalidation on file change (file hash comparison)

#### 5. Query Expansion

**Expected Impact:** +10-15% recall improvement
**Complexity:** Low
**Implementation:**

- Generate 2-3 query variations using LLM or synonym expansion
- Search with each variation
- Deduplicate and merge results
- Re-rank merged results

#### 6. HYDE (Hypothetical Document Embeddings)

**Expected Impact:** +10-15% relevance improvement for complex queries
**Complexity:** Medium
**Implementation:**

- Generate hypothetical answer to query using LLM
- Embed hypothetical answer
- Search with hypothetical embedding
- Benefits: bridges query-document embedding gap

#### 7. Hierarchical Chunking

**Expected Impact:** +15-25% context quality improvement
**Complexity:** Medium
**Implementation:**

- Level 1: Document-level chunks (full files)
- Level 2: Section-level chunks (by heading)
- Level 3: Paragraph-level chunks (1000 chars)
- Retrieve at appropriate granularity based on query

#### 8. Context Compression

**Expected Impact:** 30-50% token reduction, +5-10% response quality
**Complexity:** Medium
**Implementation:**

- Score each chunk by relevance (Cosine + metadata)
- Remove low-scoring chunks
- Summarize redundant chunks
- Respect token budget before LLM call

#### 9. MMR (Maximal Marginal Relevance)

**Expected Impact:** +5-10% diversity improvement
**Complexity:** Low
**Implementation:**

- After vector search, apply MMR to balance relevance and diversity
- Penalize chunks from same file/section
- Return diverse top-K results

#### 10. Incremental Indexing with File Watcher

**Expected Impact:** Real-time knowledge updates, no full re-ingestion
**Complexity:** High
**Implementation:**

- File system watcher (chokidar) on baseDir
- Queue file changes
- Process queue with embedding cache
- Upsert changed chunks only

---

## PART 13 — Issue List

| Severity    | Area          | Issue                               | Evidence                                           | Impact                                       | Recommendation                                    | Complexity | Priority |
| ----------- | ------------- | ----------------------------------- | -------------------------------------------------- | -------------------------------------------- | ------------------------------------------------- | ---------- | -------- |
| 🔴 Critical | Context       | No token budget on RAG injection    | `gateway.ts` appends chunks without token check    | Prompt overflow, provider errors             | Enforce token budget before context injection     | Low        | P0       |
| 🔴 Critical | Observability | No metrics/logging for RAG pipeline | No metrics collection anywhere                     | Cannot diagnose issues                       | Add structured logging + metrics                  | Medium     | P0       |
| 🔴 Critical | Reliability   | No retry on embedding failures      | `embedder.js` throws on HTTP error                 | Ingestion aborts on transient errors         | Add retry with exponential backoff                | Low        | P0       |
| 🟡 High     | Retrieval     | No hybrid search (BM25 + dense)     | Only vector search, ripgrep is separate tool       | Poor exact-match retrieval                   | Add sparse vector or result fusion                | Medium     | P1       |
| 🟡 High     | Retrieval     | No reranking                        | Raw Cosine scores only                             | Low relevance for complex queries            | Add cross-encoder reranker                        | Medium     | P1       |
| 🟡 High     | Architecture  | Two embedding implementations       | `embedder.js` vs `vector-client.ts`                | Maintenance burden                           | Unify to single embed function                    | Low        | P1       |
| 🟡 High     | Architecture  | Electron chat bypasses shared layer | `handlers.cjs` imports `qdrant-client.js` directly | Inconsistent behavior                        | Refactor to use `vector-client.ts`                | Low        | P1       |
| 🟡 High     | Scalability   | No embedding cache                  | Every ingestion re-embeds all chunks               | 95% wasted API calls for incremental updates | Add hash-based embedding cache                    | Low        | P1       |
| 🟡 High     | Qdrant        | No payload indexes                  | No `create_payload_index` calls                    | O(n) filtered searches                       | Add payload indexes on frequently filtered fields | Low        | P1       |
| 🟡 High     | Qdrant        | No search timeout                   | `searchChunks` has no timeout                      | Hanging queries                              | Add AbortController timeout                       | Low        | P1       |
| 🟡 High     | Metadata      | No meaningful sprint/importance     | Always `-1` and `0.5`                              | No differentiation in ranking                | Compute importance from file position/frequency   | Medium     | P2       |
| 🟡 High     | Metadata      | No section/heading extraction       | `section` is always `""`                           | No structural context                        | Add heading-aware chunking                        | Medium     | P2       |
| 🟡 High     | CI/CD         | No YAML/shell/SQL support           | Excluded extensions                                | No infrastructure knowledge                  | Add `.yml`, `.sh`, `.sql` to supported            | Low        | P2       |
| 🟢 Medium   | Retrieval     | No MMR/diversity                    | Top-K by score only                                | Redundant results from same file             | Add MMR post-processing                           | Low        | P2       |
| 🟢 Medium   | Retrieval     | No query expansion                  | Single query search                                | Poor recall for complex queries              | Add synonym/multi-query expansion                 | Low        | P2       |
| 🟢 Medium   | Chunking      | No code-aware chunking              | Same chunking for all file types                   | Functions split mid-definition               | Add AST-based chunking for code                   | High       | P2       |
| 🟢 Medium   | Chunking      | No deduplication at ingestion       | `rag-dedup.js` exists but unused                   | Duplicate vectors in Qdrant                  | Call `dedupeRagChunks` during ingestion           | Low        | P2       |
| 🟢 Medium   | Context       | No adjacent chunk merging           | Independent chunks                                 | Disjointed context                           | Merge adjacent chunks from same file              | Low        | P2       |
| 🟢 Medium   | Context       | No context compression              | All chunks appended verbatim                       | Token waste on low-relevance content         | Add relevance scoring + compression               | Medium     | P2       |
| 🟢 Medium   | Qdrant        | No quantization                     | Full 32-bit floats                                 | High storage costs                           | Add product quantization                          | Medium     | P3       |
| 🟢 Medium   | Qdrant        | No HNSW tuning                      | Default HNSW params                                | Suboptimal recall/latency                    | Tune `ef` and `ef_construct`                      | Low        | P3       |
| 🟢 Low      | Architecture  | Payload duplication                 | `text` and `content` both written                  | Wasted storage                               | Remove `text` field                               | Low        | P3       |
| 🟢 Low      | Scalability   | No parallel embedding               | Sequential batch processing                        | Slow ingestion                               | Add concurrency limit                             | Medium     | P3       |
| 🟢 Low      | Scalability   | No continuous indexing              | No file watcher                                    | Stale knowledge                              | Add file watcher + queue                          | High       | P3       |
| 🟢 Low      | Security      | No auth on Qdrant/embedding         | No authentication                                  | Unauthorized access                          | Add API key or JWT auth                           | Medium     | P3       |

---

## PART 14 — Final Score

| Category                 | Score (/10) | Rationale                                                                                                                                                                    |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**         | 6.5         | Single Qdrant client is good. Two embedding implementations and inconsistent import paths are weaknesses.                                                                    |
| **Retrieval Quality**    | 4.0         | Basic vector search works. Missing hybrid search, reranking, MMR, query expansion, and metadata filtering significantly limit quality.                                       |
| **Performance**          | 5.0         | Simple architecture is fast for small collections. No caching, no parallelism, no quantization hurt scalability.                                                             |
| **Scalability**          | 4.5         | Works for ~100K chunks with current Qdrant config. No payload indexes, no embedding cache, no parallel processing limit growth.                                              |
| **Maintainability**      | 6.0         | Clean separation of concerns. Two embedding implementations and two chunking implementations add maintenance burden.                                                         |
| **Code Quality**         | 7.0         | Well-structured files, clear exports, good error handling. Some duplicated logic.                                                                                            |
| **Production Readiness** | 4.0         | Missing critical observability, health checks, retry logic, and context window enforcement. Not production-ready.                                                            |
| **Developer Experience** | 6.5         | Clear tool surfaces (vector-search, search-code, retrieve). Inconsistent context formatting across entry points.                                                             |
| **Overall**              | **5.5**     | Functional but incomplete. Core retrieval works. Missing modern RAG capabilities (hybrid search, reranking, caching, observability) that are expected in production systems. |

---

## Summary

### What Works Well ✅

1. **Single Qdrant client** — Clean, consolidated access to vector store
2. **Clear retrieval paths** — Agent, MCP, Gateway, Electron all converge to `searchChunks()`
3. **Incremental ingestion** — File hash comparison avoids re-ingesting unchanged files
4. **Token-budget-aware batching** — Embedding batches respect model context limits
5. **Structured payload** — Rich metadata stored in Qdrant (even if not all fields are meaningful)
6. **Multiple retrieval strategies** — Code, vector, file, symbol, graph strategies in router

### What Needs Immediate Attention 🔴

1. **Token budget enforcement on RAG context** — Prevents prompt overflow
2. **Observability** — Metrics, logging, tracing for the entire pipeline
3. **Retry logic** — For embedding service and Qdrant calls
4. **Embedding cache** — Eliminates 95% of redundant API calls

### What Should Be Planned 🟡

1. **Hybrid search** — BM25 + dense vector fusion
2. **Cross-encoder reranking** — Improves relevance significantly
3. **Parent-child retrieval** — Better context quality
4. **Payload indexes** — Enables efficient filtering
5. **Unified embedding layer** — Single implementation

### What Can Wait 🟢

1. **MMR/diversity** — Nice-to-have, low complexity
2. **Query expansion** — Improves recall, moderate complexity
3. **Quantization** — Reduces storage, moderate complexity
4. **Continuous indexing** — High complexity, incremental value
5. **Multi-repo support** — Requires schema changes

---

_Audit completed based on repository evidence. "Unable to verify from repository" noted where runtime state requires live system access._
