import { existsSync, readFileSync } from "fs";
import { loadDashboardSurface } from './dashboard-loader.js';
import { join } from "path";
import { describe, it, expect, vi } from "vitest";

vi.mock("@zilliz/milvus2-sdk-node", () => ({
  MilvusClient: vi.fn().mockImplementation(() => ({
    hasCollection: vi.fn().mockResolvedValue({ value: true }),
    insert: vi.fn().mockResolvedValue({ insert_count: 1 }),
    search: vi.fn().mockResolvedValue({ results: [] }),
  })),
  DataType: {
    VarChar: "VarChar",
    Int64: "Int64",
    Float: "Float",
    FloatVector: "FloatVector",
  },
}));

vi.mock("@xenova/transformers", () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockResolvedValue({
      data: new Float32Array(1024).fill(0.1),
    }),
  ),
}));

describe("Sprint 42 smoke tests — schema and chunking", () => {
  it("KnowledgeDocument interface file exists", () => {
    expect(
      existsSync(join(process.cwd(), "src/knowledge/schema/documents.ts")),
    ).toBe(true);
  });

  it("KnowledgeChunk interface file exists", () => {
    expect(
      existsSync(join(process.cwd(), "src/knowledge/schema/metadata.ts")),
    ).toBe(true);
  });

  it("chunkDocument splits text into chunks", async () => {
    const { chunkDocument } =
      await import("../src/knowledge/ingest/chunking.js");
    const doc = {
      id: "test-doc",
      sourceType: "sprint_report",
      title: "Test Sprint",
      path: "/tmp/test.md",
      rawText: Array(600).fill("word").join(" "),
    };
    const chunks = chunkDocument(doc);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunkId).toContain("test-doc");
    expect(chunks[0].text.length).toBeGreaterThan(0);
    expect(chunks[0].denseVector).toEqual([]);
  });

  it("chunkDocument returns empty array for empty rawText", async () => {
    const { chunkDocument } =
      await import("../src/knowledge/ingest/chunking.js");
    const doc = {
      id: "empty-doc",
      sourceType: "sprint_report",
      title: "Empty",
      path: "/tmp/empty.md",
      rawText: "",
    };
    const chunks = chunkDocument(doc);
    expect(chunks).toEqual([]);
  });
});

describe("Sprint 42 smoke tests — embedder", () => {
  it("embedTextBatch returns array of vectors", async () => {
    const { embedTextBatch } =
      await import("../src/knowledge/ingest/embedder.js");
    const vectors = await embedTextBatch(["hello world", "test text"]);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(1024);
    expect(typeof vectors[0][0]).toBe("number");
  });
});

describe("Sprint 42 smoke tests — file surface", () => {
  it("milvus-client.ts exists and exports expected symbols", () => {
    const content = readFileSync(
      join(process.cwd(), "src/knowledge/ingest/milvus-client.ts"),
      "utf-8",
    );
    expect(content).toContain("KNOWLEDGE_COLLECTION");
    expect(content).toContain("getMilvusClient");
    expect(content).toContain("ensureKnowledgeCollection");
  });

  it("ingest-sprint-history.ts exists and exports ingestSprintHistory", () => {
    const content = readFileSync(
      join(process.cwd(), "src/knowledge/ingest/ingest-sprint-history.ts"),
      "utf-8",
    );
    expect(content).toContain("ingestSprintHistory");
    expect(content).toContain("parseSprintNumberFromFilename");
    expect(content).toContain("chunkToMilvusEntity");
  });

  it("knowledge-handlers.cjs exists and registers knowledge:ingest and knowledge:search", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/knowledge-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("knowledge:ingest");
    expect(content).toContain("knowledge:search");
    expect(content).toContain("registerKnowledgeHandlers");
  });

  it("preload exposes workspaceKnowledge namespace", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(content).toContain(
      'contextBridge.exposeInMainWorld("workspaceKnowledge"',
    );
    expect(content).toContain("knowledge:ingest");
    expect(content).toContain("knowledge:search");
  });

  it("types.d.ts declares workspaceKnowledge interface", () => {
    const content = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(content).toContain("workspaceKnowledge:");
    expect(content).toContain("ingest:");
    expect(content).toContain("search:");
  });

  it("dashboard has knowledge panel elements", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("knowledge-ingest");
    expect(html).toContain("knowledge-search");
    expect(html).toContain("globalThis.workspaceKnowledge.ingest");
    expect(html).toContain("globalThis.workspaceKnowledge.search");
  });

  it("dashboard preserves Sprint 25–41 compatibility strings", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("Workspace Analytics");
    expect(html).toContain("Audit Trail");
    expect(html).toContain("Workspace Approvals");
    expect(html).toContain("Workspace Quotas");
    expect(html).toContain("metric-success-rate");
    expect(html).toContain("workspaceRouting.analytics");
  });

  it("main.cjs registers knowledge handlers", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/main.cjs"),
      "utf-8",
    );
    expect(content).toContain("registerKnowledgeHandlers");
  });

  it("src/knowledge/index.ts barrel export exists", () => {
    expect(existsSync(join(process.cwd(), "src/knowledge/index.ts"))).toBe(
      true,
    );
  });
});
