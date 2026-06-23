import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  hasCollection: vi.fn(),
  createCollection: vi.fn(),
  createIndex: vi.fn(),
  loadCollection: vi.fn(),
}));

vi.mock("@zilliz/milvus2-sdk-node", () => ({
  MilvusClient: vi.fn().mockImplementation(function MockMilvusClient() {
    return {
      hasCollection: mocks.hasCollection,
      createCollection: mocks.createCollection,
      createIndex: mocks.createIndex,
      loadCollection: mocks.loadCollection,
    };
  }),
  DataType: {
    VarChar: "VarChar",
    Int64: "Int64",
    Float: "Float",
    FloatVector: "FloatVector",
  },
}));

describe("milvus-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("getMilvusClient", () => {
    it("creates a client on first call", async () => {
      const { getMilvusClient } =
        await import("../../../src/knowledge/ingest/milvus-client.js");
      const { MilvusClient } = await import("@zilliz/milvus2-sdk-node");

      const client = getMilvusClient();

      expect(client).toBeDefined();
      expect(MilvusClient).toHaveBeenCalledTimes(1);
    });

    it("reuses the same client instance on subsequent calls", async () => {
      const { getMilvusClient } =
        await import("../../../src/knowledge/ingest/milvus-client.js");
      const { MilvusClient } = await import("@zilliz/milvus2-sdk-node");

      const client1 = getMilvusClient();
      const client2 = getMilvusClient();

      expect(client1).toBe(client2);
      expect(MilvusClient).toHaveBeenCalledTimes(1);
    });

    it("uses MILVUS_ADDRESS env var when set", async () => {
      const originalEnv = process.env.MILVUS_ADDRESS;
      process.env.MILVUS_ADDRESS = "custom-host:1234";

      const { getMilvusClient } =
        await import("../../../src/knowledge/ingest/milvus-client.js");
      const { MilvusClient } = await import("@zilliz/milvus2-sdk-node");

      getMilvusClient();

      expect(MilvusClient).toHaveBeenCalledWith({
        address: "custom-host:1234",
      });

      process.env.MILVUS_ADDRESS = originalEnv;
    });

    it("defaults to localhost:19530 when MILVUS_ADDRESS is unset", async () => {
      const originalEnv = process.env.MILVUS_ADDRESS;
      delete process.env.MILVUS_ADDRESS;

      const { getMilvusClient } =
        await import("../../../src/knowledge/ingest/milvus-client.js");
      const { MilvusClient } = await import("@zilliz/milvus2-sdk-node");

      getMilvusClient();

      expect(MilvusClient).toHaveBeenCalledWith({
        address: "localhost:19530",
      });

      process.env.MILVUS_ADDRESS = originalEnv;
    });
  });

  describe("ensureKnowledgeCollection", () => {
    it("returns early when the collection already exists", async () => {
      mocks.hasCollection.mockResolvedValue({ value: true });

      const { ensureKnowledgeCollection } =
        await import("../../../src/knowledge/ingest/milvus-client.js");

      await ensureKnowledgeCollection();

      expect(mocks.hasCollection).toHaveBeenCalledWith({
        collection_name: "knowledge_chunks",
      });
      expect(mocks.createCollection).not.toHaveBeenCalled();
      expect(mocks.createIndex).not.toHaveBeenCalled();
      expect(mocks.loadCollection).not.toHaveBeenCalled();
    });

    it("creates collection, index, and loads it when collection does not exist", async () => {
      mocks.hasCollection.mockResolvedValue({ value: false });
      mocks.createCollection.mockResolvedValue(undefined);
      mocks.createIndex.mockResolvedValue(undefined);
      mocks.loadCollection.mockResolvedValue(undefined);

      const { ensureKnowledgeCollection, KNOWLEDGE_COLLECTION } =
        await import("../../../src/knowledge/ingest/milvus-client.js");

      await ensureKnowledgeCollection();

      expect(mocks.createCollection).toHaveBeenCalledTimes(1);
      const createArgs = mocks.createCollection.mock.calls[0][0];
      expect(createArgs.collection_name).toBe(KNOWLEDGE_COLLECTION);

      const fieldNames = createArgs.fields.map((f: any) => f.name);
      expect(fieldNames).toEqual([
        "chunk_id",
        "doc_id",
        "source_type",
        "sprint",
        "module",
        "feature_area",
        "version",
        "path",
        "section",
        "importance",
        "hash",
        "created_at",
        "dense_vector",
      ]);

      const primaryKeyField = createArgs.fields.find(
        (f: any) => f.name === "chunk_id",
      );
      expect(primaryKeyField.is_primary_key).toBe(true);

      const vectorField = createArgs.fields.find(
        (f: any) => f.name === "dense_vector",
      );
      expect(vectorField.dim).toBe(1024);

      expect(mocks.createIndex).toHaveBeenCalledWith({
        collection_name: KNOWLEDGE_COLLECTION,
        field_name: "dense_vector",
        index_type: "HNSW",
        metric_type: "COSINE",
        params: { M: 16, efConstruction: 256 },
      });

      expect(mocks.loadCollection).toHaveBeenCalledWith({
        collection_name: KNOWLEDGE_COLLECTION,
      });
    });
  });

  describe("truncateTextForMilvus", () => {
    it("returns empty string for null", async () => {
      const { truncateTextForMilvus } =
        await import("../../../src/knowledge/ingest/milvus-client.js");
      expect(truncateTextForMilvus(null)).toBe("");
    });

    it("returns empty string for undefined", async () => {
      const { truncateTextForMilvus } =
        await import("../../../src/knowledge/ingest/milvus-client.js");
      expect(truncateTextForMilvus(undefined)).toBe("");
    });

    it("returns the original string when under the limit", async () => {
      const { truncateTextForMilvus } =
        await import("../../../src/knowledge/ingest/milvus-client.js");
      expect(truncateTextForMilvus("hello world")).toBe("hello world");
    });

    it("truncates strings longer than 16384 characters", async () => {
      const { truncateTextForMilvus } =
        await import("../../../src/knowledge/ingest/milvus-client.js");
      const longText = "a".repeat(20_000);
      const result = truncateTextForMilvus(longText);
      expect(result.length).toBe(16_384);
      expect(result).toBe("a".repeat(16_384));
    });

    it("coerces non-string input via String()", async () => {
      const { truncateTextForMilvus } =
        await import("../../../src/knowledge/ingest/milvus-client.js");
      expect(truncateTextForMilvus(12345)).toBe("12345");
    });
  });

  describe("chunkToMilvusEntity", () => {
    it("maps all chunk fields when fully populated", async () => {
      const { chunkToMilvusEntity } =
        await import("../../../src/knowledge/ingest/milvus-client.js");

      const chunk = {
        chunkId: "chunk-1",
        docId: "doc-1",
        sourceType: "markdown",
        sprint: 42,
        module: "knowledge",
        featureArea: "ingest",
        version: "1.0.0",
        path: "/explicit/path.md",
        section: "intro",
        importance: 0.9,
        hash: "abc123",
        createdAt: 1700000000,
        text: "some content",
        denseVector: [0.1, 0.2, 0.3],
      };

      const result = chunkToMilvusEntity(chunk, "/fallback/path.md");

      expect(result).toEqual({
        chunk_id: "chunk-1",
        doc_id: "doc-1",
        source_type: "markdown",
        sprint: 42,
        module: "knowledge",
        feature_area: "ingest",
        version: "1.0.0",
        path: "/explicit/path.md",
        section: "intro",
        importance: 0.9,
        hash: "abc123",
        created_at: 1700000000,
        text: "some content",
        dense_vector: [0.1, 0.2, 0.3],
      });
    });

    it("applies defaults when optional fields are missing", async () => {
      const { chunkToMilvusEntity } =
        await import("../../../src/knowledge/ingest/milvus-client.js");

      const chunk = {
        chunkId: "chunk-2",
        docId: "doc-2",
        sourceType: "code",
        importance: 0.5,
        hash: "def456",
        createdAt: 1700000001,
        text: "content",
        denseVector: [0.4, 0.5, 0.6],
      };

      const result = chunkToMilvusEntity(chunk, "/fallback/path.js");

      expect(result.sprint).toBe(-1);
      expect(result.module).toBe("");
      expect(result.feature_area).toBe("");
      expect(result.version).toBe("");
      expect(result.section).toBe("");
      expect(result.path).toBe("/fallback/path.js");
    });

    it("falls back to empty string path when neither chunk.path nor filePath is provided", async () => {
      const { chunkToMilvusEntity } =
        await import("../../../src/knowledge/ingest/milvus-client.js");

      const chunk = {
        chunkId: "chunk-3",
        docId: "doc-3",
        sourceType: "code",
        importance: 0.5,
        hash: "ghi789",
        createdAt: 1700000002,
        text: "content",
        denseVector: [0.7, 0.8, 0.9],
      };

      const result = chunkToMilvusEntity(chunk);

      expect(result.path).toBe("");
    });

    it("truncates text via truncateTextForMilvus", async () => {
      const { chunkToMilvusEntity } =
        await import("../../../src/knowledge/ingest/milvus-client.js");

      const longText = "x".repeat(20_000);
      const chunk = {
        chunkId: "chunk-4",
        docId: "doc-4",
        sourceType: "code",
        importance: 0.5,
        hash: "jkl012",
        createdAt: 1700000003,
        text: longText,
        denseVector: [1, 2, 3],
      };

      const result = chunkToMilvusEntity(chunk, "/path.js");

      expect(result.text.length).toBe(16_384);
    });
  });
});
