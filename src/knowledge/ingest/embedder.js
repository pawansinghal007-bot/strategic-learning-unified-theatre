/**
 * embedder.js — Batch text embedding via the live qwen-stack embeddings service.
 *
 * Calls POST /v1/embeddings on the OpenAI-compatible endpoint (qwen3-emb-4b,
 * 2560 dimensions).  Uses token-budget-aware batching to prevent exceeding
 * the model's context window.
 */

import { Agent } from "undici";
import { estimateTokenCount } from "../../llm/document-ingester.js";

const EMBEDDINGS_BASE_URL =
  // v8 ignore next: env variable fallback (EMBEDDINGS_URL) is set at runtime; default is always used in tests
  process.env.EMBEDDINGS_URL ?? "http://localhost:8081";
const EMBEDDINGS_URL = `${EMBEDDINGS_BASE_URL}/v1/embeddings`;
const EMBEDDINGS_MODEL = process.env.EMBEDDINGS_MODEL ?? "qwen3-emb-4b";

// Token-budget-aware batching: keep each request under 6000 estimated tokens
// and cap at 64 items per batch regardless of token count.
const TOKEN_BUDGET_PER_REQUEST = 6000;
const MAX_ITEMS_PER_BATCH = 64;

// Extended timeouts to survive qwen3-emb-4b cold start (20 minutes).
const HEADERS_TIMEOUT = Number.parseInt(
  process.env.EMBEDDING_HEADERS_TIMEOUT_MS || "1200000",
  10,
);
const BODY_TIMEOUT = Number.parseInt(
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
 * qwen-stack embeddings service in token-budget-aware batched requests.
 *
 * @param {string[]} texts - Text strings to embed.
 * @returns {Promise<number[][]>} Array of embedding vectors, one per input text, each 2560 dimensions.
 * @throws if the HTTP response is not ok — error message includes status code
 *         and the response body.
 */
export async function embedTextBatch(texts) {
  const vectors = [];

  let i = 0;
  while (i < texts.length) {
    // Build a batch: add items while we're under the token budget and item cap
    const batch = [texts[i]];
    let batchTokens = estimateTokenCount(texts[i]);
    let j = i + 1;

    while (
      j < texts.length &&
      batch.length < MAX_ITEMS_PER_BATCH &&
      batchTokens + estimateTokenCount(texts[j]) <= TOKEN_BUDGET_PER_REQUEST
    ) {
      batchTokens += estimateTokenCount(texts[j]);
      batch.push(texts[j]);
      j++;
    }

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

    // Advance past the batch we just sent
    i = j;
  }

  return vectors;
}
