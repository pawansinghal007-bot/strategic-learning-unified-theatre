import type { SourceType } from "./documents.js";
import { isSourceType } from "./documents.js";

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

/**
 * Runtime type guard for KnowledgeChunk. Checks required fields only;
 * optional fields are not validated beyond their presence/absence.
 */
export function isKnowledgeChunk(value: unknown): value is KnowledgeChunk {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  return (
    typeof v.chunkId === "string" &&
    typeof v.docId === "string" &&
    isSourceType(v.sourceType) &&
    typeof v.text === "string" &&
    typeof v.importance === "number" &&
    typeof v.hash === "string" &&
    typeof v.createdAt === "number" &&
    Array.isArray(v.denseVector) &&
    v.denseVector.every((n) => typeof n === "number")
  );
}
