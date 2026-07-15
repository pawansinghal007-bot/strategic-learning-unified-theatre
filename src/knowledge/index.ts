export { ingestSprintHistory } from "./ingest/ingest-sprint-history.js";
export { chunkDocument } from "./ingest/chunking.js";
export { embedTextBatch } from "./ingest/embedder.js";
export {
  ensureKnowledgeCollection,
  upsertChunks,
  searchChunks,
} from "../llm/qdrant-client.js";
export type { KnowledgeDocument, SourceType } from "./schema/documents.js";
export type { KnowledgeChunk } from "./schema/metadata.js";

export function buildKnowledgePromptBlock(
  hits: Array<{
    chunk_id: string;
    doc_id: string;
    source_type: string;
    sprint: number;
    feature_area: string;
    path: string;
    section: string;
    importance: number;
    score: number;
    text?: string;
  }>,
  minScore = 0.4,
  maxChunks = 6,
): string {
  return hits
    .filter((h) => (h.score ?? 0) >= minScore)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, maxChunks)
    .map(
      (h, i) =>
        `[${i + 1}] sprint=${h.sprint} area=${h.feature_area} ` +
        `source=${h.source_type} path=${h.path} section=${h.section}\n` +
        `${h.text ?? ""}`.trim(),
    )
    .join("\n\n---\n\n");
}
