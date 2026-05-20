import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ExperienceDb } from "../../src/llm/experience-db.js";
import { kMeans, clusterDocuments, encodeEmbedding, decodeEmbedding, cosineSimilarity } from "../../src/llm/embeddings.js";

const makeUnitVector = (index) => {
  const vector = Array.from({ length: 768 }, () => 0);
  vector[index] = 1.0;
  return vector;
};

describe("LLM Embeddings", () => {
  it("kMeans separates two clearly distinct clusters", () => {
    const vectors = [
      makeUnitVector(0),
      makeUnitVector(0),
      makeUnitVector(0),
      makeUnitVector(1),
      makeUnitVector(1),
      makeUnitVector(1)
    ];
    const { clusters } = kMeans(vectors, 2);
    expect(clusters).toHaveLength(2);
    const clusterHasAllDim0 = clusters.some((cluster) => cluster.indices.every((index) => index < 3));
    const clusterHasAllDim1 = clusters.some((cluster) => cluster.indices.every((index) => index >= 3));
    expect(clusterHasAllDim0).toBe(true);
    expect(clusterHasAllDim1).toBe(true);
  });

  it("kMeans with k equal to vector count returns one vector per cluster", () => {
    const vectors = [makeUnitVector(0), makeUnitVector(1), makeUnitVector(2)];
    const { clusters } = kMeans(vectors, 3);
    expect(clusters).toHaveLength(3);
    clusters.forEach((cluster) => {
      expect(cluster.indices).toHaveLength(1);
    });
  });

  it("cosineSimilarity of identical vectors returns 1.0", () => {
    const vector = makeUnitVector(0);
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1.0, 5);
  });

  it("cosineSimilarity of orthogonal vectors returns 0.0", () => {
    const v1 = makeUnitVector(0);
    const v2 = makeUnitVector(1);
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0.0, 5);
  });

  it("encodeEmbedding / decodeEmbedding round-trip preserves vector values", () => {
    const vector = new Float32Array(768);
    for (let i = 0; i < 768; i += 1) {
      vector[i] = Math.random();
    }
    const roundTripped = decodeEmbedding(encodeEmbedding(vector));
    expect(roundTripped).toHaveLength(768);
    for (let i = 0; i < 768; i += 1) {
      expect(roundTripped[i]).toBeCloseTo(vector[i], 6);
    }
  });

  it("clusterDocuments skips documents without embeddings", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "embeddings-test-"));
    const db = new ExperienceDb({ baseDir });
    await db.open();
    db.state.documents.push(
      {
        id: 1,
        filename: "file-0.txt",
        content: "alpha document",
        embedding: encodeEmbedding(makeUnitVector(0)),
        source_type: "document",
        platform: null
      },
      {
        id: 2,
        filename: "file-1.txt",
        content: "beta document",
        embedding: encodeEmbedding(makeUnitVector(1)),
        source_type: "document",
        platform: null
      },
      {
        id: 3,
        filename: "file-null.txt",
        content: "empty embedding",
        embedding: null,
        source_type: "document",
        platform: null
      }
    );
    await db.save();

    const clusters = await clusterDocuments(db, 2);
    expect(clusters).toHaveLength(2);
    clusters.forEach((cluster) => {
      expect(cluster.snippets).toHaveLength(1);
    });
    await fs.rm(baseDir, { recursive: true, force: true });
  });
});
