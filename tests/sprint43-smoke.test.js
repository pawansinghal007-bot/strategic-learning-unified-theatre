import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { buildKnowledgePromptBlock } from "../src/knowledge/index.js";

// ── Pure logic tests (no Milvus, no network) ──────────────────────────────

describe("Sprint 43 smoke tests — buildKnowledgePromptBlock", () => {
  const makeHit = (overrides) => ({
    chunk_id: "c1",
    doc_id: "d1",
    source_type: "sprint_report",
    sprint: 42,
    feature_area: "knowledge",
    path: "docs/a.md",
    section: "intro",
    importance: 1,
    score: 0.8,
    text: "default text",
    ...overrides,
  });

  it("filters out hits below minScore", () => {
    const out = buildKnowledgePromptBlock(
      [
        makeHit({ score: 0.2, text: "low score hit" }),
        makeHit({ score: 0.9, text: "high score hit" }),
      ],
      0.4,
      6,
    );
    expect(out).toContain("high score hit");
    expect(out).not.toContain("low score hit");
  });

  it("sorts hits by score descending", () => {
    const out = buildKnowledgePromptBlock(
      [
        makeHit({ score: 0.6, text: "middle hit" }),
        makeHit({ score: 0.95, text: "top hit" }),
        makeHit({ score: 0.5, text: "bottom hit" }),
      ],
      0.4,
      6,
    );
    expect(out.indexOf("top hit")).toBeLessThan(out.indexOf("middle hit"));
    expect(out.indexOf("middle hit")).toBeLessThan(out.indexOf("bottom hit"));
  });

  it("respects maxChunks limit", () => {
    const hits = Array.from({ length: 10 }, (_, i) =>
      makeHit({ chunk_id: `c${i}`, score: 0.9 - i * 0.01, text: `chunk ${i}` }),
    );
    const out = buildKnowledgePromptBlock(hits, 0.4, 3);
    const count = (out.match(/chunk \d/g) || []).length;
    expect(count).toBe(3);
  });

  it("returns empty string when all hits are below minScore", () => {
    const out = buildKnowledgePromptBlock(
      [makeHit({ score: 0.1, text: "too low" })],
      0.4,
      6,
    );
    expect(out).toBe("");
  });

  it("returns empty string for empty hits array", () => {
    expect(buildKnowledgePromptBlock([], 0.4, 6)).toBe("");
  });

  it("includes sprint and feature_area in output", () => {
    const out = buildKnowledgePromptBlock(
      [makeHit({ sprint: 42, feature_area: "quota-governance", score: 0.85 })],
      0.4,
      6,
    );
    expect(out).toContain("sprint=42");
    expect(out).toContain("area=quota-governance");
  });

  it("separates multiple chunks with ---", () => {
    const out = buildKnowledgePromptBlock(
      [
        makeHit({ chunk_id: "c1", score: 0.9, text: "first" }),
        makeHit({ chunk_id: "c2", score: 0.8, text: "second" }),
      ],
      0.4,
      6,
    );
    expect(out).toContain("---");
  });
});

// ── File surface tests ────────────────────────────────────────────────────

describe("Sprint 43 smoke tests — file surface", () => {
  it("src/knowledge/index.ts exports buildKnowledgePromptBlock", () => {
    const source = readFileSync(
      join(process.cwd(), "src/knowledge/index.ts"),
      "utf-8",
    );
    expect(source).toContain("buildKnowledgePromptBlock");
    expect(source).toContain("minScore");
    expect(source).toContain("maxChunks");
  });

  it("src/knowledge/index.ts preserves Sprint 42 barrel exports", () => {
    const source = readFileSync(
      join(process.cwd(), "src/knowledge/index.ts"),
      "utf-8",
    );
    expect(source).toContain("ingestSprintHistory");
    expect(source).toContain("chunkDocument");
    expect(source).toContain("embedTextBatch");
    expect(source).toContain("getMilvusClient");
    expect(source).toContain("ensureKnowledgeCollection");
  });

  it("knowledge-handlers.cjs contains normalizeHit and toScoreNumber", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/ipc/knowledge-handlers.cjs"),
      "utf-8",
    );
    expect(source).toContain("normalizeHit");
    expect(source).toContain("toScoreNumber");
    expect(source).toContain("knowledge:ingest");
    expect(source).toContain("knowledge:search");
  });

  it("handlers.cjs llm:ask block contains RAG retrieval", () => {
    const source = readFileSync(join(process.cwd(), "electron-ui/ipc/handlers.cjs"), "utf-8");
    expect(source).toContain("embedTextBatch");
    expect(source).toContain("knowledge_chunks");
    expect(source).toContain("PROJECT CONTEXT");
    expect(source).toContain("knowledgeHits");
    expect(source).toContain("score >= 0.4");
  });

  it("handlers.cjs RAG retrieval is wrapped in try/catch", () => {
    const source = readFileSync(join(process.cwd(), "electron-ui/ipc/handlers.cjs"), "utf-8");
    expect(source).toContain("knowledgeHits = []");
    expect(source).toContain("catch");
  });

  it("preload exposes buildPromptContext on workspaceKnowledge", () => {
    const source = readFileSync(join(process.cwd(), "electron-ui/preload.cjs"), "utf-8");
    expect(source).toContain("buildPromptContext");
    expect(source).toContain("knowledge:search");
  });

  it("preload preserves Sprint 42 workspaceKnowledge methods", () => {
    const source = readFileSync(join(process.cwd(), "electron-ui/preload.cjs"), "utf-8");
    expect(source).toContain("knowledge:ingest");
    expect(source).toContain("knowledge:search");
  });

  it("types.d.ts declares buildPromptContext on workspaceKnowledge", () => {
    const source = readFileSync(join(process.cwd(), "src/ui/types.d.ts"), "utf-8");
    expect(source).toContain("buildPromptContext");
  });

  it("types.d.ts llm.ask return type includes optional knowledge array", () => {
    const source = readFileSync(join(process.cwd(), "src/ui/types.d.ts"), "utf-8");
    expect(source).toContain("knowledge?:");
    expect(source).toContain("chunk_id: string");
    expect(source).toContain("score: number");
  });

  it("main.cjs still registers audit handlers — no regression", () => {
    const source = readFileSync(join(process.cwd(), "electron-ui/main.cjs"), "utf-8");
    expect(source).toContain("registerAuditHandlers");
  });

  it("main.cjs still registers knowledge handlers — no regression", () => {
    const source = readFileSync(join(process.cwd(), "electron-ui/main.cjs"), "utf-8");
    expect(source).toContain("registerKnowledgeHandlers");
  });

  it("audit-handlers.cjs still exposes Sprint 38 audit exports — no regression", () => {
    const source = readFileSync(join(process.cwd(), "electron-ui/ipc/audit-handlers.cjs"), "utf-8");
    expect(source).toContain("audit:exportJson");
    expect(source).toContain("audit:exportHtmlReport");
  });

  it("Sprint 42 knowledge schema files still exist", () => {
    expect(existsSync(join(process.cwd(), "src/knowledge/schema/documents.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/knowledge/schema/metadata.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/knowledge/ingest/ingest-sprint-history.ts"))).toBe(true);
  });
});
