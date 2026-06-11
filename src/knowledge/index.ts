export { ingestSprintHistory } from "./ingest/ingest-sprint-history.js";
export { chunkDocument } from "./ingest/chunking.js";
export { embedTextBatch } from "./ingest/embedder.js";
export {
  getMilvusClient,
  ensureKnowledgeCollection,
  KNOWLEDGE_COLLECTION,
} from "./ingest/milvus-client.js";
export type { KnowledgeDocument, SourceType } from "./schema/documents.js";
export type { KnowledgeChunk } from "./schema/metadata.js";
