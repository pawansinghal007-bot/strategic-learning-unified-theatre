import {
  SOURCE_TYPES,
  isSourceType,
} from "../src/knowledge/schema/documents.js";
import { isKnowledgeChunk } from "../src/knowledge/schema/metadata.js";

function makeDocument(overrides = {}) {
  return {
    id: "doc-1",
    sourceType: "architecture_doc",
    title: "System Overview",
    path: "/docs/system-overview.md",
    rawText: "This document describes the system architecture.",
    ...overrides,
  };
}

function makeChunk(overrides = {}) {
  return {
    chunkId: "chunk-1",
    docId: "doc-1",
    sourceType: "architecture_doc",
    text: "This is a chunk of text.",
    importance: 0.5,
    hash: "abc123",
    createdAt: Date.now(),
    denseVector: [0.1, 0.2, 0.3],
    ...overrides,
  };
}

describe("SOURCE_TYPES / isSourceType", () => {
  it("exposes the full union as a runtime array", () => {
    expect(SOURCE_TYPES).toEqual([
      "sprint_report",
      "architecture_doc",
      "test_file",
      "ipc_handler",
      "service",
    ]);
  });

  it("accepts every valid SourceType value", () => {
    for (const sourceType of SOURCE_TYPES) {
      expect(isSourceType(sourceType)).toBe(true);
    }
  });

  it("rejects values outside the union", () => {
    expect(isSourceType("not_a_real_type")).toBe(false);
    expect(isSourceType("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isSourceType(123)).toBe(false);
    expect(isSourceType(null)).toBe(false);
    expect(isSourceType(undefined)).toBe(false);
    expect(isSourceType({})).toBe(false);
    expect(isSourceType(["service"])).toBe(false);
  });
});

describe("KnowledgeDocument shape (via makeDocument helper)", () => {
  it("accepts a minimal valid document with only required fields", () => {
    const doc = makeDocument();
    expect(doc.id).toBe("doc-1");
    expect(isSourceType(doc.sourceType)).toBe(true);
    expect(typeof doc.title).toBe("string");
    expect(typeof doc.path).toBe("string");
    expect(typeof doc.rawText).toBe("string");
  });

  it("supports every documented SourceType value", () => {
    for (const sourceType of SOURCE_TYPES) {
      const doc = makeDocument({ sourceType });
      expect(doc.sourceType).toBe(sourceType);
    }
  });

  it("allows all optional fields to be populated", () => {
    const doc = makeDocument({
      sprint: 12,
      module: "knowledge",
      featureArea: "rag",
      version: "1.2.0",
      createdAt: 1700000000000,
      updatedAt: 1700000100000,
    });
    expect(doc.sprint).toBe(12);
    expect(doc.module).toBe("knowledge");
    expect(doc.featureArea).toBe("rag");
    expect(doc.version).toBe("1.2.0");
    expect(doc.createdAt).toBeLessThan(doc.updatedAt);
  });

  it("allows all optional fields to be omitted", () => {
    const doc = makeDocument();
    expect(doc.sprint).toBeUndefined();
    expect(doc.module).toBeUndefined();
    expect(doc.featureArea).toBeUndefined();
    expect(doc.version).toBeUndefined();
    expect(doc.createdAt).toBeUndefined();
    expect(doc.updatedAt).toBeUndefined();
  });
});

describe("isKnowledgeChunk", () => {
  it("accepts a well-formed chunk with only required fields", () => {
    expect(isKnowledgeChunk(makeChunk())).toBe(true);
  });

  it("accepts a well-formed chunk with optional fields populated", () => {
    const chunk = makeChunk({
      sprint: 12,
      module: "knowledge",
      featureArea: "rag",
      version: "1.2.0",
      path: "/docs/system-overview.md",
      section: "Overview",
    });
    expect(isKnowledgeChunk(chunk)).toBe(true);
  });

  it("accepts every documented SourceType value", () => {
    for (const sourceType of SOURCE_TYPES) {
      expect(isKnowledgeChunk(makeChunk({ sourceType }))).toBe(true);
    }
  });

  it("rejects null and non-object values", () => {
    expect(isKnowledgeChunk(null)).toBe(false);
    expect(isKnowledgeChunk(undefined)).toBe(false);
    expect(isKnowledgeChunk("chunk")).toBe(false);
    expect(isKnowledgeChunk(42)).toBe(false);
  });

  it("rejects a chunk with an invalid sourceType", () => {
    expect(isKnowledgeChunk(makeChunk({ sourceType: "not_a_real_type" }))).toBe(
      false,
    );
  });

  it("rejects a chunk missing a required string field", () => {
    const chunk = makeChunk();
    delete chunk.hash;
    expect(isKnowledgeChunk(chunk)).toBe(false);
  });

  it("rejects a chunk with a non-numeric importance", () => {
    expect(isKnowledgeChunk(makeChunk({ importance: "high" }))).toBe(false);
  });

  it("rejects a chunk whose denseVector is not an array", () => {
    expect(isKnowledgeChunk(makeChunk({ denseVector: "not-an-array" }))).toBe(
      false,
    );
  });

  it("rejects a chunk whose denseVector contains non-numeric entries", () => {
    expect(
      isKnowledgeChunk(makeChunk({ denseVector: [0.1, "oops", 0.3] })),
    ).toBe(false);
  });

  it("preserves all original chunk fields when valid", () => {
    const chunk = makeChunk({ extra: 42 });
    expect(isKnowledgeChunk(chunk)).toBe(true);
    expect(chunk.extra).toBe(42);
  });
});

describe("KnowledgeChunk <-> KnowledgeDocument consistency", () => {
  it("can reference its parent document's id and sourceType", () => {
    const doc = makeDocument({ id: "doc-42", sourceType: "service" });
    const chunk = makeChunk({ docId: doc.id, sourceType: doc.sourceType });
    expect(chunk.docId).toBe(doc.id);
    expect(chunk.sourceType).toBe(doc.sourceType);
    expect(isKnowledgeChunk(chunk)).toBe(true);
  });
});
