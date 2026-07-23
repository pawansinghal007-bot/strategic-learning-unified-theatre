/**
 * tests/shared/retrieval/graph-lookup.test.ts
 *
 * Phase 4 — Exact-Symbol Lookup API tests.
 *
 * Tests against real repo symbols (not fixtures) and verifies:
 * - lookupSymbol returns correct ConceptCard for known symbols
 * - Unresolved symbols return null, never throw
 * - Card sizes are within budget
 */

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { buildGraph } from "../../../src/shared/retrieval/graph-builder.js";
import {
  lookupSymbol,
  lookupAllSymbols,
  measureCardSize,
  fitsInBudget,
  truncateCard,
} from "../../../src/shared/retrieval/graph-lookup.js";
import {
  ConceptCard,
  CONCEPT_CARD_MAX_CHARS,
} from "../../../src/shared/retrieval/graph-schema.js";

// ─── Real repo graph setup ────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../../../");
const RETRIEVAL_DIR = path.join(REPO_ROOT, "src/shared/retrieval");

// Real source files in the retrieval module
const REAL_FILES = [
  path.join(RETRIEVAL_DIR, "graph-builder.ts"),
  path.join(RETRIEVAL_DIR, "graph-schema.ts"),
  path.join(RETRIEVAL_DIR, "graph-incremental.ts"),
  path.join(RETRIEVAL_DIR, "graph-lookup.ts"),
  path.join(RETRIEVAL_DIR, "symbol-search.ts"),
  path.join(RETRIEVAL_DIR, "router.ts"),
  path.join(RETRIEVAL_DIR, "code-search.ts"),
  path.join(RETRIEVAL_DIR, "format.ts"),
  path.join(RETRIEVAL_DIR, "repository-id.ts"),
  path.join(RETRIEVAL_DIR, "vector-client.ts"),
  path.join(RETRIEVAL_DIR, "execute-retrieve.ts"),
];

let graph: any;

beforeEach(() => {
  graph = buildGraph(REAL_FILES, REPO_ROOT);
});

// ─── Real symbol lookups ──────────────────────────────────────────────────────

describe("lookupSymbol with real repo symbols", () => {
  it("finds buildGraph function", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("buildGraph");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("graph-builder.ts");
    expect(card!.line).toBeGreaterThan(0);
    expect(card!.signature).toBeDefined();
    expect(card!.charCount).toBeGreaterThan(0);
  });

  it("finds lookupSymbol function (self-referential)", () => {
    const card = lookupSymbol("lookupSymbol", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("lookupSymbol");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("graph-lookup.ts");
  });

  it("finds IncrementalGraphBuilder class", () => {
    const card = lookupSymbol("IncrementalGraphBuilder", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("IncrementalGraphBuilder");
    expect(card!.kind).toBe("class");
    expect(card!.file).toContain("graph-incremental.ts");
  });

  it("finds graphChecksum function", () => {
    const card = lookupSymbol("graphChecksum", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("graphChecksum");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("graph-incremental.ts");
  });

  it("finds formatVectorResults function", () => {
    const card = lookupSymbol("formatVectorResults", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("formatVectorResults");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("format.ts");
  });

  it("finds formatCodeHits function", () => {
    const card = lookupSymbol("formatCodeHits", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("formatCodeHits");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("format.ts");
  });

  it("finds formatSymbolResults function", () => {
    const card = lookupSymbol("formatSymbolResults", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("formatSymbolResults");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("format.ts");
  });

  it("finds resolveGlob function", () => {
    const card = lookupSymbol("resolveGlob", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("resolveGlob");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("code-search.ts");
  });

  it("finds getRepositoryId function", () => {
    const card = lookupSymbol("getRepositoryId", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("getRepositoryId");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("repository-id.ts");
  });

  it("finds chooseStrategy function", () => {
    const card = lookupSymbol("chooseStrategy", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("chooseStrategy");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("router.ts");
  });

  it("finds incrementalUpdate function", () => {
    const card = lookupSymbol("incrementalUpdate", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("incrementalUpdate");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("graph-incremental.ts");
  });

  it("finds hashString function", () => {
    const card = lookupSymbol("hashString", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("hashString");
    expect(card!.kind).toBe("function");
    expect(card!.file).toContain("graph-incremental.ts");
  });
});

// ─── Unresolved symbol tests ──────────────────────────────────────────────────

describe("unresolved symbols return null", () => {
  it("returns null for non-existent symbol", () => {
    const card = lookupSymbol("nonExistentSymbol12345", graph);
    expect(card).toBeNull();
  });

  it("returns null for empty string", () => {
    const card = lookupSymbol("", graph);
    expect(card).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    const card = lookupSymbol("   ", graph);
    expect(card).toBeNull();
  });

  it("returns null for partially matching symbol", () => {
    const card = lookupSymbol("buildGra", graph);
    expect(card).toBeNull();
  });

  it("never throws for any input", () => {
    expect(() => lookupSymbol(null as any, graph)).not.toThrow();
    expect(() => lookupSymbol(undefined as any, graph)).not.toThrow();
    expect(() => lookupSymbol(123 as any, graph)).not.toThrow();
  });
});

// ─── ConceptCard structure tests ──────────────────────────────────────────────

describe("ConceptCard structure", () => {
  it("includes callers and callees arrays", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    expect(Array.isArray(card!.callers)).toBe(true);
    expect(Array.isArray(card!.callees)).toBe(true);
  });

  it("includes params for functions with parameters", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    expect(card!.params).toBeDefined();
    expect(Array.isArray(card!.params)).toBe(true);
  });

  it("charCount matches actual serialized content size", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    // charCount is the serialized size of the card content (excluding charCount field)
    const { charCount: _, ...cardContent } = card!;
    const actualSize = JSON.stringify(cardContent, null, 2).length;
    expect(card!.charCount).toBe(actualSize);
  });

  it("charCount is within budget", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    expect(card!.charCount).toBeLessThanOrEqual(CONCEPT_CARD_MAX_CHARS);
  });
});

// ─── Budget enforcement tests ─────────────────────────────────────────────────

describe("budget enforcement", () => {
  it("measureCardSize returns the charCount field value", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    const size = measureCardSize(card!);
    // measureCardSize returns the charCount field (card content size)
    expect(size).toBe(card!.charCount);
    // Verify charCount is the serialized content size (excluding charCount field)
    const { charCount: _, ...cardContent } = card!;
    const contentSize = JSON.stringify(cardContent, null, 2).length;
    expect(size).toBe(contentSize);
  });

  it("fitsInBudget returns true for cards within budget", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    expect(fitsInBudget(card!)).toBe(true);
  });

  it("fitsInBudget returns false for cards exceeding custom budget", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    // Use a very small budget
    expect(fitsInBudget(card!, 10)).toBe(false);
  });

  it("truncateCard reduces card size", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    const originalSize = card!.charCount;

    // Truncate to a small budget
    const truncated = truncateCard(card!, 300);
    expect(truncated.charCount).toBeLessThanOrEqual(300);
    expect(truncated.charCount).toBeLessThan(originalSize);
    // Truncated card should have empty callers/callees and no signature
    expect(truncated.callers).toEqual([]);
    expect(truncated.callees).toEqual([]);
    expect(truncated.signature).toBeUndefined();
  });

  it("truncateCard does not modify original card", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    const originalCallers = [...card!.callers];
    const originalCallees = [...card!.callees];
    const originalSignature = card!.signature;

    const truncated = truncateCard(card!, 200);

    expect(card!.callers).toEqual(originalCallers);
    expect(card!.callees).toEqual(originalCallees);
    expect(card!.signature).toBe(originalSignature);
  });
});

// ─── lookupAllSymbols tests ───────────────────────────────────────────────────

describe("lookupAllSymbols", () => {
  it("returns array of cards for symbols in multiple files", () => {
    const cards = lookupAllSymbols("buildGraph", graph);
    expect(Array.isArray(cards)).toBe(true);
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array for non-existent symbol", () => {
    const cards = lookupAllSymbols("nonExistentSymbol12345", graph);
    expect(cards).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    const cards = lookupAllSymbols("", graph);
    expect(cards).toEqual([]);
  });
});

// ─── Card size benchmark (logged, not asserted) ───────────────────────────────

describe("card size benchmark", () => {
  it("logs average card size for real symbols", () => {
    const symbols = [
      "buildGraph",
      "lookupSymbol",
      "IncrementalGraphBuilder",
      "graphChecksum",
      "formatVectorResults",
      "formatCodeHits",
      "formatSymbolResults",
      "resolveGlob",
      "getRepositoryId",
      "chooseStrategy",
      "incrementalUpdate",
      "hashString",
    ];

    const sizes: number[] = [];
    for (const symbol of symbols) {
      const card = lookupSymbol(symbol, graph);
      if (card) {
        sizes.push(card.charCount);
      }
    }

    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const maxSize = Math.max(...sizes);
    const minSize = Math.min(...sizes);

    console.log(
      `Card sizes: avg=${avgSize.toFixed(0)} chars, min=${minSize}, max=${maxSize}, count=${sizes.length}`,
    );

    // All cards should be within budget
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(size).toBeLessThanOrEqual(CONCEPT_CARD_MAX_CHARS);
    }
  });

  it("compares card size vs full file size", () => {
    const { readFileSync } = require("node:fs");

    // Get the size of graph-builder.ts
    const graphBuilderPath = path.join(RETRIEVAL_DIR, "graph-builder.ts");
    const fullFileContent = readFileSync(graphBuilderPath, "utf-8");
    const fullFileSize = fullFileContent.length;

    // Get the card for buildGraph
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();
    const cardSize = card!.charCount;

    const reductionPercent = ((1 - cardSize / fullFileSize) * 100).toFixed(1);
    console.log(
      `buildGraph card: ${cardSize} chars vs full file: ${fullFileSize} chars (${reductionPercent}% reduction)`,
    );

    // Card should be significantly smaller than the full file
    expect(cardSize).toBeLessThan(fullFileSize);
  });
});



// ─── parseSymbolQuery advanced patterns (lines 31-33, 39) ────────────────────

describe("lookupSymbol with advanced query patterns", () => {
  beforeEach(() => {
    graph = buildGraph(REAL_FILES, REPO_ROOT);
  });

  it("matches symbol by full node ID (file#symbol pattern, lines 31-33)", () => {
    // Query format: "src/shared/retrieval/graph-builder.ts#buildGraph"
    // parseSymbolQuery extracts fileId and symbolName
    // nodeMatches checks exact node.id === `${fileId}#${symbolName}`
    const buildGraphNodeId = graph.nodes.find((n) =>
      n.id.endsWith("#buildGraph") && n.file.includes("graph-builder.ts")
    )?.id;
    expect(buildGraphNodeId).toBeDefined();

    const card = lookupSymbol(buildGraphNodeId!, graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("buildGraph");
  });

  it("matches qualified method name (Class.method pattern, lines 39, 60)", () => {
    // Query format: "IncrementalGraphBuilder.update"
    // parseSymbolQuery sees the ".", returns { symbolName: "IncrementalGraphBuilder.update" }
    // nodeMatches checks node.id.endsWith("#IncrementalGraphBuilder.update")
    const card = lookupSymbol("IncrementalGraphBuilder.update", graph);
    expect(card).not.toBeNull();
    expect(card!.name).toBe("IncrementalGraphBuilder.update");
    expect(card!.kind).toBe("method");
  });
});

// ─── buildCard with budget overflow (lines 122-139) ──────────────────────────

describe("buildCard budget overflow", () => {
  it("returns null when truncated card still exceeds budget (lines 122-139)", () => {
    // Construct a synthetic node with a MASSIVE required field that still
    // exceeds the budget after optional fields are truncated.
    const hugeSignature = "x".repeat(CONCEPT_CARD_MAX_CHARS + 1000);
    const syntheticGraph: any = {
      nodes: [
        {
          id: "huge.ts#hugeFunc",
          kind: "function",
          file: "x".repeat(CONCEPT_CARD_MAX_CHARS + 1000),
          lineRange: [1, 10],
          signature: hugeSignature,
          params: undefined,
        },
      ],
      edges: [],
    };

    // lookupSymbol → buildCard → charCount exceeds CONCEPT_CARD_MAX_CHARS →
    // truncate path: signature=undefined, callers=[], callees=[] →
    // still exceeds → return null (line 136 path)
    const card = lookupSymbol("hugeFunc", syntheticGraph);
    expect(card).toBeNull();
  });

  it("returns truncated card when card exceeds budget but truncated form fits", () => {
    // Build a synthetic graph where the card initially exceeds the budget,
    // but after removing callers/callees and signature, it fits.
    const bigCallers = Array.from({ length: 100 }, (_, i) => `caller${i}`);
    const bigCallees = Array.from({ length: 100 }, (_, i) => `callee${i}`);

    const syntheticGraph: any = {
      nodes: [
        {
          id: "big.ts#bigFunc",
          kind: "function",
          file: "big.ts",
          lineRange: [1, 5],
          signature: "function bigFunc()",
          params: [],
        },
      ],
      edges: [
        ...bigCallers.map((c) => ({
          from: c,
          to: "big.ts#bigFunc",
          kind: "calls",
        })),
        ...bigCallees.map((c) => ({
          from: "big.ts#bigFunc",
          to: c,
          kind: "calls",
        })),
      ],
    };

    const card = lookupSymbol("bigFunc", syntheticGraph);
    // The card should be truncated (no callers, no callees, no signature)
    expect(card).not.toBeNull();
    expect(card!.charCount).toBeLessThanOrEqual(CONCEPT_CARD_MAX_CHARS);
    expect(card!.callers).toEqual([]);
    expect(card!.callees).toEqual([]);
    expect(card!.signature).toBeUndefined();
  });
});

// ─── truncateCard no-op path (line 249) ──────────────────────────────────────

describe("truncateCard when card already fits budget", () => {
  it("returns a copy of the card without modifying it (line 249)", () => {
    const card = lookupSymbol("buildGraph", graph);
    expect(card).not.toBeNull();

    // truncateCard with a budget larger than card.charCount → line 249 path
    const truncated = truncateCard(card!, CONCEPT_CARD_MAX_CHARS + 1000);
    expect(truncated).not.toBe(card); // different object reference (copy)
    expect(truncated.charCount).toBe(card!.charCount);
    expect(truncated.callers).toEqual(card!.callers);
    expect(truncated.callees).toEqual(card!.callees);
    expect(truncated.signature).toBe(card!.signature);
  });
});
