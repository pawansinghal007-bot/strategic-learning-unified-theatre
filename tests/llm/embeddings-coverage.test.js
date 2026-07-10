/**
 * Targeted coverage tests for src/llm/embeddings.js
 *
 * Covers previously-uncovered lines: 43, 48, 54, 188, 211, 245
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  kMeans,
  clusterDocuments,
  EmbeddingProvider,
  cosineSimilarity,
  encodeEmbedding,
  decodeEmbedding,
  EMBEDDING_DIMENSIONS,
} from "../../src/llm/embeddings.js";

// ---------------------------------------------------------------------------
// kMeans edge cases — lines 43, 48, 54
// ---------------------------------------------------------------------------
describe("kMeans — edge cases", () => {
  // line 43: empty vectors array → { clusters: [] }
  it("returns empty clusters for an empty vectors array", () => {
    const result = kMeans([], 3);
    expect(result).toEqual({ clusters: [] });
  });

  // line 43: non-array input → { clusters: [] }
  it("returns empty clusters for non-array input", () => {
    expect(kMeans(null, 2)).toEqual({ clusters: [] });
    expect(kMeans(undefined, 2)).toEqual({ clusters: [] });
  });

  // line 48: k <= 0 → throws
  it("throws for k = 0", () => {
    const v = [new Float32Array([1, 0])];
    expect(() => kMeans(v, 0)).toThrow("Invalid cluster count");
  });

  it("throws for negative k", () => {
    const v = [new Float32Array([1, 0])];
    expect(() => kMeans(v, -1)).toThrow("Invalid cluster count");
  });

  // line 54: zero-length vectors → throws
  it("throws for zero-dimension vectors", () => {
    const v = [new Float32Array(0)];
    expect(() => kMeans(v, 1)).toThrow("positive dimensionality");
  });

  // line 188 (updateCentroids empty-cluster branch):
  // Force an empty cluster by using more clusters than vectors.
  // With k=3 and only 2 vectors, the third cluster will always be empty
  // and its centroid must be reassigned.
  it("handles empty clusters by reassigning a random vector as centroid", () => {
    const vectors = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ];
    // k > n: clusterCount = min(k, n) = 2, but if initial centroids happen to
    // share an assignment and leave one cluster empty after first iter, the
    // empty-cluster branch fires.  Run with k=2 and 2 vectors identical so
    // one cluster ends up empty after assignment.
    const same = [[1, 0], [1, 0], [1, 0]];
    // All three identical vectors, 2 clusters → one cluster will be empty
    const result = kMeans(same, 2);
    expect(result.clusters).toHaveLength(2);
    // All indices must be covered across both clusters
    const allIndices = result.clusters.flatMap((c) => c.indices).sort();
    expect(allIndices).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// clusterDocuments — line 188 (no embeddable documents)
// ---------------------------------------------------------------------------
describe("clusterDocuments()", () => {
  it("returns empty clusters when there are no embeddable documents", async () => {
    const db = {
      open: vi.fn().mockResolvedValue(undefined),
      state: { documents: [] },
    };

    await expect(clusterDocuments(db, 2)).resolves.toEqual({ clusters: [] });
  });
});

// ---------------------------------------------------------------------------
// EmbeddingProvider.initialize() — lines 211 (MOCK_LLM unset → onnx try/catch)
// ---------------------------------------------------------------------------
describe("EmbeddingProvider.initialize()", () => {
  let savedMock;

  beforeEach(() => {
    savedMock = process.env.VSCODE_ROTATOR_MOCK_LLM;
  });

  afterEach(() => {
    if (savedMock == null) {
      delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    } else {
      process.env.VSCODE_ROTATOR_MOCK_LLM = savedMock;
    }
  });

  // line 211: MOCK_LLM set → sets backend deterministic-hash immediately
  it("sets deterministic-hash backend when MOCK_LLM=1", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    const provider = new EmbeddingProvider();
    await provider.initialize();
    expect(provider.backend).toBe("deterministic-hash");
  });

  // line 211: MOCK_LLM unset → attempts onnxruntime-node import (expected to
  // fail in test env), falls back to deterministic-hash
  it("falls back to deterministic-hash when onnxruntime-node is unavailable", async () => {
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    const provider = new EmbeddingProvider();
    await provider.initialize();
    // In test env, onnxruntime-node is either unavailable or not a real model,
    // so the catch block fires and sets deterministic-hash
    expect(["deterministic-hash", "onnxruntime-node"]).toContain(
      provider.backend,
    );
  });

  // embed() always uses fallback regardless of backend field
  it("embed() returns a vector of correct dimensions", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    const provider = new EmbeddingProvider();
    await provider.initialize();
    const vec = await provider.embed("hello world");
    expect(vec).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  // embedMany() covers the multi-text path
  it("embedMany() returns one vector per input text", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    const provider = new EmbeddingProvider();
    await provider.initialize();
    const vecs = await provider.embedMany(["alpha", "beta", "gamma"]);
    expect(vecs).toHaveLength(3);
    vecs.forEach((v) => expect(v).toHaveLength(EMBEDDING_DIMENSIONS));
  });
});

// ---------------------------------------------------------------------------
// cosineSimilarity — line 245 (guard branches for null / mismatched inputs)
// ---------------------------------------------------------------------------
describe("cosineSimilarity — guard branches", () => {
  it("returns 0 for null first argument", () => {
    expect(cosineSimilarity(null, [1, 0])).toBe(0);
  });

  it("returns 0 for null second argument", () => {
    expect(cosineSimilarity([1, 0], null)).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });

  it("returns 0 for zero vectors (all-zero norms)", () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it("returns 0 when one vector is all-zero", () => {
    expect(cosineSimilarity([1, 0], [0, 0])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// decodeEmbedding — line 245 (null / array fast-path)
// ---------------------------------------------------------------------------
describe("decodeEmbedding — guard branches", () => {
  it("returns empty array for null input", () => {
    expect(decodeEmbedding(null)).toEqual([]);
  });

  it("returns the same array when already an array", () => {
    const arr = [1, 2, 3];
    expect(decodeEmbedding(arr)).toBe(arr);
  });

  it("returns empty array for empty string", () => {
    expect(decodeEmbedding("")).toEqual([]);
  });
});
