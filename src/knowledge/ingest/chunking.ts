import { createHash } from "crypto";
import type { KnowledgeDocument } from "../schema/documents.js";
import type { KnowledgeChunk } from "../schema/metadata.js";

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;

function makeChunkId(docId: string, index: number): string {
  return `${docId}:chunk:${index}`;
}

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function splitIntoWindows(
  text: string,
  size: number,
  overlap: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const windows: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + size, words.length);
    windows.push(words.slice(start, end).join(" "));
    if (end === words.length) break;
    start += size - overlap;
  }

  return windows;
}

export function chunkDocument(doc: KnowledgeDocument): KnowledgeChunk[] {
  const windows = splitIntoWindows(doc.rawText, CHUNK_SIZE, CHUNK_OVERLAP);
  const now = Date.now();

  return windows.map((text, index) => ({
    chunkId: makeChunkId(doc.id, index),
    docId: doc.id,
    sourceType: doc.sourceType,
    text,
    sprint: doc.sprint,
    module: doc.module,
    featureArea: doc.featureArea,
    version: doc.version,
    path: doc.path,
    section: undefined,
    importance: 1.0,
    hash: hashText(text),
    createdAt: now,
    denseVector: [],
  }));
}
