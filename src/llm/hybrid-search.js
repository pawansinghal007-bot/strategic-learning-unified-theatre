import { logger } from "../shared/logging/logger.js";
import { embedTextBatch } from "../knowledge/ingest/embedder.js";
import { searchChunks as vectorSearchChunks } from "./qdrant-client.js";
import { searchLexicalChunks } from "./lexical-index.js";

const DEFAULT_RRF_K = Number(process.env.HYBRID_RRF_K ?? 60);
const DEFAULT_HYBRID_TOP_K = Number(process.env.HYBRID_TOP_K ?? 6);

function rrfScore(rank, k) {
  return 1 / (k + rank);
}

function buildRankMap(results) {
  return results.reduce((map, result, index) => {
    map.set(result.id, index + 1);
    return map;
  }, new Map());
}

export function fuseHybridResults(vectorHits, lexicalHits, options = {}) {
  const k = Number(options.rrfK ?? DEFAULT_RRF_K);
  const vectorRank = buildRankMap(vectorHits);
  const lexicalRank = buildRankMap(lexicalHits);
  const allIds = new Set([...vectorRank.keys(), ...lexicalRank.keys()]);

  const fused = Array.from(allIds).map((id) => {
    const vectorResult = vectorHits.find((hit) => hit.id === id);
    const lexicalResult = lexicalHits.find((hit) => hit.id === id);

    const pathValue = vectorResult?.path ?? lexicalResult?.path ?? "";
    const sourceValue =
      vectorResult?.source ?? lexicalResult?.source ?? pathValue ?? "";

    return {
      id,
      path: pathValue,
      source: sourceValue,
      content: vectorResult?.content ?? lexicalResult?.content ?? "",
      section: vectorResult?.section ?? lexicalResult?.section ?? "",
      feature_area:
        vectorResult?.feature_area ?? lexicalResult?.feature_area ?? "",
      sprint: vectorResult?.sprint ?? lexicalResult?.sprint ?? 0,
      source_type:
        vectorResult?.source_type ?? lexicalResult?.source_type ?? "",
      score:
        (rrfScore(vectorRank.get(id) ?? Infinity, k) +
          rrfScore(lexicalRank.get(id) ?? Infinity, k)) /
        2,
      vectorRank: vectorRank.get(id) ?? null,
      lexicalRank: lexicalRank.get(id) ?? null,
    };
  });

  return fused.sort((a, b) => b.score - a.score);
}

export async function hybridSearchChunks(
  query,
  limit = DEFAULT_HYBRID_TOP_K,
  filters = {},
  options = {},
) {
  const startMs = performance.now();
  const embedStart = performance.now();
  const [vector] = await embedTextBatch([query]);
  const embedDurationMs = Number((performance.now() - embedStart).toFixed(3));

  const scoreThreshold =
    typeof options.scoreThreshold === "number" ? options.scoreThreshold : 0.4;

  const vectorSearchStart = performance.now();
  const vectorHits = await vectorSearchChunks(
    vector,
    limit,
    scoreThreshold,
    filters,
  );
  const vectorSearchDurationMs = Number(
    (performance.now() - vectorSearchStart).toFixed(3),
  );

  const lexicalSearchStart = performance.now();
  const lexicalHits = await searchLexicalChunks(query, limit, filters);
  const lexicalSearchDurationMs = Number(
    (performance.now() - lexicalSearchStart).toFixed(3),
  );

  const fusionStart = performance.now();
  const fused = fuseHybridResults(vectorHits, lexicalHits, options);
  const fusionDurationMs = Number((performance.now() - fusionStart).toFixed(3));

  const totalDurationMs = Number((performance.now() - startMs).toFixed(3));

  logger.info("retrieval.hybrid-search", {
    query,
    limit,
    scoreThreshold,
    filterCount: Object.keys(filters ?? {}).length,
    embeddingDurationMs: embedDurationMs,
    vectorSearchDurationMs,
    lexicalSearchDurationMs,
    fusionDurationMs,
    totalDurationMs,
    vectorHits: vectorHits.length,
    lexicalHits: lexicalHits.length,
    fused: fused.length,
  });

  return fused.slice(0, limit);
}
