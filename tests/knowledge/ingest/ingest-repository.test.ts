import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("../../../src/knowledge/ingest/milvus-client.js", () => ({
  getMilvusClient: vi.fn().mockReturnValue({
    insert: mocks.insert,
    hasCollection: mocks.hasCollection,
    createCollection: mocks.createCollection,
    createIndex: mocks.createIndex,
    loadCollection: mocks.loadCollection,
    flush: mocks.flush,
  }),
  ensureKnowledgeCollection: mocks.ensureKnowledgeCollection,
  KNOWLEDGE_COLLECTION: "knowledge_chunks",
}));

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
});
