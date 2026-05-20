import crypto from "node:crypto";

export const EMBEDDING_DIMENSIONS = 768;

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hashToken(token) {
  const digest = crypto.createHash("sha256").update(token).digest();
  return digest.readUInt32BE(0);
}

function normalizeVector(vector) {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return vector.map((value) => value / norm);
}

function fallbackEmbedding(text) {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = normalizeText(text).split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const hash = hashToken(token);
    const idx = hash % EMBEDDING_DIMENSIONS;
    vector[idx] += (hash & 1) === 0 ? 1 : -1;
  }
  return normalizeVector(vector);
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    an += a[i] * a[i];
    bn += b[i] * b[i];
  }
  if (!an || !bn) return 0;
  return dot / (Math.sqrt(an) * Math.sqrt(bn));
}

export class EmbeddingProvider {
  constructor({ dimensions = EMBEDDING_DIMENSIONS } = {}) {
    this.dimensions = dimensions;
    this.backend = "deterministic-hash";
    this.session = null;
  }

  async initialize() {
    // In tests we set VSCODE_ROTATOR_MOCK_LLM to avoid loading heavy native
    // modules like ONNX runtime. Respect that guard to prevent worker OOMs.
    if (process.env.VSCODE_ROTATOR_MOCK_LLM) {
      this.backend = "deterministic-hash";
      return this;
    }

    try {
      await import("onnxruntime-node");
      this.backend = "onnxruntime-node";
    } catch {
      this.backend = "deterministic-hash";
    }
    return this;
  }

  async embed(text) {
    return fallbackEmbedding(text);
  }

  async embedMany(texts) {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}

export function encodeEmbedding(vector) {
  return Buffer.from(new Float32Array(vector).buffer).toString("base64");
}

export function decodeEmbedding(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  const buffer = Buffer.from(String(value), "base64");
  const floats = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  return Array.from(floats);
}
