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

// ─── configuration (from environment) ────────────────────────────────────────

const EMBEDDINGS_URL = process.env.EMBEDDINGS_URL ?? "http://localhost:8081";

// ─── timeout configuration ────────────────────────────────────────────────────

const RETRIEVAL_TIMEOUT_MS = Number(process.env.RETRIEVAL_TIMEOUT_MS ?? 10_000);

// ─── types ────────────────────────────────────────────────────────────────────

export interface VectorSearchResult {
  score: number;
  source: string;
  text: string;
}

// ─── embed ────────────────────────────────────────────────────────────────────

/**
 * Converts a text string into an embedding vector by calling the embeddings
 * service at EMBEDDINGS_URL.
 *
 * @throws if the HTTP response is not ok — error message includes status code
 *         and the response body.
 * @throws if the operation exceeds RETRIEVAL_TIMEOUT_MS (default 10000).
 */
export async function embed(text: string): Promise<number[]> {
  const url = `${EMBEDDINGS_URL}/v1/embeddings`;
  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), RETRIEVAL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `embed: embeddings service returned ${response.status}: ${body}`,
      );
    }

    const json = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    const embedding = json.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new TypeError(
        `embed: unexpected response shape — missing data[0].embedding`,
      );
    }

    return embedding;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`embed: timed out after ${RETRIEVAL_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── vectorSearch ─────────────────────────────────────────────────────────────

/**
 * Embeds `query` then searches the Qdrant collection, returning the top-K
 * results mapped to `VectorSearchResult`.
 *
 * @throws if either the embed call or the Qdrant HTTP call fails.
 * @throws if either operation exceeds RETRIEVAL_TIMEOUT_MS (default 10000).
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
