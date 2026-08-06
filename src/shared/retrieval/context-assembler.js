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
  const rawText = String(chunk.text ?? chunk.content ?? "").trim();
  const parentText = String(chunk.parentText ?? "").trim();
  const parentExpansionEnabled =
    process.env.PARENT_EXPANSION_ENABLED === "true";
  const parentTextCap = Number(process.env.PARENT_EXPANSION_MAX_CHARS ?? 8192);

  const parentExpansionApplied =
    parentExpansionEnabled && parentText && parentText.length <= parentTextCap;

  const text = parentExpansionApplied ? parentText : rawText;

  // When parent expansion is active, the chunk's text has been replaced with
  // parentText.  Multiple child chunks sharing the same parentId now contain
  // identical text.  dedupeRagChunks() computes its hash from chunk_id + text,
  // so we must key both chunk_hash and chunk_id off the parentId — otherwise
  // every child gets a distinct identity despite identical content, and dedup
  // never merges them, causing the same parent to appear multiple times in the
  // assembled context under separate "### Result" headers.
  const dedupId =
    parentExpansionApplied && chunk.parentId
      ? `parent:${chunk.parentId}`
      : undefined;

  return {
    ...chunk,
    text,
    score: typeof chunk.score === "number" ? chunk.score : 0,
    chunk_hash: dedupId ?? safeChunkHash(chunk),
    // Override chunk_id so hashRagChunk() (which keys on chunk_id + text)
    // produces the same rag_hash for all children of the same parent.
    ...(dedupId ? { chunk_id: dedupId } : {}),
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
      candidateChunks: chunks.length,
      selectedChunks: selected.length,
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

  logger.info("retrieval.context-budget", {
    candidateChunks: chunks.length,
    selectedChunks: selected.length,
    tokenCount: accumulatedTokens,
    budget,
    maxContextTokens,
    headroomTokens,
  });

  return {
    content,
    selected,
    tokenCount: accumulatedTokens,
    budget,
    maxContextTokens,
    headroomTokens,
  };
}
