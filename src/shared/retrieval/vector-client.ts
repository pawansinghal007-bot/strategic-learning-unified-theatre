/**
 * src/shared/retrieval/vector-client.ts
 *
 * Shared retrieval layer — vector similarity search.
 *
 * Used by both:
 *   - src/agents/tools/vector-search.ts  (harness tool surface)
 *   - src/mcp/server.ts                  (MCP tool surface)
 *
 * No Qdrant or embeddings HTTP logic should be duplicated outside this module.
 */

import { logger } from "../logging/logger.js";
import { searchChunks } from "../../llm/qdrant-client.js";
import { embedText } from "../../knowledge/ingest/embedder.js";

// ─── types ────────────────────────────────────────────────────────────────────

export interface VectorSearchResult {
  score: number;
  source: string;
  text: string;
}

// ─── embed ────────────────────────────────────────────────────────────────────

/**
 * Converts a text string into an embedding vector.
 *
 * Pure delegate to the canonical embedder module. All HTTP transport,
 * retry logic, and caching are handled there.
 */
export async function embed(text: string): Promise<number[]> {
  return embedText(text);
}

// ─── vectorSearch ─────────────────────────────────────────────────────────────

/**
 * Embeds `query` then searches the Qdrant collection, returning the top-K
 * results mapped to `VectorSearchResult`.
 *
 * @throws if either the embed call or the Qdrant search call fails.
 */
export async function vectorSearch(
  query: string,
  topK = 5,
): Promise<VectorSearchResult[]> {
  const vector = await embed(query);
  const hits = await searchChunks(vector, topK);

  const results: VectorSearchResult[] = hits.map((hit) => ({
    score: hit.score,
    source:
      hit.path?.trim() || hit.source?.trim()
        ? hit.path?.trim() || hit.source?.trim() || ""
        : hit.id !== undefined
        ? String(hit.id)
        : "",
    text: hit.content,
  }));

  logger.info("retrieval.vector-search", {
    query,
    topK,
    hits: results.length,
  });

  return results;
}
