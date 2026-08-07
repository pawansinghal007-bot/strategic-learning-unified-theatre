/**
 * qdrant-client.js — Qdrant vector store replacing Milvus for RAG.
 * Uses Qdrant REST API; no extra SDK required.
 */

import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { logger } from "../shared/logging/logger.js";

export const KNOWLEDGE_COLLECTION = "knowledge_chunks";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
/* v8 ignore next */
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const VECTOR_DIM = 2560; // qwen3-emb-4b

export async function queryTopK(text, k = 5) {
  const startMs = performance.now();
  const rerankEnabled = process.env.RERANK_ENABLED === "true";
  const poolSize = Number(process.env.RERANK_CANDIDATE_POOL ?? 30);
  const fetchLimit = rerankEnabled ? poolSize : k;

  try {
    const { hybridSearchChunks } = await import("./hybrid-search.js");
    const { rerankCandidates } = await import("./reranker.js");

    const fused = await hybridSearchChunks(
      text,
      fetchLimit,
      {},
      {
        scoreThreshold: Number(process.env.VECTOR_SCORE_THRESHOLD ?? 0.4),
      },
    );

    if (!rerankEnabled) {
      logger.info("retrieval.query", {
        query: text,
        topK: k,
        rerankEnabled: false,
        fusedCount: fused.length,
        durationMs: Number((performance.now() - startMs).toFixed(3)),
      });
      return fused.slice(0, k);
    }

    try {
      const reranked = await rerankCandidates(text, fused, {
        topK: k,
        poolSize,
      });
      logger.info("retrieval.query", {
        query: text,
        topK: k,
        rerankEnabled: true,
        poolSize,
        fusedCount: fused.length,
        returnedCount: reranked.length,
        durationMs: Number((performance.now() - startMs).toFixed(3)),
      });
      return reranked;
    } catch (err) {
      logger.warn("retrieval.rerank_error", { error: String(err) });
      logger.info("retrieval.query", {
        query: text,
        topK: k,
        rerankEnabled: true,
        poolSize,
        fusedCount: fused.length,
        returnedCount: Math.min(k, fused.length),
        durationMs: Number((performance.now() - startMs).toFixed(3)),
      });
      return fused.slice(0, k);
    }
  } catch (err) {
    logger.error("retrieval.query_failed", {
      query: text,
      topK: k,
      rerankEnabled,
      error: String(err),
      durationMs: Number((performance.now() - startMs).toFixed(3)),
    });
    return [];
  }
}

/** Deterministic UUID from a chunk_id string (SHA-256 → UUID format). */
function pointId(chunkId) {
  const h = createHash("sha256").update(chunkId).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join("-");
}

const COLLECTION_TUNING = {
  hnsw_config: {
    m: 32,
    ef_construct: 200,
    full_scan_threshold: 10000,
    max_indexing_threads: 0,
  },
  payload_schema: {
    path: { data_type: "keyword" },
    section: { data_type: "keyword" },
    sprint: { data_type: "integer" },
    feature_area: { data_type: "keyword" },
    source_type: { data_type: "keyword" },
    module: { data_type: "keyword" },
  },
};

function hasDesiredCollectionConfig(config) {
  if (!config) return false;

  const hnsw = config.hnsw_config ?? {};
  const vectors = config.params?.vectors ?? {};

  // Only check structural parameters that are set at collection creation time:
  // vector size, distance metric, and HNSW graph parameters.
  //
  // payload_schema is intentionally excluded: Qdrant only populates it after
  // explicit payload-index creation calls (create_field_index), so it is
  // always empty on a freshly created or empty collection.  Checking it caused
  // a spurious recreation attempt on every startup, which Qdrant rejected with
  // 409 "already exists" → ensureKnowledgeCollection threw instead of returning
  // cleanly.  The payload indexes are created during upsertChunks when needed.
  return (
    vectors.size === VECTOR_DIM &&
    vectors.distance === "Cosine" &&
    hnsw.m === COLLECTION_TUNING.hnsw_config.m &&
    hnsw.ef_construct === COLLECTION_TUNING.hnsw_config.ef_construct
  );
}

export async function ensureKnowledgeCollection() {
  const res = await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}`);

  if (res.ok) {
    const body = await res.json().catch(() => ({}));
    if (hasDesiredCollectionConfig(body?.result?.config)) {
      return;
    }
  } else {
    const body = await res.json().catch(() => ({}));
    if (
      body?.status?.error?.includes("doesn't exist") === false &&
      res.status !== 404
    ) {
      return;
    }
  }

  const create = await fetch(
    `${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vectors: {
          size: VECTOR_DIM,
          distance: "Cosine",
        },
        ...COLLECTION_TUNING,
      }),
    },
  );

  if (!create.ok) {
    console.error(
      "Failed to create collection:",
      create.status,
      await create.text(),
    );
    throw new Error("Collection creation failed");
  }
}

export async function upsertChunks(chunks) {
  const points = chunks.map((c) => ({
    id: pointId(c.chunk_id),
    vector: c.dense_vector,
    payload: { ...c, dense_vector: undefined },
  }));

  const res = await fetch(
    `${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    },
  );

  if (!res.ok) {
    console.error("Qdrant:", res.status, await res.text());
    throw new Error("Upsert failed");
  }
}

const SUPPORTED_VECTOR_FILTER_COLUMNS = new Set([
  "chunk_id",
  "doc_id",
  "path",
  "section",
  "parent_id",
  "feature_area",
  "source_type",
  "sprint",
  "module",
]);

/**
 * Build a Qdrant `filter` object from a plain key/value filters map.
 * Only columns in SUPPORTED_VECTOR_FILTER_COLUMNS are forwarded.
 *
 * @param {Record<string, string|number|string[]>} filters
 * @returns {{ must: object[] } | undefined}
 */
function buildQdrantFilter(filters) {
  if (!filters || typeof filters !== "object") return undefined;

  const must = [];
  for (const [key, value] of Object.entries(filters)) {
    if (!SUPPORTED_VECTOR_FILTER_COLUMNS.has(key)) continue;

    if (Array.isArray(value)) {
      // Skip empty arrays — no filter condition
      if (value.length > 0) {
        must.push({ key, match: { any: value } });
      }
      continue;
    }
    if (value == null) continue;
    must.push({ key, match: { value } });
  }

  if (must.length === 0) return undefined;
  return { must };
}

export async function searchChunks(
  vector,
  limit = 6,
  scoreThreshold = 0.4,
  filters = {},
) {
  const qdrantFilter = buildQdrantFilter(filters);
  const searchParams = {
    hnsw_ef: Math.max(32, Math.min(256, limit * 16)),
  };
  const requestBody = {
    vector,
    limit,
    with_payload: true,
    score_threshold: scoreThreshold,
    params: searchParams,
  };
  if (qdrantFilter) {
    requestBody.filter = qdrantFilter;
  }

  const startMs = performance.now();
  const res = await fetch(
    `${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    },
  );
  const durationMs = Number((performance.now() - startMs).toFixed(3));
  if (!res.ok) {
    const body =
      typeof res.text === "function" ? await res.text().catch(() => "") : "";
    const status = typeof res.status === "number" ? res.status : "unknown";
    logger.warn("retrieval.qdrant_error", {
      status,
      scoreThreshold,
      filters: Object.keys(filters ?? {}).length,
      durationMs,
    });
    throw new Error(`searchChunks: Qdrant returned ${status}: ${body}`);
  }
  const data = await res.json();
  const results = (data.result ?? []).map((hit) => ({
    // Return the semantic chunk_id from the payload so it matches the id
    // used by lexical-index.js — both arms must share the same ID space
    // for fuseHybridResults() to correctly merge overlapping results.
    id: hit.payload?.chunk_id ?? hit.id,
    path: hit.payload?.path ?? "",
    source: hit.payload?.source ?? "",
    content: hit.payload?.content ?? hit.payload?.text ?? "",
    section: hit.payload?.section ?? "",
    parentId: hit.payload?.parent_id ?? "",
    parentText: hit.payload?.parent_text ?? "",
    feature_area: hit.payload?.feature_area ?? "",
    sprint: Number(hit.payload?.sprint ?? 0),
    source_type: hit.payload?.source_type ?? "",
    score: hit.score ?? 0,
  }));

  logger.info("retrieval.qdrant", {
    vectorLength: Array.isArray(vector) ? vector.length : null,
    limit,
    scoreThreshold,
    filterCount: Object.keys(filters ?? {}).length,
    resultCount: results.length,
    durationMs,
  });

  return results;
}

/**
 * Fetch all existing file hashes from Qdrant by scrolling the collection
 * with payload-only responses.
 *
 * @returns {Promise<Map<string, string>>} Map from doc_id to file_hash.
 */
export async function getExistingFileHashes() {
  const hashes = new Map();
  let next_page_offset;

  do {
    const body = {
      limit: 100,
      with_payload: ["doc_id", "file_hash"],
      with_vector: false,
    };
    if (next_page_offset) {
      body.offset = next_page_offset;
    }

    const res = await fetch(
      `${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points/scroll`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      throw new Error("Failed to fetch existing file hashes");
    }

    const data = await res.json();
    const points = data.result?.points ?? [];

    for (const point of points) {
      const docId = point.payload?.doc_id;
      const fileHash = point.payload?.file_hash;
      if (docId && fileHash) {
        hashes.set(docId, fileHash);
      }
    }

    // next_page_offset is truthy when there are more pages
    next_page_offset = data.result?.next_page_offset;
  } while (next_page_offset);

  return hashes;
}

/**
 * Delete all chunks from Qdrant that match a given doc_id.
 *
 * @param {string} docId - The doc_id to delete chunks for.
 * @throws if docId is falsy.
 */
export async function deleteChunksByDocId(docId) {
  if (!docId) {
    throw new Error("deleteChunksByDocId: docId must be a non-empty string");
  }

  const res = await fetch(
    `${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: "doc_id",
              match: { value: docId },
            },
          ],
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error("Failed to delete chunks");
  }
}
