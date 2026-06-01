import crypto from "node:crypto";

export const EMBEDDING_DIMENSIONS = 768;

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
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

function toFloat32Array(vector) {
  if (vector instanceof Float32Array) return vector;
  if (!Array.isArray(vector)) return new Float32Array(0);
  return new Float32Array(vector);
}

export function kMeans(vectors, k, maxIter = 50) {
  if (!Array.isArray(vectors) || vectors.length === 0) {
    return { clusters: [] };
  }

  const n = vectors.length;
  if (k <= 0) {
    throw new Error(`Invalid cluster count: ${k}`);
  }

  const floatVectors = vectors.map(toFloat32Array);
  const dim = floatVectors[0].length;
  if (dim === 0) {
    throw new Error("Vectors must have positive dimensionality.");
  }

  const centroidIndices = chooseInitialCentroidIndices(n, k);
  let centroids = centroidIndices.map((index) => floatVectors[index].slice());
  let assignments = new Array(n).fill(-1);
  let changed = true;

  for (let iter = 0; iter < maxIter && changed; iter += 1) {
    const nextAssignments = assignClusters(floatVectors, centroids);
    changed = !areAssignmentsEqual(assignments, nextAssignments);
    assignments = nextAssignments;

    const { sums, counts } = accumulateClusterSums(
      assignments,
      floatVectors,
      centroids.length,
      dim,
    );
    centroids = updateCentroids(
      sums,
      counts,
      floatVectors,
      centroidIndices,
      dim,
    );
  }

  return buildClusters(assignments, centroidIndices, k, n);
}

function chooseInitialCentroidIndices(n, k) {
  const chosen = new Set();
  while (chosen.size < Math.min(k, n)) {
    // Use cryptographically-strong random integers for centroid selection
    chosen.add(crypto.randomInt(0, n));
  }
  return Array.from(chosen);
}

function assignClusters(floatVectors, centroids) {
  const assignments = new Array(floatVectors.length);
  for (let i = 0; i < floatVectors.length; i += 1) {
    assignments[i] = findNearestCentroid(floatVectors[i], centroids);
  }
  return assignments;
}

function findNearestCentroid(vector, centroids) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let j = 0; j < centroids.length; j += 1) {
    const distance = 1 - cosineSimilarity(vector, centroids[j]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = j;
    }
  }
  return bestIndex;
}

function areAssignmentsEqual(current, next) {
  if (current.length !== next.length) return false;
  for (let i = 0; i < current.length; i += 1) {
    if (current[i] !== next[i]) return false;
  }
  return true;
}

function accumulateClusterSums(assignments, floatVectors, clusterCount, dim) {
  const sums = Array.from(
    { length: clusterCount },
    () => new Float32Array(dim),
  );
  const counts = new Array(clusterCount).fill(0);

  for (let i = 0; i < floatVectors.length; i += 1) {
    const clusterIndex = assignments[i];
    const vector = floatVectors[i];
    const sum = sums[clusterIndex];
    for (let d = 0; d < dim; d += 1) {
      sum[d] += vector[d];
    }
    counts[clusterIndex] += 1;
  }

  return { sums, counts };
}

function updateCentroids(sums, counts, floatVectors, centroidIndices, dim) {
  return sums.map((sum, j) => {
    if (counts[j] === 0) {
      // Reassign empty cluster using a cryptographically-strong random index
      const randomIndex = crypto.randomInt(0, floatVectors.length);
      centroidIndices[j] = randomIndex;
      return floatVectors[randomIndex].slice();
    }

    const centroid = new Float32Array(dim);
    for (let d = 0; d < dim; d += 1) {
      centroid[d] = sum[d] / counts[j];
    }
    return normalizeVector(Array.from(centroid));
  });
}

function buildClusters(assignments, centroidIndices, k, n) {
  const clusterCount = Math.min(k, n);
  const clusters = Array.from({ length: clusterCount }, (_, index) => ({
    centroidIndex: centroidIndices[index],
    indices: [],
  }));

  for (let i = 0; i < n; i += 1) {
    const clusterIndex = Math.max(assignments[i], 0);
    clusters[clusterIndex].indices.push(i);
  }

  return { clusters };
}

export async function clusterDocuments(db, k) {
  if (!db) throw new Error("ExperienceDb instance is required.");
  await db.open();
  const documents = Array.isArray(db.state?.documents)
    ? db.state.documents
    : [];
  const docsWithEmbedding = documents
    .map((doc, index) => ({ doc, index }))
    .filter(({ doc }) => doc?.embedding);
  const vectorData = docsWithEmbedding.map(({ doc }) =>
    toFloat32Array(decodeEmbedding(doc.embedding)),
  );
  if (vectorData.length === 0) {
    return { clusters: [] };
  }
  const { clusters } = kMeans(vectorData, k);
  return clusters.map((cluster) => ({
    indices: cluster.indices,
    snippets: cluster.indices.slice(0, 3).map((vectorIndex) => {
      const source = docsWithEmbedding[vectorIndex]?.doc;
      const snippet = source?.content
        ? String(source.content).slice(0, 80).replaceAll(/\s+/g, " ").trim()
        : "";
      return snippet;
    }),
  }));
}

export function cosineSimilarity(a, b) {
  if (
    !a ||
    !b ||
    typeof a.length !== "number" ||
    typeof b.length !== "number" ||
    a.length !== b.length
  )
    return 0;
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = Number(a[i] ?? 0);
    const bi = Number(b[i] ?? 0);
    dot += ai * bi;
    an += ai * ai;
    bn += bi * bi;
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
  const floats = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 4,
  );
  return Array.from(floats);
}
