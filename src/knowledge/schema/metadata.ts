import type { SourceType } from "./documents.js";

export interface KnowledgeChunk {
  chunkId: string;
  docId: string;
  sourceType: SourceType;
  text: string;
  sprint?: number;
  module?: string;
  featureArea?: string;
  version?: string;
  path?: string;
  section?: string;
  importance: number;
  hash: string;
  createdAt: number;
  denseVector: number[];
}
