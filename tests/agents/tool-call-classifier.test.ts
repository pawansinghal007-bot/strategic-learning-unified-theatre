/**
 * tests/agents/tool-call-classifier.test.ts
 *
 * Unit tests for src/agents/tool-call-classifier.ts
 * Pure-function classifier for tool calls.
 */

import { describe, it, expect } from "vitest";
import {
  classifyToolCall,
  type ToolCallClass,
} from "../../src/agents/tool-call-classifier";

type ClassResult = ToolCallClass;

describe("classifyToolCall", () => {
  // ─── path-like ─────────────────────────────────────────────────────────────

  describe('"path-like" classification', () => {
    it('classifies read-file with plain relative path as "path-like"', () => {
      const result = classifyToolCall("read-file", { path: "src/foo.ts" });
      expect(result).toBe("path-like");
    });

    it('classifies read-file with plain absolute path as "path-like"', () => {
      const result = classifyToolCall("read-file", {
        path: "/home/user/project/src/foo.ts",
      });
      expect(result).toBe("path-like");
    });

    it('classifies read-file with ./ prefix as "path-like"', () => {
      const result = classifyToolCall("read-file", { path: "./src/foo.ts" });
      expect(result).toBe("path-like");
    });

    it('classifies read-file with ../ prefix as "path-like"', () => {
      const result = classifyToolCall("read-file", {
        path: "../shared/utils.ts",
      });
      expect(result).toBe("path-like");
    });

    it('classifies read-file with filePath alias as "path-like"', () => {
      const result = classifyToolCall("read-file", {
        filePath: "lib/index.js",
      });
      expect(result).toBe("path-like");
    });

    it('classifies read-file with file alias as "path-like"', () => {
      const result = classifyToolCall("read-file", { file: "config.yaml" });
      expect(result).toBe("path-like");
    });

    it('classifies read-file with Windows-style path as "path-like"', () => {
      const result = classifyToolCall("read-file", {
        path: "C:\\Users\\user\\project\\src\\foo.ts",
      });
      expect(result).toBe("path-like");
    });

    it('does not classify read-file with wildcard as "path-like"', () => {
      const result = classifyToolCall("read-file", { path: "src/**/*.ts" });
      expect(result).toBe("synthesis");
    });

    it('does not classify read-file with space in path as "path-like"', () => {
      const result = classifyToolCall("read-file", { path: "src/my file.ts" });
      expect(result).toBe("synthesis");
    });

    it('does not classify read-file with no path arg as "path-like"', () => {
      const result = classifyToolCall("read-file", { other: "value" });
      expect(result).toBe("synthesis");
    });
  });

  // ─── symbol-like ───────────────────────────────────────────────────────────

  describe('"symbol-like" classification', () => {
    it('classifies search-code with single identifier as "symbol-like"', () => {
      const result = classifyToolCall("search-code", { query: "myFunction" });
      expect(result).toBe("symbol-like");
    });

    it('classifies search-code with underscore identifier as "symbol-like"', () => {
      const result = classifyToolCall("search-code", {
        query: "my_function_name",
      });
      expect(result).toBe("symbol-like");
    });

    it('classifies search-code with dotted qualified name as "symbol-like"', () => {
      const result = classifyToolCall("search-code", {
        query: "namespace.ClassName",
      });
      expect(result).toBe("symbol-like");
    });

    it('classifies search-code with multi-level dotted name as "symbol-like"', () => {
      const result = classifyToolCall("search-code", {
        query: "com.example.module.functionName",
      });
      expect(result).toBe("symbol-like");
    });

    it('classifies search-code with pattern alias as "symbol-like"', () => {
      const result = classifyToolCall("search-code", {
        pattern: "MyClass.method",
      });
      expect(result).toBe("symbol-like");
    });

    it('does not classify search-code with space as "symbol-like"', () => {
      const result = classifyToolCall("search-code", { query: "my function" });
      expect(result).toBe("semantic");
    });

    it('does not classify search-code with natural language as "symbol-like"', () => {
      const result = classifyToolCall("search-code", {
        query: "find the user handler",
      });
      expect(result).toBe("semantic");
    });

    it('does not classify search-code with special chars as "symbol-like"', () => {
      const result = classifyToolCall("search-code", { query: "my-function" });
      expect(result).toBe("semantic");
    });

    it('does not classify search-code with empty query as "symbol-like"', () => {
      const result = classifyToolCall("search-code", { query: "" });
      expect(result).toBe("semantic");
    });
  });

  // ─── semantic ──────────────────────────────────────────────────────────────

  describe('"semantic" classification', () => {
    it('classifies vector-search as "semantic"', () => {
      const result = classifyToolCall("vector-search", {
        query: "user authentication",
      });
      expect(result).toBe("semantic");
    });

    it('classifies vector-search with empty args as "semantic"', () => {
      const result = classifyToolCall("vector-search", {});
      expect(result).toBe("semantic");
    });

    it('classifies search-code with spaces as "semantic"', () => {
      const result = classifyToolCall("search-code", {
        query: "handle user login",
      });
      expect(result).toBe("semantic");
    });

    it('classifies search-code with natural language as "semantic"', () => {
      const result = classifyToolCall("search-code", {
        query: "find all functions that validate input",
      });
      expect(result).toBe("semantic");
    });
  });

  // ─── synthesis ─────────────────────────────────────────────────────────────

  describe('"synthesis" classification', () => {
    it('classifies read-file with wildcard as "synthesis"', () => {
      const result = classifyToolCall("read-file", { path: "src/**/*.ts" });
      expect(result).toBe("synthesis");
    });

    it('classifies read-file with spaces as "synthesis"', () => {
      const result = classifyToolCall("read-file", { path: "src/my file.ts" });
      expect(result).toBe("synthesis");
    });

    it('classifies read-file with no path as "synthesis"', () => {
      const result = classifyToolCall("read-file", { other: "value" });
      expect(result).toBe("synthesis");
    });

    it('classifies search-code with special chars as "synthesis"', () => {
      const result = classifyToolCall("search-code", { query: "my-function" });
      expect(result).toBe("semantic");
    });

    it('classifies unknown tool as "synthesis"', () => {
      const result = classifyToolCall("unknown-tool", { arg: "value" });
      expect(result).toBe("synthesis");
    });

    it('classifies multi-arg tool as "synthesis"', () => {
      const result = classifyToolCall("read-file", {
        path: "src/foo.ts",
        range: "10-20",
      });
      expect(result).toBe("path-like");
    });

    it('classifies search-code with single identifier and extra args as "symbol-like"', () => {
      const result = classifyToolCall("search-code", {
        query: "myFunction",
        context: "5",
      });
      expect(result).toBe("symbol-like");
    });
  });

  // ─── edge cases ────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty toolName gracefully", () => {
      const result = classifyToolCall("", { path: "src/foo.ts" });
      expect(result).toBe("synthesis");
    });

    it("handles empty args object gracefully", () => {
      const result = classifyToolCall("vector-search", {});
      expect(result).toBe("semantic");
    });

    it("handles undefined args gracefully", () => {
      const result = classifyToolCall("read-file", undefined as any);
      expect(result).toBe("synthesis");
    });

    it("handles null args gracefully", () => {
      const result = classifyToolCall("read-file", null as any);
      expect(result).toBe("synthesis");
    });
  });
});
