import { countTokens, safeChunkHash } from "./tokenizer.js";
import { dedupeRagChunks } from "../../knowledge/rag-dedup.js";
import { logger } from "../logging/logger.js";

const DEFAULT_MAX_CONTEXT_TOKENS = Number(
  process.env.MAX_CONTEXT_TOKENS ?? 1600,
);
const DEFAULT_CONTEXT_HEADROOM_TOKENS = Number(
  process.env.CONTEXT_HEADROOM_TOKENS ?? 400,
);

function normalizeChunk(chunk) {
  return {
    ...chunk,
    text: String(chunk.text ?? chunk.content ?? "").trim(),
    score: typeof chunk.score === "number" ? chunk.score : 0,
    chunk_hash: safeChunkHash(chunk),
  };
}

export async function assembleContextFromChunks(chunks, options = {}) {
  const maxContextTokens =
    typeof options.maxContextTokens === "number"
      ? options.maxContextTokens
      : DEFAULT_MAX_CONTEXT_TOKENS;
  const headroomTokens =
    typeof options.headroomTokens === "number"
      ? options.headroomTokens
      : DEFAULT_CONTEXT_HEADROOM_TOKENS;
  const systemTokens =
    typeof options.systemTokens === "number" ? options.systemTokens : 0;
  const userQueryTokens =
    typeof options.userQueryTokens === "number" ? options.userQueryTokens : 0;
  const responseTokens =
    typeof options.responseTokens === "number" ? options.responseTokens : 512;

  const budget = Math.max(
    0,
    maxContextTokens -
      headroomTokens -
      systemTokens -
      userQueryTokens -
      responseTokens,
  );

  const normalized = chunks.map(normalizeChunk);
  const deduped = dedupeRagChunks(normalized, { maxChunks: normalized.length });

  const scored = [...deduped].sort((a, b) => b.score - a.score);

  let accumulatedTokens = 0;
  const selected = [];

  for (const chunk of scored) {
    const tokenCount = await countTokens(chunk.text);
    if (tokenCount > budget) {
      continue;
    }
    if (accumulatedTokens + tokenCount > budget) {
      continue;
    }
    accumulatedTokens += tokenCount;
    selected.push({ ...chunk, tokens: tokenCount });
  }

  if (selected.length === 0) {
    const warning =
      budget <= 0
        ? "Configured prompt budget is too small for retrieval context."
        : "No retrieved chunks fit within the available context budget.";

    logger.warn("retrieval.context-budget", {
      reason: warning,
      budget,
      maxContextTokens,
      headroomTokens,
    });

    return {
      content: "",
      selected: [],
      tokenCount: 0,
      budget,
      maxContextTokens,
      headroomTokens,
      warning,
    };
  }

  const content = selected
    .map((chunk, index) => {
      const metadata = [
        chunk.sprint ? `sprint=${chunk.sprint}` : null,
        chunk.feature_area ? `area=${chunk.feature_area}` : null,
        chunk.source_type ? `source=${chunk.source_type}` : null,
        chunk.section ? `section=${chunk.section}` : null,
        chunk.path ? `path=${chunk.path}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return `### Result ${index + 1} (score: ${chunk.score.toFixed(3)})${
        metadata ? `\n${metadata}` : ""
      }\n${chunk.text}`;
    })
    .join("\n\n");

  return {
    content,
    selected,
    tokenCount: accumulatedTokens,
    budget,
    maxContextTokens,
    headroomTokens,
  };
}
