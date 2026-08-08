# Open Items Plan — RAG Architecture Audit

**Date:** 2026-08-07  
**Last Updated:** 2026-08-08 (live Qdrant queries added)  
**Source:** Runtime Validation Addendum (`docs/audits/rag-architecture-audit.md`, Section "What genuinely remains open after this pass")  
**Scope:** Four genuinely open items, verified state, proposed approach, scope, risk, and dependencies.  
**Status:** Planning only — no implementation in this session.

---

## Live Qdrant Evidence (2026-08-08)

**Qdrant version:** 1.18.2 (`GET http://localhost:6333` returned `{"version":"1.18.2",...}`)  
**Collection query:** `GET http://localhost:6333/collections/knowledge_chunks`

```json
{
  "result": {
    "status": "green",
    "points_count": 14108,
    "indexed_vectors_count": 13952,
    "segments_count": 7,
    "config": {
      "params": {
        "vectors": { "size": 2560, "distance": "Cosine" },
        "on_disk_payload": true
      },
      "hnsw_config": { "m": 16, "ef_construct": 100 },
      "payload_schema": {}
    }
  },
  "status": "ok",
  "time": 0.005474325
}
```

**Key findings from live query:**

1. `points_count: 14108` — **Item 2's "empty collection" premise is WRONG.** The collection is populated with ~14k points.
2. `payload_schema: {}` — **Item 1 confirmed by live data.** No payload indexes exist (Qdrant populates `payload_schema` only after `create_field_index` calls).
3. `hnsw_config.m: 16, ef_construct: 100` — differs from code's `COLLECTION_TUNING` (`m: 32, ef_construct: 200`). This suggests the collection was created by a different code path or an older version. Not an open item, but worth noting.

---

## Item 1 — No Payload Indexes Created on Collection

### Current Verified State

**CONFIRMED by live Qdrant query (2026-08-08).** The live collection returns `"payload_schema": {}` — no payload indexes exist.

Evidence:

- **Live query** `GET http://localhost:6333/collections/knowledge_chunks` returned `"payload_schema": {}` — Qdrant only populates this after explicit `create_field_index` calls.
- `COLLECTION_TUNING.payload_schema` is defined but **intentionally excluded** from `hasDesiredCollectionConfig()` checks (the comment explains why: Qdrant only populates `payload_schema` after explicit index creation, so checking it caused spurious 409 errors).
- The comment in `hasDesiredCollectionConfig()` says: _"The payload indexes are created during upsertChunks when needed."_ — **this is FALSE.** No `create_field_index` calls exist anywhere in the codebase.
- Grep search: zero matches for `create_field_index` across the entire workspace.
- **Scale concern:** Live collection has **14,108 points** (not 0–200 as previously assumed). At this scale, unindexed payload filters will cause measurable latency degradation.

**Impact:** Filtering on payload fields during search (`searchChunks` / `queryTopK`) works via Qdrant's brute-force scan on unindexed payload. With 14k+ points, this is now a production performance concern, not a theoretical future issue.

### Proposed Approach

Add `create_field_index` calls in `ensureKnowledgeCollection()` after the collection is confirmed to exist with desired structural config. Create payload indexes for the fields used in `buildQdrantFilter()`.

**Confirmed Qdrant v1.18.2 API shape** (tested live on 2026-08-08 against scratch collection `_scratch_index_test`):

- **Endpoint:** `PUT /collections/{collection_name}/index`
- **Request body:** `{ "field_name": "string", "field_schema": "keyword" | "integer" | ... }`
- **Python SDK equivalent:** `client.create_payload_index(collection_name, field_name, field_schema="keyword")`

**Live test results:**

| Test | Request Body                                               | Result                                                                                                 |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A    | `{"field_name": "path", "field_schema": "keyword"}`        | ✅ `{"operation_id":2,"status":"acknowledged"}`                                                        |
| B    | `{"field_name": "section", "field_index_type": "keyword"}` | ❌ `{"error":"Bad request: Can't auto-detect field type, please specify field_schema in the request"}` |

**Confirmed correct parameter: `field_schema` (NOT `field_index_type`).**

```javascript
// Fields used in buildQdrantFilter() / SUPPORTED_FILTER_COLUMNS:
const PAYLOAD_INDEX_FIELDS = [
  { name: "path", schema: "keyword" },
  { name: "section", schema: "keyword" },
  { name: "sprint", schema: "integer" },
  { name: "feature_area", schema: "keyword" },
  { name: "source_type", schema: "keyword" },
  { name: "module", schema: "keyword" },
  { name: "doc_id", schema: "keyword" },
  { name: "parent_id", schema: "keyword" },
];

for (const { name, schema } of PAYLOAD_INDEX_FIELDS) {
  await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/index`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      field_name: name,
      field_schema: schema,
    }),
  });
}
```

**Note:** The endpoint is singular `/index` (not `/indexes/{field}`). The field name and schema type are in the request body. Parameter name is `field_schema` (confirmed by live test, not just docs).

### Rough Scope

| File                                       | Change                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/llm/qdrant-client.js`                 | Add `create_field_index` calls in `ensureKnowledgeCollection()` after collection exists check |
| `tests/llm/qdrant-client-coverage.test.ts` | Add test verifying index creation is called                                                   |

**Estimated effort:** 1–2 hours (Qdrant API call + test).

### Risk

- **Low.** Adding indexes is additive — it does not change search semantics, only performance. If index creation fails, the collection still works (just slower). Consider wrapping in try/catch with a warning log.
- **Caveat:** Index creation is a one-time operation per field. If the collection already exists without indexes, `ensureKnowledgeCollection()` must still create them (idempotent: Qdrant returns success if index already exists).

### Dependencies

- None. Standalone fix.

---

## Item 2 — Qdrant Collection Population Status

### Current Verified State

**REVISED — Collection is POPULATED with 14,108 points.** The "empty collection" premise from the prior audit is **WRONG** as of the live query on 2026-08-08.

Evidence:

- **Live query** `GET http://localhost:6333/collections/knowledge_chunks` returned `"points_count": 14108`.
- `ingestSprintHistory()` in `src/knowledge/ingest/ingest-sprint-history.js` is **actively used** and discovers `.md`, `.markdown`, `.txt` files matching `sprint*.md` patterns in a base directory.
- Grep search: 243 matches for `ingestRepository|ingestSprintHistory` confirming active usage by IPC handlers, CLI scripts, and tests.
- The ingestion pipeline (`ensureKnowledgeCollection` → `upsertChunks` → `upsertLexicalChunks`) is fully implemented and tested.

**Impact:** E2E retrieval quality (relevance, recall) **can now be assessed** against the populated collection. The pipeline has real data to work with. The prior concern about an empty collection is no longer valid.

### Proposed Approach

**No action needed for collection population.** The collection is already populated with 14,108 points.

**Path B — Add a health check / status endpoint (still recommended):**

1. Add a lightweight `/knowledge/status` endpoint (or IPC channel) that returns:
   - Qdrant collection point count (from live query)
   - Lexical DB row count
   - Last ingestion timestamp
2. This serves operational visibility and debugging — useful for monitoring collection health over time.

### Rough Scope

| File                                            | Change                                                     |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `src/knowledge/ingest/ingest-sprint-history.js` | No changes needed — already functional                     |
| `src/knowledge/ingest/ingest-repository.js`     | No changes needed — already functional                     |
| `src/accounts/health.js` (or new file)          | Optionally add knowledge/retrieval status to health checks |
| `electron-ui/ipc/` (optional)                   | Add IPC handler for knowledge status query                 |

**Estimated effort:** Path A = 30 min (operational). Path B = 2–3 hours (code change).

### Risk

- **Very low.** This is a data population issue, not a code change. Path A has zero risk. Path B adds a read-only status endpoint.

### Dependencies

- Depends on having sprint report markdown files available in a known directory.
- Path B (health check) could be done in parallel with Item 1.

---

## Item 3 — Observability Gap

### Current Verified State

**CONFIRMED.** Structured logging exists but no metrics/tracing/health infrastructure covers the RAG pipeline.

Evidence:

- **Structured logging is extensive.** The retrieval pipeline emits `logger.info`/`logger.warn`/`logger.error` events for:
  - `retrieval.hybrid-search` — hybrid search orchestration
  - `retrieval.qdrant` — vector search results (includes `resultCount`)
  - `retrieval.embedding` — embedding operations
  - `retrieval.rerank` — reranking operations
  - `retrieval.context-budget` — token budget management
  - `retrieval.code-search` — code search operations
  - `retrieval.vector-search` — vector search operations
  - `retrieval.query` — query operations
- **No metrics backend.** No Prometheus, OpenTelemetry, or lightweight metrics library.
- **No tracing.** No distributed tracing spans.
- **No health endpoint for RAG.** Health checks exist in `src/accounts/health.js` for accounts/daemon, but NOT for the RAG/retrieval pipeline.
- **Embedding cache stats exist.** `getEmbeddingCacheStats().hits` is used in tests to verify cache hits.

### Honest Assessment: Does Structured Logging Suffice for an Electron Desktop App?

**Recommendation: Structured logging SUFFICES for a desktop Electron app, with one addition.**

Rationale:

1. **No multi-instance deployment.** Unlike a server, an Electron app runs on a single user's machine. There is no need for centralized log aggregation or distributed tracing.
2. **User-facing debugging.** Structured logs (written to file or console) are sufficient for debugging user-reported issues.
3. **Performance monitoring is unnecessary.** A desktop app's performance characteristics are bounded by the local machine. The existing `performance.now()` measurements in `hybrid-search.js` (embed latency, vector search latency) are adequate for detecting regressions.
4. **The real gap is health/status visibility.** Users and developers need to know: "Is the knowledge base populated? Is the embedding service working? How many chunks are indexed?" This is best served by a lightweight status endpoint (Item 2, Path B), not a full metrics backend.

**Proposed minimal addition:**

- Add a `getKnowledgeStatus()` function that returns:
  - Qdrant point count (via a lightweight Qdrant API call: `GET /collections/{name}/points/counts`)
  - Lexical DB row count (via `SELECT COUNT(*) FROM lexical_chunks`)
  - Embedding cache hit rate (from `getEmbeddingCacheStats()`)
- Expose this via IPC or a simple CLI command.
- Optionally surface it in the Electron UI as a "Knowledge Base Status" panel.

### Rough Scope

| File                                         | Change                           |
| -------------------------------------------- | -------------------------------- |
| `src/knowledge/status.js` (new)              | `getKnowledgeStatus()` function  |
| `electron-ui/ipc/` (new or existing handler) | IPC handler for knowledge status |
| `electron-ui/` (optional)                    | UI panel for knowledge status    |

**Estimated effort:** 2–4 hours (new file + IPC handler + optional UI).

### Risk

- **Very low.** Read-only status query. No changes to ingestion or search paths.
- **Caveat:** The Qdrant point count API call adds a small latency overhead (~10–50ms) on each status check. Should be cached or called infrequently.

### Dependencies

- Can be done in parallel with Items 1 and 4.
- Depends on Qdrant REST API availability (always available if the collection exists).

---

## Item 4 — knowledge-handlers.cjs Still Registered in main.cjs

### Current Verified State

**CONFIRMED.** `electron-ui/ipc/knowledge-handlers.cjs` is dead code using legacy Milvus API, but still registered in `main.cjs` and exposed in `preload.cjs`.

Evidence:

- **`electron-ui/ipc/knowledge-handlers.cjs`** — imports `getMilvusClient` and `embedTextBatch` from `knowledge()`, uses Milvus client API (`client.search()` with `collection_name: "knowledge_chunks"`). No production callers.
- **`electron-ui/main.cjs:27`** — `const { registerKnowledgeHandlers } = require("./ipc/knowledge-handlers.cjs");` — still registered.
- **`electron-ui/preload.cjs:268-272`** — exposes `workspaceKnowledge.ingest` and `workspaceKnowledge.search` via `ipcRenderer.invoke`.
- **Grep search:** zero live production callers to `knowledge-handlers.cjs`, `getMilvusClient`, or `@zilliz/milvus2-sdk-node` in active source directories.
- **`package.json`:** `@zilliz/milvus2-sdk-node` is NOT in current dependencies.

**Impact:** Functional risk is low (never called). Code hygiene risk: dead code increases maintenance burden and confusion for new developers.

### Proposed Approach

Remove the dead code in a dedicated cleanup PR:

1. **Delete** `electron-ui/ipc/knowledge-handlers.cjs`
2. **Remove** import and registration from `electron-ui/main.cjs`:
   - Remove line: `const { registerKnowledgeHandlers } = require("./ipc/knowledge-handlers.cjs");`
   - Remove the call to `registerKnowledgeHandlers(ipcMain, ...)`
3. **Remove** `workspaceKnowledge` exposure from `electron-ui/preload.cjs`:
   - Remove lines 268–272 (the `knowledge: { ingest, search }` block)
4. **Check for type definitions** — search for any TypeScript types or interfaces referencing `workspaceKnowledge`, `knowledge:ingest`, or `knowledge:search`.
5. **Check for tests** — search for tests referencing `knowledge-handlers`, `workspaceKnowledge`, or the IPC channels `knowledge:ingest`/`knowledge:search`.
6. **Run full test suite** to confirm no regressions.

### Rough Scope

| File                                     | Change                                      |
| ---------------------------------------- | ------------------------------------------- |
| `electron-ui/ipc/knowledge-handlers.cjs` | **DELETE**                                  |
| `electron-ui/main.cjs`                   | Remove import and registration call         |
| `electron-ui/preload.cjs`                | Remove `workspaceKnowledge` exposure        |
| `electron-ui/types.d.ts` (if exists)     | Remove `workspaceKnowledge` type            |
| `tests/`                                 | Remove any tests referencing these channels |

**Estimated effort:** 1–2 hours (careful removal + test verification).

### Risk

- **Low, but requires verification.** Must confirm no renderer code or external tools call `window.rotator.knowledge.search` or `window.rotator.knowledge.ingest`. Search the renderer codebase for these patterns before deleting.
- **Caveat:** If the renderer uses `workspaceKnowledge` for any purpose (even if the IPC handler is dead), removing the preload exposure will break the renderer. Verify renderer usage first.

### Dependencies

- **Must be done after Items 1–3 are verified** (to avoid conflating cleanup with feature work).
- Should be a standalone PR to keep the change clearly scoped (as recommended in the Runtime Validation Addendum).

---

## Dependency Graph

```
Item 1 (Payload Indexes) ─────────┐
                                  │
Item 3 (Observability/Status) ────┤──→ No hard dependencies between items
                                  │
Item 4 (Dead Code Removal) ───────┘
                                  │
                                  └──→ Item 4 should be done LAST (cleanup after feature work)

Note: Item 2 (Collection Population) is CLOSED — collection has 14,108 points.
```

**Recommendation:** Execute Items 1, 3 in any order (they are independent). Execute Item 4 last as a cleanup PR. Item 2 is CLOSED.

---

## Summary Table

| #   | Item                             | Confidence                | Risk     | Effort | Priority                           |
| --- | -------------------------------- | ------------------------- | -------- | ------ | ---------------------------------- |
| 1   | No payload indexes               | [CONFIRMED by live query] | Low      | 1–2h   | Medium (performance at 14k points) |
| 2   | Qdrant collection empty          | **CLOSED** — 14,108 pts   | N/A      | N/A    | N/A                                |
| 3   | Observability gap                | [CONFIRMED]               | Very Low | 2–4h   | Low (logging suffices for desktop) |
| 4   | knowledge-handlers.cjs dead code | [CONFIRMED]               | Low      | 1–2h   | Low (cleanup, defer)               |

---

## Notes

- All four items were verified via file reads, grep searches, and the Runtime Validation Addendum's corrected harness results (58/58 checks passed).
- **Live Qdrant queries executed on 2026-08-08** against v1.18.2 at `http://localhost:6333`:
  - `points_count: 14108` — collection is populated, not empty.
  - `payload_schema: {}` — no payload indexes exist (confirmed by live data, not just code analysis).
  - `hnsw_config.m: 16, ef_construct: 100` — differs from code's `COLLECTION_TUNING` (`m: 32, ef_construct: 200`), suggesting the collection was created by a different code path or older version.
- The Qdrant OpenAPI spec is not exposed at `/openapi.json` (404). The correct field index API shape was obtained from official docs at `api.qdrant.tech`: `PUT /collections/{collection_name}/index` with body `{ "field_name": "...", "field_index_type": "..." }`.
- The observability assessment is specific to an Electron desktop app. A server-side deployment would require different considerations.


---

## Stage 2 Completion Record — 2026-08-08/09

### Items closed by Stage 2

| Item | Status | Commit |
|------|--------|--------|
| 1 — Payload indexes | **CLOSED** — 6 indexes created via `ensurePayloadIndexes()` on every startup | `75f9073e` |
| HNSW config mismatch | **CLOSED** — collection rebuilt with m:32/ef:200; mismatch now logged via `logger.warn` | `75f9073e` |
| Corpus contamination | **CLOSED** — 9 artifact/build dirs added to `EXCLUDED_DIRS` | `bd1adff1` |

### Post-rebuild collection state (live, as of 2026-08-09)

- **points_count:** 3,748
- **hnsw_config:** m:32, ef_construct:200 ✓
- **payload_schema:** path, section, feature_area, source_type, module (keyword), sprint (integer) ✓
- **payload indexes verified working:** filtered query on `source_type=typescript` returns TypeScript files ✓
- **ensureKnowledgeCollection() idempotency:** called twice, no throw, no spurious recreation ✓

### Corrected explanation for 14,108 → 3,748 point count (snapshot-verified, 2026-08-09)

The Stage 2 completion report claimed the drop was due to "Milvus-era duplicate inserts from non-incremental repeated inserts." **This claim is wrong and is retracted here.**

The actual cause was established by restoring the pre-deletion snapshot (`knowledge_chunks-8064737647479474-2026-08-08-18-29-09.snapshot`, 219 MB) into a scratch collection (`knowledge_chunks_pre_rebuild`) and directly inspecting its content. The scratch collection was deleted after analysis.

**Evidence:**

1. **No duplicates in the old corpus.** All 14,108 points had `doc_id` prefix `repo:` — the same Qdrant-targeting ingest pipeline, not Milvus. `upsertChunks()` uses deterministic `pointId = SHA-256(chunk_id)` → Qdrant PUT is an upsert by key; simple re-runs cannot create duplicate point IDs. Point-level duplication was ruled out.

2. **Primary cause — chunker migration (accounts for ~3.8× of the reduction):**  
   The old corpus was built with the **word-based** `chunkText()` function (512 tokens/chunk, 64-word overlap → step 448 words → ~1000 characters per chunk). The current source uses `chunkTextWithOffsets()` (3000 chars/chunk, 300-char overlap → step 2700 chars). This 3× increase in chunk window size produces proportionally fewer chunks per file. Cross-collection comparison confirmed: `repo:src/llm/qdrant-client.js` had 7 chunks (old, ~1000 chars each) vs. 5 chunks (new, ~3000 chars each); `repo:tests/ui/dashboard.test.js` had 424 chunks (old) vs. 110 chunks (new). The two collections share point IDs for chunks with the same ordinal (same `chunk_id` string → same UUID), confirming the old points were genuine single-run ingest, not duplicates.

3. **Secondary cause — artifact directories removed (accounts for 2,471 points = 17.5% of old total):**  
   The 9 directories added to `EXCLUDED_DIRS` contributed 2,471 points to the old corpus, including:
   - `playwright-report-ui`: 1,581 points (minified Playwright trace viewer JS bundles, avg 999 chars/chunk)
   - `dumps`: 683 points
   - `coverage-tmp`, `coverage-tmp2`, `coverage-tmp3`: 198 points combined
   - `audit_chunks`: 9 points

4. **Partially offsetting factor — working tree has grown.** The old ingest covered 886 distinct `doc_id`s; the new ingest found 969 files. The 83 additional files added points, partially offsetting Factors 1 and 2.

**Summary:**  
`14,108 - 2,471 (excluded dirs) = 11,637` corpus-eligible points in old collection.  
`11,637 / 3.76 (chunk size ratio) ≈ 3,094` projected new points from same files.  
Actual: **3,748** (higher because 83 more source files exist in current working tree).  
The numbers are internally consistent. The drop was legitimate quality improvement, not data loss.

### Wording discrepancy clarification

The `75f9073e` commit message says "1 pre-existing symbol-indexer.integration failure" — this refers to **1 failing test file** (`symbol-indexer.integration.test.ts`). That file contained **4 failing test cases** (all `beforeEach`/`afterEach`/test bodies failing with the same root cause: `relation "symbols" does not exist`). Both descriptions are accurate at their respective granularity level. Fixed in `9bb6fea7` (run migrations in `beforeAll`); full suite now 388/388 files, 6613/6613 tests, 0 failures.
