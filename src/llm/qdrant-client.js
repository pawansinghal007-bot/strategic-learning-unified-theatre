/**
 * qdrant-client.js — Qdrant vector store replacing Milvus for RAG.
 * Uses Qdrant REST API; no extra SDK required.
 */

import { createHash } from "node:crypto";

export const KNOWLEDGE_COLLECTION = "knowledge_chunks";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
/* v8 ignore next */
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const VECTOR_DIM = 2560; // qwen3-emb-4b

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

export async function ensureKnowledgeCollection() {
  const res = await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}`);

  if (res.ok) return;

  const body = await res.json().catch(() => ({}));

  if (
    body?.status?.error?.includes("doesn't exist") === false &&
    res.status !== 404
  ) {
    return;
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

export async function searchChunks(vector, limit = 6, scoreThreshold = 0.4) {
  const res = await fetch(
    `${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        score_threshold: scoreThreshold,
      }),
    },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.result ?? []).map((hit) => ({
    content: hit.payload?.content ?? hit.payload?.text ?? "",
    section: hit.payload?.section ?? "",
    feature_area: hit.payload?.feature_area ?? "",
    sprint: Number(hit.payload?.sprint ?? 0),
    source_type: hit.payload?.source_type ?? "",
    score: hit.score ?? 0,
  }));
}

/**
 * Fetch all existing file hashes from Qdrant by scrolling the collection
 * with payload-only responses.
 *
 * @returns {Promise<Map<string, string>>} Map from doc_id to file_hash.
 */
export async function getExistingFileHashes() {
  const hashes = new Map();
  let next_page_offset = undefined;

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
