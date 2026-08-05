/**
 * embedder.js — Batch text embedding via the live qwen-stack embeddings service.
 *
 * Calls POST /v1/embeddings on the OpenAI-compatible endpoint (qwen3-emb-4b,
 * 2560 dimensions).  Uses token-budget-aware batching to prevent exceeding
 * the model's context window.
 */

import { Agent } from "undici";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { estimateTokenCount } from "../../llm/document-ingester.js";
import { embeddingCache } from "./embedding-cache.js";
import { logger } from "../../shared/logging/logger.js";

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

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function textToCacheKey(text) {
  return createHash("sha256").update(normalizeText(text), "utf8").digest("hex");
}

async function fetchEmbeddings(batch) {
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

  return batchData.map((item) => {
    const embedding = item.embedding;
    if (!Array.isArray(embedding)) {
      throw new TypeError(
        "embedTextBatch: unexpected response shape — missing data[].embedding",
      );
    }
    return embedding;
  });
}

async function embedWithCache(items, keyFn, textFn) {
  await embeddingCache.init();

  const vectors = new Array(items.length);
  const missingGroups = new Map();
  const keys = items.map(keyFn);

  for (let i = 0; i < keys.length; i += 1) {
    const cached = embeddingCache.getVector(keys[i]);
    if (cached) {
      vectors[i] = cached;
      continue;
    }

    const key = keys[i];
    if (!missingGroups.has(key)) {
      missingGroups.set(key, []);
    }
    missingGroups.get(key).push(i);
  }

  const beforeStats = embeddingCache.getStats();
  const beforeStatsStart = performance.now();
  let serviceCallCount = 0;

  if (missingGroups.size > 0) {
    const missingKeys = [...missingGroups.keys()];
    const missingTexts = missingKeys.map((key) => {
      const index = missingGroups.get(key)[0];
      return textFn(items[index]);
    });

    const missingResult = await embedTextBatchFromService(missingTexts);
    const missingVectors = missingResult.vectors;
    serviceCallCount = missingResult.serviceCallCount;
    for (let i = 0; i < missingKeys.length; i += 1) {
      const key = missingKeys[i];
      const vector = missingVectors[i];
      for (const index of missingGroups.get(key)) {
        vectors[index] = vector;
      }
      embeddingCache.setVector(key, vector);
    }
  }

  const afterStats = embeddingCache.getStats();
  logger.info("retrieval.embedding", {
    inputCount: items.length,
    cacheHits: afterStats.hits - beforeStats.hits,
    cacheMisses: afterStats.misses - beforeStats.misses,
    cacheSize: afterStats.size,
    serviceCallCount,
    durationMs: Number((performance.now() - beforeStatsStart).toFixed(3)),
  });

  return vectors;
}

export async function embedTextBatch(texts) {
  return embedWithCache(texts, textToCacheKey, (text) => text);
}

export async function embedChunksWithCache(chunks) {
  return embedWithCache(
    chunks,
    (chunk) => chunk.hash || textToCacheKey(chunk.text),
    (chunk) => chunk.text,
  );
}

export function getEmbeddingCacheStats() {
  return embeddingCache.getStats();
}

async function embedTextBatchFromService(texts) {
  const vectors = [];
  let i = 0;
  let serviceCallCount = 0;

  while (i < texts.length) {
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
      j += 1;
    }

    serviceCallCount += 1;
    const batchVectors = await fetchEmbeddings(batch);
    vectors.push(...batchVectors);
    i = j;
  }

  return { vectors, serviceCallCount };
}
