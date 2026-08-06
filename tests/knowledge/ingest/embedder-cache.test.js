import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const tmpDir = path.join(os.tmpdir(), `embedder-cache-test-${Date.now()}`);

async function resetEnv() {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.EMBEDDING_CACHE_DIR = tmpDir;
  vi.resetModules();
}

afterEach(async () => {
  delete process.env.EMBEDDING_CACHE_DIR;
  vi.clearAllMocks();
});

describe("embedder cache", () => {
  beforeEach(async () => {
    await resetEnv();
  });

  it("calls the embeddings API on cache miss and populates the cache", async () => {
    const fakeResponse = {
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    };
    global.fetch = vi.fn().mockResolvedValue(fakeResponse);

    const { embedTextBatch, getEmbeddingCacheStats } =
      await import("../../../src/knowledge/ingest/embedder.js");

    const vectors = await embedTextBatch(["hello world"]);

    expect(vectors).toEqual([[0.1, 0.2, 0.3]]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(getEmbeddingCacheStats()).toEqual({ hits: 0, misses: 1, size: 1 });
  });

  it("reuses cached embeddings and avoids the API call on a cache hit", async () => {
    const fakeResponse = {
      ok: true,
      json: async () => ({ data: [{ embedding: [0.4, 0.5, 0.6] }] }),
    };
    global.fetch = vi.fn().mockResolvedValue(fakeResponse);

    const { embedTextBatch, getEmbeddingCacheStats } =
      await import("../../../src/knowledge/ingest/embedder.js");

    await embedTextBatch(["hello world"]);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    global.fetch.mockClear();

    const secondVectors = await embedTextBatch(["hello world"]);
    expect(secondVectors).toEqual([[0.4, 0.5, 0.6]]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(getEmbeddingCacheStats()).toEqual({ hits: 1, misses: 1, size: 1 });
  });

  it("deduplicates identical chunk texts within a single embedded batch", async () => {
    const fakeResponse = {
      ok: true,
      json: async () => ({ data: [{ embedding: [0.7, 0.8, 0.9] }] }),
    };
    global.fetch = vi.fn().mockResolvedValue(fakeResponse);

    const { embedTextBatch } =
      await import("../../../src/knowledge/ingest/embedder.js");

    const vectors = await embedTextBatch(["repeat", "repeat"]);
    expect(vectors).toEqual([
      [0.7, 0.8, 0.9],
      [0.7, 0.8, 0.9],
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
