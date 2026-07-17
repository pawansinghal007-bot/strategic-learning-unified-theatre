import { createHash } from "node:crypto";

const CHUNK_MAX_CHARS = 3000;
const CHUNK_OVERLAP_CHARS = 300;

function makeChunkId(docId, index) {
  return `${docId}:chunk:${index}`;
}

function hashText(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function splitIntoWindows(text, maxChars, overlap) {
  const str = String(text || "");
  const windows = [];
  const step = Math.max(1, maxChars - overlap);
  let start = 0;

  while (start < str.length) {
    const slice = str.slice(start, start + maxChars);
    /* v8 ignore next 1 */
    if (slice.length === 0) break;
    windows.push(slice);
    if (start + maxChars >= str.length) break;
    start += step;
  }

  return windows;
}

export function chunkDocument(doc) {
  const windows = splitIntoWindows(
    doc.rawText,
    CHUNK_MAX_CHARS,
    CHUNK_OVERLAP_CHARS,
  );
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
    importance: 1,
    hash: hashText(text),
    createdAt: now,
    denseVector: [],
  }));
}
