/**
 * qdrant-client.ts — Qdrant vector store replacing Milvus for RAG.
 * Uses Qdrant REST API; no extra SDK required.
 */
export const KNOWLEDGE_COLLECTION = "knowledge_chunks";
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const VECTOR_DIM = 2560; // qwen3-emb-4b

import { embedTextBatch } from "../knowledge/ingest/embedder.js";

export async function ensureKnowledgeCollection(): Promise<void> {
  const res = await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}`);
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  if (
    (body as { status?: { error?: string } })?.status?.error?.includes(
      "doesn't exist",
    ) === false &&
    res.status !== 404
  )
    return;
  await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vectors: { size: VECTOR_DIM, distance: "Cosine" } }),
  });
}

export async function queryTopK(
  text: string,
  k = 5,
): Promise<Array<{ text: string; score: number }>> {
  const [vector] = await embedTextBatch([text]);
  const hits = await searchChunks(vector, k);
  return hits.map((hit) => ({ text: hit.content, score: hit.score }));
}

export async function upsertChunks(
  chunks: Array<
    Record<string, unknown> & {
      chunk_id: string;
      dense_vector: number[];
      content: string;
    }
  >,
): Promise<void> {
  const points = chunks.map((c) => ({
    id: c.chunk_id,
    vector: c.dense_vector,
    payload: { ...c, dense_vector: undefined },
  }));
  await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points }),
  });
}

export async function searchChunks(
  vector: number[],
  limit = 6,
  scoreThreshold = 0.4,
): Promise<
  Array<{
    content: string;
    section: string;
    feature_area: string;
    sprint: number;
    source_type: string;
    score: number;
  }>
> {
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
  return (data.result ?? []).map((hit: any) => ({
    content: hit.payload?.content ?? hit.payload?.text ?? "",
    section: hit.payload?.section ?? "",
    feature_area: hit.payload?.feature_area ?? "",
    sprint: Number(hit.payload?.sprint ?? 0),
    source_type: hit.payload?.source_type ?? "",
    score: hit.score ?? 0,
  }));
}
