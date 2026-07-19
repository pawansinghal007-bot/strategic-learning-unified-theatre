/**
 * src/agents/tool-call-classifier.structural.test.ts
 *
 * Tests for structural query classification — Phase 5, C5.2
 */

import { describe, it, expect } from "vitest";
import { classifyToolCall } from "./tool-call-classifier";

describe("tool-call-classifier — structural queries", () => {
  describe("classifyToolCall — retrieve with structural query", () => {
    it('classifies "what calls formatName" as structural', () => {
      const result = classifyToolCall("retrieve", {
        query: "what calls formatName",
      });
      expect(result).toBe("structural");
    });

    it('classifies "what does formatName call" as structural', () => {
      const result = classifyToolCall("retrieve", {
        query: "what does formatName call",
      });
      expect(result).toBe("structural");
    });

    it('classifies "callers of formatName" as structural', () => {
      const result = classifyToolCall("retrieve", {
        query: "callers of formatName",
      });
      expect(result).toBe("structural");
    });

    it('classifies "callees of formatName" as structural', () => {
      const result = classifyToolCall("retrieve", {
        query: "callees of formatName",
      });
      expect(result).toBe("structural");
    });

    it('classifies "call graph for formatName" as structural', () => {
      const result = classifyToolCall("retrieve", {
        query: "call graph for formatName",
      });
      expect(result).toBe("structural");
    });

    it('classifies "who calls processOrder" as structural', () => {
      const result = classifyToolCall("retrieve", {
        query: "who calls processOrder",
      });
      expect(result).toBe("structural");
    });

    it('classifies "what invokes handleEvent" as structural', () => {
      const result = classifyToolCall("retrieve", {
        query: "what invokes handleEvent",
      });
      expect(result).toBe("structural");
    });

    it('classifies "what does handleEvent invoke" as structural', () => {
      const result = classifyToolCall("retrieve", {
        query: "what does handleEvent invoke",
      });
      expect(result).toBe("structural");
    });
  });

  describe("classifyToolCall — retrieve with explicit mode=graph", () => {
    it('classifies retrieve with mode="graph" as structural', () => {
      const result = classifyToolCall("retrieve", {
        query: "formatName",
        mode: "graph",
      });
      expect(result).toBe("structural");
    });
  });

  describe("classifyToolCall — non-structural queries remain unchanged", () => {
    it('classifies "formatName" as symbol-like', () => {
      const result = classifyToolCall("retrieve", {
        query: "formatName",
      });
      expect(result).toBe("symbol-like");
    });

    it('classifies "src/utils/helpers.ts" as path-like', () => {
      const result = classifyToolCall("retrieve", {
        query: "src/utils/helpers.ts",
      });
      expect(result).toBe("path-like");
    });

    it('classifies "how to implement authentication" as semantic', () => {
      const result = classifyToolCall("retrieve", {
        query: "how to implement authentication",
      });
      expect(result).toBe("semantic");
    });

    it('classifies retrieve with mode="vector" as semantic', () => {
      const result = classifyToolCall("retrieve", {
        query: "authentication flow",
        mode: "vector",
      });
      expect(result).toBe("semantic");
    });
  });

  describe("classifyToolCall — structural query edge cases", () => {
    it("classifies empty query as semantic", () => {
      const result = classifyToolCall("retrieve", {
        query: "",
      });
      expect(result).toBe("semantic");
    });

    it("classifies query with only spaces as semantic", () => {
      const result = classifyToolCall("retrieve", {
        query: "   ",
      });
      expect(result).toBe("semantic");
    });

    it("classifies partial structural pattern as semantic", () => {
      const result = classifyToolCall("retrieve", {
        query: "what calls",
      });
      expect(result).toBe("semantic");
    });

    it("classifies structural-like query with extra words as semantic", () => {
      const result = classifyToolCall("retrieve", {
        query: "what calls formatName and returns the result",
      });
      expect(result).toBe("semantic");
    });
  });

  describe("classifyToolCall — other tools remain unchanged", () => {
    it("classifies read-file with path as path-like", () => {
      const result = classifyToolCall("read-file", {
        path: "src/utils/helpers.ts",
      });
      expect(result).toBe("path-like");
    });

    it("classifies search-code with symbol as symbol-like", () => {
      const result = classifyToolCall("search-code", {
        query: "formatName",
      });
      expect(result).toBe("symbol-like");
    });

    it("classifies vector-search as semantic", () => {
      const result = classifyToolCall("vector-search", {
        query: "authentication flow",
      });
      expect(result).toBe("semantic");
    });
  });
});
