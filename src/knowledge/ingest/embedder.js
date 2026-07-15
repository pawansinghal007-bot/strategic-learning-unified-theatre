/**
 * embedder.js — Batch text embedding via the live qwen-stack embeddings service.
 *
 * Calls POST /v1/embeddings on the OpenAI-compatible endpoint (qwen3-emb-4b,
 * 2560 dimensions).  Preserves the original signature so ingestion scripts
 * need no changes to their call sites.
 */

import { Agent } from "undici";

const EMBEDDINGS_BASE_URL =
  process.env.EMBEDDINGS_URL ?? "http://localhost:8081";
const EMBEDDINGS_URL = `${EMBEDDINGS_BASE_URL}/v1/embeddings`;
const EMBEDDINGS_MODEL = process.env.EMBEDDINGS_MODEL ?? "qwen3-emb-4b";
// Batch size = 32 for throughput (was 1, testing if 32 is supported).
const BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE || "32", 10);

// Extended timeouts to survive qwen3-emb-4b cold start (20 minutes).
const HEADERS_TIMEOUT = parseInt(
  process.env.EMBEDDING_HEADERS_TIMEOUT_MS || "1200000",
  10,
);
const BODY_TIMEOUT = parseInt(
  process.env.EMBEDDING_BODY_TIMEOUT_MS || "1200000",
  10,
);

// Custom undici Agent with extended timeouts (default is 300s which is too short).
const embeddingsAgent = new Agent({
  headersTimeout: HEADERS_TIMEOUT,
  bodyTimeout: BODY_TIMEOUT,
});

/**
 * Converts an array of text strings into embedding vectors by calling the
 * qwen-stack embeddings service in batched requests.
 *
 * @param {string[]} texts - Text strings to embed.
 * @returns {Promise<number[][]>} Array of embedding vectors, one per input text, each 2560 dimensions.
 * @throws if the HTTP response is not ok — error message includes status code
 *         and the response body.
 */
export async function embedTextBatch(texts) {
  const vectors = [];

  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const batch = texts.slice(offset, offset + BATCH_SIZE);
    const response = await fetch(EMBEDDINGS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: batch, model: EMBEDDINGS_MODEL }),
      dispatcher: embeddingsAgent,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `embedTextBatch: embeddings service returned ${response.status}: ${body}`,
      );
    }

    const json = await response.json();

    const batchData = json.data ?? [];
    if (batchData.length !== batch.length) {
      throw new TypeError(
        `embedTextBatch: expected ${batch.length} embeddings but got ${batchData.length}`,
      );
    }

    for (const item of batchData) {
      const embedding = item.embedding;
      if (!Array.isArray(embedding)) {
        throw new TypeError(
          "embedTextBatch: unexpected response shape — missing data[].embedding",
        );
      }
      vectors.push(embedding);
    }
  }

  return vectors;
}
