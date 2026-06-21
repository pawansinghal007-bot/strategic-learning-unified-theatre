import crypto from "node:crypto";

export function hashRagChunk(chunk = {}) {
  const stableText = [
    chunk.chunk_id ?? chunk.chunkId ?? "",
    chunk.doc_id ?? chunk.docId ?? "",
    chunk.filename ?? chunk.path ?? "",
    chunk.section ?? "",
    chunk.content ?? chunk.text ?? "",
  ].join("\n");

  return crypto.createHash("sha256").update(stableText).digest("hex");
}

export function dedupeRagChunks(chunks = [], options = {}) {
  const maxChunks = options.maxChunks ?? 10;
  const seen = new Set(options.previousHashes ?? []);
  const unique = [];

  for (const chunk of chunks) {
    const ragHash = hashRagChunk(chunk);
    if (seen.has(ragHash)) continue;
    seen.add(ragHash);
    unique.push({ ...chunk, rag_hash: ragHash });
    if (unique.length >= maxChunks) break;
  }

  return unique;
}
