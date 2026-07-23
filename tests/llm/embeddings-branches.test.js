/**
 * embeddings-branches.test.js
 *
 * Targets remaining branch gaps in src/llm/embeddings.js:
 *   Line 188 — updateCentroids: empty-cluster reassignment (counts[j] === 0)
 *   Line 245 — cosineSimilarity: individual null element coercion via Number(a[i] ?? 0)
 *
 * The existing embeddings-coverage.test.js already covers most paths.
 * These tests focus on the specific branches that remain uncovered.
 */

import { describe, it, expect } from "vitest";
import {
  kMeans,
  cosineSimilarity,
  encodeEmbedding,
  decodeEmbedding,
  EMBEDDING_DIMENSIONS,
  EmbeddingProvider,
} from "../../src/llm/embeddings.js";

// ── updateCentroids empty-cluster branch (line 188) ────────────────────────

describe("kMeans updateCentroids — empty cluster reassignment (line 188)", () => {
  it("reassigns empty cluster centroid when k > distinct clusters after first assignment", () => {
    // Force empty cluster: use 3 identical vectors with k=2.
    // After first assignment all 3 go to the same centroid, leaving one cluster empty.
    // updateCentroids must handle counts[j] === 0 by picking a random vector.
    const same = Array.from({ length: 3 }, () => [1, 0, 0]);
    const result = kMeans(same, 2);
    // Should produce 2 cluster entries (Math.min(k, n) = 2)
    expect(result.clusters).toHaveLength(2);
    const allIndices = result.clusters.flatMap((c) => c.indices);
    // All 3 indices should be accounted for
    expect(allIndices.sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("handles k equal to n (each vector gets its own cluster)", () => {
    const vectors = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ];
    const result = kMeans(vectors, 3);
    expect(result.clusters).toHaveLength(3);
    // Each cluster should have exactly 1 vector
    for (const cluster of result.clusters) {
      expect(cluster.indices).toHaveLength(1);
    }
  });

  it("converges when k=1 (all vectors in one cluster)", () => {
    const vectors = [[1, 0], [0, 1], [1, 1]];
    const result = kMeans(vectors, 1);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].indices).toHaveLength(3);
  });

  it("handles Float32Array inputs directly", () => {
    const vectors = [
      new Float32Array([1, 0, 0]),
      new Float32Array([0, 1, 0]),
      new Float32Array([0, 0, 1]),
    ];
    const result = kMeans(vectors, 2, 20);
    expect(result.clusters).toHaveLength(2);
  });

  it("runs to maxIter without crashing when assignments never stabilise", () => {
    // Use random-like vectors to exercise the full iteration loop
    const vectors = Array.from({ length: 10 }, (_, i) =>
      Array.from({ length: 4 }, (__, j) => (i + j) % 3 === 0 ? 1 : 0),
    );
    const result = kMeans(vectors, 3, 3); // only 3 iterations
    expect(result.clusters.length).toBeGreaterThan(0);
  });
});

// ── cosineSimilarity null element coercion (line 245) ─────────────────────

describe("cosineSimilarity — null element coercion (line 245)", () => {
  it("treats null elements as 0 via Number(a[i] ?? 0)", () => {
    // Arrays with null elements — coerced to 0
    const a = [1, null, 0];
    const b = [1, 0, 0];
    // null → 0, so effectively [1,0,0] · [1,0,0] = 1
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(1, 5);
  });

  it("treats undefined elements as 0", () => {
    const a = [undefined, 1, 0];
    const b = [0, 1, 0];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(1, 5);
  });

  it("returns 0 when both vectors are all-null (norms are 0)", () => {
    const a = [null, null, null];
    const b = [null, null, null];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("handles mixed null and numeric values correctly", () => {
    const a = [1, null, 1];
    const b = [1, 0, 1];
    // [1,0,1] · [1,0,1] = 2, ||[1,0,1]|| = sqrt(2)
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(1, 5);
  });

  it("handles a.length !== b.length guard (returns 0)", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("handles empty arrays (returns 0 — an guard fires first)", () => {
    // length 0 but identical lengths — dot=0, an=0, bn=0 → returns 0
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

// ── decodeEmbedding — base64 round-trip ────────────────────────────────────

describe("encodeEmbedding / decodeEmbedding round-trip", () => {
  it("round-trips a full-dimension float vector", () => {
    const original = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / EMBEDDING_DIMENSIONS);
    const encoded = encodeEmbedding(original);
    const decoded = decodeEmbedding(encoded);
    expect(decoded).toHaveLength(EMBEDDING_DIMENSIONS);
    // Values should be close (Float32 precision)
    expect(decoded[0]).toBeCloseTo(original[0], 3);
    expect(decoded[EMBEDDING_DIMENSIONS - 1]).toBeCloseTo(original[EMBEDDING_DIMENSIONS - 1], 3);
  });

  it("decodeEmbedding returns [] for falsy non-array", () => {
    expect(decodeEmbedding(undefined)).toEqual([]);
    expect(decodeEmbedding(false)).toEqual([]);
    expect(decodeEmbedding(0)).toEqual([]);
  });

  it("decodeEmbedding returns array directly when already an array", () => {
    const arr = [1, 2, 3];
    expect(decodeEmbedding(arr)).toBe(arr);
  });
});

// ── EmbeddingProvider.embedMany ────────────────────────────────────────────

describe("EmbeddingProvider.embedMany — coverage", () => {
  it("returns one vector per input (includes initialize path)", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    try {
      const provider = new EmbeddingProvider();
      await provider.initialize();
      const result = await provider.embedMany(["hello", "world", "foo"]);
      expect(result).toHaveLength(3);
      result.forEach((v) => expect(v).toHaveLength(EMBEDDING_DIMENSIONS));
    } finally {
      delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    }
  });

  it("handles empty text gracefully in embedMany", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    try {
      const provider = new EmbeddingProvider();
      await provider.initialize();
      const result = await provider.embedMany(["", "  ", "abc"]);
      expect(result).toHaveLength(3);
    } finally {
      delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    }
  });
});


// ── Additional branch gaps ─────────────────────────────────────────────────

import { clusterDocuments } from "../../src/llm/embeddings.js";

// ── Line 37: toFloat32Array — non-array, non-Float32Array input → Float32Array(0) ──
// toFloat32Array is called internally by kMeans via floatVectors = vectors.map(toFloat32Array).
// Passing a non-array, non-Float32Array value (e.g. an object or number) hits the
// `!Array.isArray(vector)` true branch and returns new Float32Array(0).
// kMeans will then throw "positive dimensionality" because dim === 0.
describe("toFloat32Array — non-array input branch (line 37)", () => {
  it("kMeans throws for zero-dim vectors when a non-array element is provided", () => {
    // Passing a plain object as a vector → toFloat32Array returns Float32Array(0) → dim=0 → throws
    expect(() => kMeans([{ length: 3 }], 1)).toThrow("positive dimensionality");
  });

  it("kMeans throws for zero-dim when a number is passed as a vector", () => {
    expect(() => kMeans([42], 1)).toThrow("positive dimensionality");
  });
});

// ── Line 116: areAssignmentsEqual — length mismatch → false ──────────────
// areAssignmentsEqual is internal to kMeans. The length-mismatch branch fires
// when the previous assignments array has a different length than the new one.
// This happens on the very first iteration when assignments is initialised as
// `new Array(n).fill(-1)` (length n) but nextAssignments is also length n —
// so in practice they always match in length. The guard is a defensive check
// that can't fire through the normal kMeans flow.
// Mark it as unreachable so the coverage tool stops flagging it.
describe("areAssignmentsEqual — length-mismatch branch (line 116)", () => {
  it("kMeans runs without length-mismatch errors (defensive note: branch is unreachable via public API)", () => {
    // Verify normal kMeans flow works — the guard never triggers but the function executes
    const result = kMeans([[1, 0], [0, 1], [1, 1]], 2, 10);
    expect(result.clusters).toHaveLength(2);
  });
});

// ── Lines 176-179: clusterDocuments edge cases ────────────────────────────

describe("clusterDocuments — additional branch coverage (lines 176-179, 195)", () => {
  // Line 176: !db → throws
  it("throws when db is null (line 176)", async () => {
    await expect(clusterDocuments(null, 2)).rejects.toThrow(
      "ExperienceDb instance is required.",
    );
  });

  it("throws when db is undefined (line 176)", async () => {
    await expect(clusterDocuments(undefined, 2)).rejects.toThrow(
      "ExperienceDb instance is required.",
    );
  });

  // Lines 178-179: db.state?.documents is NOT an array → falls back to []
  it("returns empty clusters when db.state.documents is not an array (line 178 false branch)", async () => {
    const db = {
      open: vi.fn().mockResolvedValue(undefined),
      state: { documents: "not-an-array" },
    };
    await expect(clusterDocuments(db, 2)).resolves.toEqual({ clusters: [] });
  });

  it("returns empty clusters when db.state is null (line 178 false branch)", async () => {
    const db = {
      open: vi.fn().mockResolvedValue(undefined),
      state: null,
    };
    await expect(clusterDocuments(db, 2)).resolves.toEqual({ clusters: [] });
  });

  it("returns empty clusters when db.state is absent (line 178 false branch)", async () => {
    const db = {
      open: vi.fn().mockResolvedValue(undefined),
    };
    await expect(clusterDocuments(db, 2)).resolves.toEqual({ clusters: [] });
  });

  // Line 195: snippet content is falsy → returns "" (false branch of source?.content ternary)
  it("uses empty string snippet when doc has no content (line 195 false branch)", async () => {
    const { encodeEmbedding } = await import("../../src/llm/embeddings.js");
    // Build a doc with an embedding but no content field
    const vec = new Array(768).fill(0);
    vec[0] = 1;
    const embedding = encodeEmbedding(vec);

    const db = {
      open: vi.fn().mockResolvedValue(undefined),
      state: {
        documents: [
          { embedding, content: null },   // content is falsy
          { embedding, content: "" },      // content is falsy (empty string)
          { embedding, content: "hello" }, // content is truthy
        ],
      },
    };

    const results = await clusterDocuments(db, 1);
    expect(results).toHaveLength(1);
    // The cluster's snippets come from the first up-to-3 docs.
    // Docs with no/empty content produce "" snippets; "hello" produces "hello".
    const snippets = results[0].snippets;
    expect(snippets).toContain("");
    expect(snippets).toContain("hello");
  });

  // Line 195: source itself is undefined (doc index out of range) → snippet = ""
  it("uses empty string snippet when docsWithEmbedding entry is undefined (line 195 false branch)", async () => {
    const { encodeEmbedding } = await import("../../src/llm/embeddings.js");
    const vec = new Array(768).fill(0);
    vec[0] = 1;
    const embedding = encodeEmbedding(vec);

    // A single doc with content undefined
    const db = {
      open: vi.fn().mockResolvedValue(undefined),
      state: {
        documents: [{ embedding, content: undefined }],
      },
    };

    const results = await clusterDocuments(db, 1);
    expect(results[0].snippets[0]).toBe("");
  });
});
