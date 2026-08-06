import { embedTextBatch } from "../knowledge/ingest/embedder.js";
import { logger } from "../shared/logging/logger.js";

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Rerank candidates using the existing embeddings service.
 *
 * Options:
 *  - topK: final number to return
 *  - poolSize: number of candidates to request from hybrid search
 *  - alpha: weight for original score vs embedding similarity (0..1)
 */
export async function rerankCandidates(query, candidates, options = {}) {
  const startMs = performance.now();
  const enabled = process.env.RERANK_ENABLED === "true";
  if (!enabled) return candidates.slice(0, options.topK ?? candidates.length);

  const poolSize = Number(
    process.env.RERANK_CANDIDATE_POOL ?? options.poolSize ?? 30,
  );
  const topK = Number(process.env.RERANK_TOP_K ?? options.topK ?? 5);
  const alpha = Number(process.env.RERANK_ALPHA ?? options.alpha ?? 0.5);
  const timeoutMs = Number(process.env.RERANK_TIMEOUT_MS ?? 5000);

  const pool = candidates.slice(0, poolSize);
  const texts = pool.map((c) => String(c.content ?? c.text ?? ""));

  const embedStart = performance.now();
  const embedPromise = embedTextBatch([query, ...texts]);

  let vectors;
  try {
    vectors = await Promise.race([
      embedPromise,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("rerank: embed timeout")), timeoutMs),
      ),
    ]);
  } catch (err) {
    const durationMs = Number((performance.now() - startMs).toFixed(3));
    logger.warn("retrieval.rerank_failed", {
      query,
      poolSize: pool.length,
      topK,
      timeoutMs,
      reason: String(err),
      durationMs,
    });
    return candidates.slice(0, topK);
  }

  const embedDurationMs = Number((performance.now() - embedStart).toFixed(3));
  const queryVec = vectors[0];
  const candidateVecs = vectors.slice(1);

  const scored = pool.map((item, idx) => {
    const sim = cosine(queryVec, candidateVecs[idx] || []);
    const orig = typeof item.score === "number" ? item.score : 0;
    const combined = alpha * orig + (1 - alpha) * sim;
    return { item, sim, orig, combined };
  });

  scored.sort((a, b) => b.combined - a.combined);

  const durationMs = Number((performance.now() - startMs).toFixed(3));
  logger.info("retrieval.rerank", {
    query,
    poolSize: pool.length,
    topK,
    alpha,
    embedDurationMs,
    returned: Math.min(topK, scored.length),
    durationMs,
  });

  return scored.slice(0, topK).map((s) => ({ ...s.item, score: s.combined }));
}

export default { rerankCandidates };
