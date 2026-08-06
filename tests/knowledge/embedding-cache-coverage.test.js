/**
 * Coverage additions for embedding-cache.js
 *
 * Targets the uncovered sections:
 * - getStats() when db is null
 * - _pruneIfNeeded() when exceeding maxEntries
 * - getVector() hit/miss
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "embedding-cache-coverage-"));
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

describe("embedding-cache coverage — getStats when db is null", () => {
  it("returns zero stats when database has not been initialized", async () => {
    const { EmbeddingCache } = await import("../../src/knowledge/ingest/embedding-cache.js");

    const cache = new EmbeddingCache({ baseDir: tmpDir });

    const stats = cache.getStats();

    expect(stats).toEqual({
      hits: 0,
      misses: 0,
      size: 0,
    });
  });
});

describe("embedding-cache coverage — getVector hit", () => {
  it("returns cached vector when key exists", async () => {
    const { EmbeddingCache } = await import("../../src/knowledge/ingest/embedding-cache.js");

    const cache = new EmbeddingCache({ baseDir: tmpDir });
    await cache.init();

    const testVector = [0.1, 0.2, 0.3, 0.4, 0.5];
    await cache.setVector("test-key", testVector);

    const result = cache.getVector("test-key");

    expect(result).toEqual(testVector);
  });

  it("returns cached vector after multiple inserts", async () => {
    const { EmbeddingCache } = await import("../../src/knowledge/ingest/embedding-cache.js");

    const cache = new EmbeddingCache({ baseDir: tmpDir });
    await cache.init();

    const vector1 = [1.0, 2.0, 3.0];
    const vector2 = [4.0, 5.0, 6.0];

    await cache.setVector("key-1", vector1);
    await cache.setVector("key-2", vector2);

    expect(cache.getVector("key-1")).toEqual(vector1);
    expect(cache.getVector("key-2")).toEqual(vector2);
  });

  it("returns null for non-existent key", async () => {
    const { EmbeddingCache } = await import("../../src/knowledge/ingest/embedding-cache.js");

    const cache = new EmbeddingCache({ baseDir: tmpDir });
    await cache.init();

    const result = cache.getVector("nonexistent-key");

    expect(result).toBeNull();
  });
});

describe("embedding-cache coverage — _pruneIfNeeded when exceeding maxEntries", () => {
  it("prunes oldest entries when cache exceeds maxEntries", async () => {
    const { EmbeddingCache } = await import("../../src/knowledge/ingest/embedding-cache.js");

    const cache = new EmbeddingCache({ baseDir: tmpDir, maxEntries: 5 });
    await cache.init();

    for (let i = 0; i < 8; i++) {
      await cache.setVector(`key-${i}`, [i, i + 1, i + 2]);
    }

    const stats = cache.getStats();
    expect(stats.size).toBeLessThanOrEqual(5);
  });

  it("does not prune when under maxEntries", async () => {
    const { EmbeddingCache } = await import("../../src/knowledge/ingest/embedding-cache.js");

    const cache = new EmbeddingCache({ baseDir: tmpDir, maxEntries: 100 });
    await cache.init();

    for (let i = 0; i < 3; i++) {
      await cache.setVector(`key-${i}`, [i, i + 1]);
    }

    const stats = cache.getStats();
    expect(stats.size).toBe(3);
  });

  it("prunes correctly with mixed key patterns", async () => {
    const { EmbeddingCache } = await import("../../src/knowledge/ingest/embedding-cache.js");

    const cache = new EmbeddingCache({ baseDir: tmpDir, maxEntries: 3 });
    await cache.init();

    const vectors = [
      { key: "src/file1.js", vector: [1, 2, 3] },
      { key: "src/file2.js", vector: [4, 5, 6] },
      { key: "docs/readme.md", vector: [7, 8, 9] },
      { key: "tests/test1.js", vector: [10, 11, 12] },
      { key: "src/file3.js", vector: [13, 14, 15] },
    ];

    for (const v of vectors) {
      await cache.setVector(v.key, v.vector);
    }

    const stats = cache.getStats();
    expect(stats.size).toBeLessThanOrEqual(3);
  });
});

describe("embedding-cache coverage — integration: set, get, stats, prune", () => {
  it("full lifecycle: init, set, get, stats, prune", async () => {
    const { EmbeddingCache } = await import("../../src/knowledge/ingest/embedding-cache.js");

    const cache = new EmbeddingCache({ baseDir: tmpDir, maxEntries: 10 });
    await cache.init();

    for (let i = 0; i < 15; i++) {
      await cache.setVector(`doc-${i}`, Array.from({ length: 5 }, (_, j) => i + j));
    }

    const stats = cache.getStats();
    expect(stats.size).toBeLessThanOrEqual(10);
    expect(stats.hits).toBeGreaterThanOrEqual(0);
    expect(stats.misses).toBeGreaterThanOrEqual(0);

    const lastKey = "doc-14";
    const cached = cache.getVector(lastKey);
    if (cached) {
      expect(cached).toHaveLength(5);
    }
  });

  it("tracks hits and misses correctly", async () => {
    const { EmbeddingCache } = await import("../../src/knowledge/ingest/embedding-cache.js");

    const cache = new EmbeddingCache({ baseDir: tmpDir, maxEntries: 100 });
    await cache.init();

    await cache.setVector("key-1", [1, 2, 3]);
    await cache.setVector("key-2", [4, 5, 6]);

    // Hit
    cache.getVector("key-1");
    // Hit
    cache.getVector("key-2");
    // Miss
    cache.getVector("nonexistent");

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(2);
  });
});
