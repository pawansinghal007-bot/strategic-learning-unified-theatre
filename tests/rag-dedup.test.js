import { hashRagChunk, dedupeRagChunks } from "../src/knowledge/rag-dedup.js";

describe("hashRagChunk", () => {
  it("produces a 64-character hex sha256 digest", () => {
    const hash = hashRagChunk({
      chunk_id: "1",
      doc_id: "d1",
      content: "hello",
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for identical input", () => {
    const chunk = {
      chunk_id: "1",
      doc_id: "d1",
      filename: "a.txt",
      section: "intro",
      content: "hello world",
    };
    expect(hashRagChunk(chunk)).toBe(hashRagChunk({ ...chunk }));
  });

  it("produces different hashes for different content", () => {
    const a = hashRagChunk({ chunk_id: "1", content: "hello" });
    const b = hashRagChunk({ chunk_id: "1", content: "goodbye" });
    expect(a).not.toBe(b);
  });

  it("falls back to camelCase field names when snake_case is absent", () => {
    const snake = hashRagChunk({
      chunk_id: "1",
      doc_id: "d1",
      filename: "a.txt",
      content: "hi",
    });
    const camel = hashRagChunk({
      chunkId: "1",
      docId: "d1",
      filename: "a.txt",
      content: "hi",
    });
    expect(snake).toBe(camel);
  });

  it("falls back to path when filename is absent", () => {
    const withFilename = hashRagChunk({
      chunk_id: "1",
      filename: "a.txt",
      content: "hi",
    });
    const withPath = hashRagChunk({
      chunk_id: "1",
      path: "a.txt",
      content: "hi",
    });
    expect(withFilename).toBe(withPath);
  });

  it("falls back to text when content is absent", () => {
    const withContent = hashRagChunk({ chunk_id: "1", content: "hi there" });
    const withText = hashRagChunk({ chunk_id: "1", text: "hi there" });
    expect(withContent).toBe(withText);
  });

  it("handles a completely empty chunk without throwing", () => {
    expect(() => hashRagChunk({})).not.toThrow();
    expect(hashRagChunk({})).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles missing argument using the default empty object", () => {
    expect(() => hashRagChunk()).not.toThrow();
    expect(hashRagChunk()).toBe(hashRagChunk({}));
  });

  it("treats chunks differing only by section as distinct", () => {
    const a = hashRagChunk({ chunk_id: "1", section: "intro", content: "hi" });
    const b = hashRagChunk({ chunk_id: "1", section: "outro", content: "hi" });
    expect(a).not.toBe(b);
  });
});

describe("dedupeRagChunks", () => {
  it("returns an empty array for no input", () => {
    expect(dedupeRagChunks()).toEqual([]);
    expect(dedupeRagChunks([])).toEqual([]);
  });

  it("removes exact duplicate chunks, keeping the first occurrence", () => {
    const chunks = [
      { chunk_id: "1", content: "hello" },
      { chunk_id: "1", content: "hello" },
      { chunk_id: "2", content: "world" },
    ];
    const result = dedupeRagChunks(chunks);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.chunk_id)).toEqual(["1", "2"]);
  });

  it("attaches a rag_hash to every surviving chunk", () => {
    const chunks = [{ chunk_id: "1", content: "hello" }];
    const [result] = dedupeRagChunks(chunks);
    expect(result.rag_hash).toBe(hashRagChunk(chunks[0]));
    expect(result.chunk_id).toBe("1");
  });

  it("respects the maxChunks option and stops early", () => {
    const chunks = [
      { chunk_id: "1", content: "a" },
      { chunk_id: "2", content: "b" },
      { chunk_id: "3", content: "c" },
    ];
    const result = dedupeRagChunks(chunks, { maxChunks: 2 });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.chunk_id)).toEqual(["1", "2"]);
  });

  it("defaults maxChunks to 10 when not provided", () => {
    const chunks = Array.from({ length: 15 }, (_, i) => ({
      chunk_id: String(i),
      content: `content-${i}`,
    }));
    const result = dedupeRagChunks(chunks);
    expect(result).toHaveLength(10);
  });

  it("seeds dedup state from previousHashes so known chunks are skipped", () => {
    const existing = { chunk_id: "1", content: "hello" };
    const previousHashes = [hashRagChunk(existing)];
    const chunks = [existing, { chunk_id: "2", content: "world" }];

    const result = dedupeRagChunks(chunks, { previousHashes });
    expect(result).toHaveLength(1);
    expect(result[0].chunk_id).toBe("2");
  });

  it("does not mutate the original chunk objects", () => {
    const original = { chunk_id: "1", content: "hello" };
    dedupeRagChunks([original]);
    expect(original).not.toHaveProperty("rag_hash");
  });

  it("preserves all original chunk fields alongside rag_hash", () => {
    const chunk = {
      chunk_id: "1",
      doc_id: "d1",
      filename: "a.txt",
      content: "hello",
      extra: 42,
    };
    const [result] = dedupeRagChunks([chunk]);
    expect(result).toMatchObject(chunk);
    expect(result).toHaveProperty("rag_hash");
  });
});
