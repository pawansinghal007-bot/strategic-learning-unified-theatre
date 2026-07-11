import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  hasCollection: vi.fn(),
  createCollection: vi.fn(),
  createIndex: vi.fn(),
  loadCollection: vi.fn(),
  flush: vi.fn(),
  ensureKnowledgeCollection: vi.fn(),
  embedTextBatch: vi.fn(),
}));

vi.mock(
  "../../../src/knowledge/ingest/milvus-client.js",
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      getMilvusClient: vi.fn().mockReturnValue({
        insert: mocks.insert,
        hasCollection: mocks.hasCollection,
        createCollection: mocks.createCollection,
        createIndex: mocks.createIndex,
        loadCollection: mocks.loadCollection,
        flush: mocks.flush,
      }),
      ensureKnowledgeCollection: mocks.ensureKnowledgeCollection,
    };
  },
);

vi.mock("../../../src/knowledge/ingest/embedder.js", () => ({
  embedTextBatch: mocks.embedTextBatch,
}));

vi.mock("../../src/llm/document-ingester.js", () => ({
  chunkText: vi.fn((text) => [
    { content: text.slice(0, 100), section: "section1" },
    { content: text.slice(100, 200), section: "section2" },
  ]),
}));

describe("ingestRepository", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "ingest-repository-test-"),
    );
    mocks.insert.mockClear();
    mocks.ensureKnowledgeCollection.mockClear();
    mocks.embedTextBatch.mockClear();
    mocks.flush.mockClear();
    mocks.flush.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Restore any spies set in individual tests so they don't bleed into later tests
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("handles empty directory gracefully", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.ensureKnowledgeCollection).toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("processes supported file types", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Create a test markdown file
    const testFile = path.join(tempDir, "test.md");
    await fs.writeFile(
      testFile,
      "# Test Document\n\nThis is some test content.",
    );

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.ensureKnowledgeCollection).toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalled();
  });

  it("skips unsupported file types", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Create an unsupported file
    const testFile = path.join(tempDir, "test.xyz");
    await fs.writeFile(testFile, "Some content");

    mocks.embedTextBatch.mockResolvedValue([]);

    await ingestRepository({ baseDir: tempDir });

    // Should not insert anything since file is unsupported
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("skips excluded directories", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Create excluded directories
    await fs.mkdir(path.join(tempDir, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "node_modules", "test.js"), "code");
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(tempDir, ".git", "config"), "data");

    mocks.embedTextBatch.mockResolvedValue([]);

    await ingestRepository({ baseDir: tempDir });

    // Should not process files in excluded directories
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("handles file read errors gracefully", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Create a file that will fail to read
    const testFile = path.join(tempDir, "test.md");
    await fs.writeFile(testFile, "content");

    // Mock fs.readFile to throw an error
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("Read error"));

    mocks.embedTextBatch.mockResolvedValue([]);

    await ingestRepository({ baseDir: tempDir });

    // Should handle error gracefully and continue
    expect(mocks.ensureKnowledgeCollection).toHaveBeenCalled();
  });

  // L60-61: walkFiles called with a direct file path (stat.isFile() branch)
  it("processes a single file path passed directly as baseDir", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const testFile = path.join(tempDir, "direct.md");
    await fs.writeFile(testFile, "direct file content for ingestion test");

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: testFile });

    // The file was discovered via the isFile() branch and ingested
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const insertedData = mocks.insert.mock.calls[0][0].data;
    expect(insertedData.length).toBeGreaterThan(0);
    // doc_id is built from the relativePath; when baseDir == filePath the
    // relative path is "" so doc_id becomes "repo:" — what matters is that
    // exactly one insert happened (the isFile branch was taken)
    expect(insertedData[0].chunk_id).toMatch(/^repo:/);
  });

  // L69: walkFiles recurses into a non-excluded subdirectory
  it("discovers files nested inside subdirectories", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const subDir = path.join(tempDir, "docs");
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, "nested.md"), "nested subdirectory content for ingestion");

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const insertedData = mocks.insert.mock.calls[0][0].data;
    expect(insertedData[0].path).toMatch("nested.md");
  });

  // L75: walkFiles catch block — fs.stat throws, warns and continues
  it("warns and continues when fs.stat throws during directory walk", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const statSpy = vi.spyOn(fs, "stat").mockRejectedValue(new Error("EACCES: permission denied"));

    mocks.embedTextBatch.mockResolvedValue([]);

    // Should not throw even though stat fails for every path
    await ingestRepository({ baseDir: tempDir });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ingest] Skipping"),
    );
    expect(mocks.insert).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    statSpy.mockRestore();
  });

  // L129-130 + L232: files larger than maxFileBytes are skipped;
  // skipped-file count logged when > 0
  it("skips files that exceed maxFileBytes and logs the skipped count", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Write a file with 10 bytes of content but cap the limit at 1 byte
    const testFile = path.join(tempDir, "large.md");
    await fs.writeFile(testFile, "0123456789");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.embedTextBatch.mockResolvedValue([]);

    await ingestRepository({ baseDir: tempDir, maxFileBytes: 1 });

    // File was skipped — nothing inserted
    expect(mocks.insert).not.toHaveBeenCalled();
    // The skipped-count log line must have fired (L232)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipped 1 large file(s)"),
    );

    logSpy.mockRestore();
  });

  // L190: attachVectors throws when embedTextBatch returns wrong vector count
  it("throws when embedTextBatch returns fewer vectors than chunks", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const testFile = path.join(tempDir, "mismatch.md");
    // Write enough content to produce at least one chunk
    await fs.writeFile(testFile, "word ".repeat(100));

    // Return empty array regardless of how many chunks are produced
    mocks.embedTextBatch.mockResolvedValue([]);

    await expect(
      ingestRepository({ baseDir: testFile }),
    ).rejects.toThrow("embedTextBatch returned");
  });

  // L106: parseFeatureArea returns undefined when the relative path has only
  // one segment, causing the featureArea to fall back to "unknown"
  it("uses 'unknown' as featureArea when file sits directly at cwd root", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Place the file inside a directory that IS the process cwd so
    // path.relative(cwd, file) == basename only (one segment)
    const fileName = "root-level.md";
    const testFile = path.join(process.cwd(), fileName);
    await fs.writeFile(testFile, "root level content for feature area test");

    try {
      mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      // Pass the exact file path so walkFiles hits the isFile() branch
      await ingestRepository({ baseDir: testFile });

      expect(mocks.insert).toHaveBeenCalledTimes(1);
      const entity = mocks.insert.mock.calls[0][0].data[0];
      // chunk.module was set to "unknown" because parseFeatureArea returned undefined
      expect(entity.module).toBe("unknown");
    } finally {
      await fs.unlink(testFile).catch(() => {});
    }
  });
});
