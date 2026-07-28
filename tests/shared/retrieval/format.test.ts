/**
 * tests/shared/retrieval/format.test.ts
 *
 * Unit tests for src/shared/retrieval/format.ts
 *
 * Covers:
 *   - formatVectorResults: empty array, single item, multiple items
 *   - formatCodeHits: empty array, single item, multiple items
 *   - formatSymbolResults: empty array, single item, multiple items (lines 61-68)
 *   - formatConceptCard: null card, minimal card, card with signature,
 *       card with callers, card with callees, card with all fields (lines 84-103)
 */

import { describe, it, expect } from "vitest";
import {
  formatVectorResults,
  formatCodeHits,
  formatSymbolResults,
  formatConceptCard,
} from "../../../src/shared/retrieval/format.js";

describe("formatVectorResults", () => {
  it("returns empty string for empty array", () => {
    expect(formatVectorResults([])).toBe("");
  });

  it("formats a single result correctly", () => {
    const results = [{ score: 0.953, source: "src/agents/runner.ts", text: "The agent loop implementation" }];
    const output = formatVectorResults(results);
    expect(output).toBe("1. [score: 0.953] src/agents/runner.ts\n   The agent loop implementation");
  });

  it("formats multiple results as numbered list separated by blank lines", () => {
    const results = [
      { score: 0.9, source: "src/foo.ts", text: "foo text" },
      { score: 0.7, source: "src/bar.ts", text: "bar text" },
    ];
    const output = formatVectorResults(results);
    expect(output).toBe(
      "1. [score: 0.900] src/foo.ts\n   foo text\n\n2. [score: 0.700] src/bar.ts\n   bar text",
    );
  });

  it("formats score to 3 decimal places", () => {
    const results = [{ score: 1, source: "x.ts", text: "y" }];
    expect(formatVectorResults(results)).toContain("[score: 1.000]");
  });
});

describe("formatCodeHits", () => {
  it("returns empty string for empty array", () => {
    expect(formatCodeHits([])).toBe("");
  });

  it("formats a single hit as file:line: text", () => {
    const hits = [{ file: "src/foo.ts", line: 42, text: "export function foo()" }];
    expect(formatCodeHits(hits)).toBe("src/foo.ts:42: export function foo()");
  });

  it("formats multiple hits joined by newlines", () => {
    const hits = [
      { file: "src/a.ts", line: 1, text: "line one" },
      { file: "src/b.ts", line: 99, text: "line two" },
    ];
    expect(formatCodeHits(hits)).toBe("src/a.ts:1: line one\nsrc/b.ts:99: line two");
  });
});

describe("formatSymbolResults", () => {
  it("returns empty string for empty array", () => {
    expect(formatSymbolResults([])).toBe("");
  });

  it("formats a single symbol result", () => {
    const results = [
      {
        name: "runSubAgent",
        kind: "function",
        filePath: "src/agents/runner.ts",
        startLine: 10,
        endLine: 25,
      },
    ];
    const output = formatSymbolResults(results);
    expect(output).toBe("runSubAgent (function) at src/agents/runner.ts:10-25");
  });

  it("formats multiple symbol results joined by newlines", () => {
    const results = [
      {
        name: "SubAgent",
        kind: "class",
        filePath: "src/agents/sub-agent.ts",
        startLine: 1,
        endLine: 50,
      },
      {
        name: "execute",
        kind: "method",
        filePath: "src/agents/sub-agent.ts",
        startLine: 20,
        endLine: 35,
      },
    ];
    const output = formatSymbolResults(results);
    expect(output).toBe(
      "SubAgent (class) at src/agents/sub-agent.ts:1-50\nexecute (method) at src/agents/sub-agent.ts:20-35",
    );
  });

  it("includes signature field if present (does not use it in format output)", () => {
    // formatSymbolResults does not output the signature — verify the format
    // remains correct even when signature is present in the input object
    const results = [
      {
        name: "vectorSearch",
        kind: "function",
        filePath: "src/shared/retrieval/vector-client.ts",
        startLine: 100,
        endLine: 140,
        signature: "(query: string, topK?: number) => Promise<VectorSearchResult[]>",
      },
    ];
    const output = formatSymbolResults(results);
    expect(output).toBe(
      "vectorSearch (function) at src/shared/retrieval/vector-client.ts:100-140",
    );
    // signature is not in the formatted output
    expect(output).not.toContain("signature");
  });
});


// ─── formatConceptCard ────────────────────────────────────────────────────────

describe("formatConceptCard", () => {
  it("returns empty string for null card", () => {
    expect(formatConceptCard(null)).toBe("");
  });

  it("formats a minimal card with no signature, callers, or callees", () => {
    const card = {
      name: "formatName",
      kind: "function" as const,
      file: "src/shared/retrieval/format.ts",
      line: 25,
      signature: undefined,
      params: undefined,
      callers: [],
      callees: [],
      charCount: 100,
    };
    const output = formatConceptCard(card);
    expect(output).toBe("formatName (function) at src/shared/retrieval/format.ts:25");
  });

  it("includes signature when present", () => {
    const card = {
      name: "buildGraph",
      kind: "function" as const,
      file: "src/shared/retrieval/graph-builder.ts",
      line: 42,
      signature: "function buildGraph(rootFiles: string[], projectRoot: string): SymbolGraph",
      params: ["rootFiles", "projectRoot"],
      callers: [],
      callees: [],
      charCount: 200,
    };
    const output = formatConceptCard(card);
    const lines = output.split("\n");
    expect(lines[0]).toBe("buildGraph (function) at src/shared/retrieval/graph-builder.ts:42");
    expect(lines[1]).toBe("  function buildGraph(rootFiles: string[], projectRoot: string): SymbolGraph");
  });

  it("includes callers when present", () => {
    const card = {
      name: "formatName",
      kind: "function" as const,
      file: "src/utils.ts",
      line: 10,
      signature: undefined,
      params: undefined,
      callers: ["src/service.ts#greetUser", "src/processor.ts#validateName"],
      callees: [],
      charCount: 150,
    };
    const output = formatConceptCard(card);
    expect(output).toContain("callers: src/service.ts#greetUser, src/processor.ts#validateName");
  });

  it("includes callees when present", () => {
    const card = {
      name: "processUsers",
      kind: "function" as const,
      file: "src/processor.ts",
      line: 5,
      signature: undefined,
      params: undefined,
      callers: [],
      callees: ["src/service.ts#UserService.listUsers", "src/service.ts#greetUser"],
      charCount: 180,
    };
    const output = formatConceptCard(card);
    expect(output).toContain("callees: src/service.ts#UserService.listUsers, src/service.ts#greetUser");
  });

  it("formats a card with all fields populated", () => {
    const card = {
      name: "lookupSymbol",
      kind: "function" as const,
      file: "src/shared/retrieval/graph-lookup.ts",
      line: 190,
      signature: "function lookupSymbol(name: string, graph: SymbolGraph): ConceptCard | null",
      params: ["name", "graph"],
      callers: ["src/shared/retrieval/router.ts#retrieve"],
      callees: ["src/shared/retrieval/graph-lookup.ts#parseSymbolQuery", "src/shared/retrieval/graph-lookup.ts#buildCard"],
      charCount: 350,
    };
    const output = formatConceptCard(card);
    const lines = output.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("lookupSymbol (function) at src/shared/retrieval/graph-lookup.ts:190");
    expect(lines[1]).toContain("function lookupSymbol");
    expect(lines[2]).toContain("callers: src/shared/retrieval/router.ts#retrieve");
    expect(lines[3]).toContain("callees:");
  });

  it("does NOT include callers line when callers is empty", () => {
    const card = {
      name: "isEmpty",
      kind: "function" as const,
      file: "src/utils.ts",
      line: 15,
      signature: undefined,
      params: undefined,
      callers: [],
      callees: ["src/utils.ts#capitalize"],
      charCount: 80,
    };
    const output = formatConceptCard(card);
    expect(output).not.toContain("callers:");
    expect(output).toContain("callees: src/utils.ts#capitalize");
  });

  it("does NOT include callees line when callees is empty", () => {
    const card = {
      name: "capitalize",
      kind: "function" as const,
      file: "src/utils.ts",
      line: 5,
      signature: undefined,
      params: undefined,
      callers: ["src/utils.ts#formatName"],
      callees: [],
      charCount: 70,
    };
    const output = formatConceptCard(card);
    expect(output).toContain("callers: src/utils.ts#formatName");
    expect(output).not.toContain("callees:");
  });
});
