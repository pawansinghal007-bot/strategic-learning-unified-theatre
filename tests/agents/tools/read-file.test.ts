/**
 * tests/agents/tools/read-file.test.ts
 *
 * Unit tests for src/agents/tools/read-file.ts
 * Covers all branches:
 *   - absolute vs relative path resolution
 *   - file within MAX_LINES (≤500) — returns full content
 *   - file exceeding MAX_LINES (>500) — truncation branch
 *   - read error with Error instance  → err.message
 *   - read error with non-Error value → String(error)  [line 43 false branch]
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "node:path";

// ─── hoisted mocks ────────────────────────────────────────────────────────────
// read-file.ts does `import * as fs from "node:fs"`.
// The namespace object's properties are non-configurable, so vi.spyOn on a
// live import fails.  We hoist a controlled mock so every call to
// fs.readFileSync inside the module under test goes through mockReadFileSync.

const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real, readFileSync: mockReadFileSync };
});

// ─── module under test ────────────────────────────────────────────────────────
// Import after the mock is registered so the hoisted mock is in place.
import { readFileTool } from "../../../src/agents/tools/read-file";

// ─── tests ────────────────────────────────────────────────────────────────────

describe("readFileTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── metadata ───────────────────────────────────────────────────────────────

  it("exposes the correct tool name and description", () => {
    expect(readFileTool.name).toBe("read-file");
    expect(readFileTool.description).toContain("read-file");
  });

  // ── absolute path ──────────────────────────────────────────────────────────

  it("reads a file at an absolute path and returns its content", async () => {
    mockReadFileSync.mockReturnValueOnce("hello world");

    const result = await readFileTool.execute({ path: "/abs/hello.txt" });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("read-file");
    expect(result.output).toBe("hello world");
    expect(result.error).toBeUndefined();
    // Absolute path must be passed through as-is
    expect(mockReadFileSync).toHaveBeenCalledWith("/abs/hello.txt", "utf8");
  });

  // ── relative path ──────────────────────────────────────────────────────────

  it("joins a relative path against PROJECT_ROOT", async () => {
    const origRoot = process.env.PROJECT_ROOT;
    process.env.PROJECT_ROOT = "/my/project";
    vi.resetModules();

    try {
      mockReadFileSync.mockReturnValueOnce("relative content");
      const { readFileTool: freshTool } = await import(
        "../../../src/agents/tools/read-file"
      );

      const result = await freshTool.execute({ path: "src/foo.ts" });

      expect(result.success).toBe(true);
      expect(result.output).toBe("relative content");
      // Should be called with the joined absolute path
      const expectedPath = path.join("/my/project", "src/foo.ts");
      expect(mockReadFileSync).toHaveBeenCalledWith(expectedPath, "utf8");
    } finally {
      if (origRoot === undefined) delete process.env.PROJECT_ROOT;
      else process.env.PROJECT_ROOT = origRoot;
    }
  });

  // ── within-limit read ──────────────────────────────────────────────────────

  it("returns full content when file has ≤500 lines (no truncation)", async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
    mockReadFileSync.mockReturnValueOnce(lines.join("\n"));

    const result = await readFileTool.execute({ path: "/fake/exact500.txt" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("line 1");
    expect(result.output).toContain("line 500");
    expect(result.output).not.toContain("[TRUNCATED");
  });

  it("returns full content when file has fewer than 500 lines", async () => {
    mockReadFileSync.mockReturnValueOnce("just a few lines\nsecond line");

    const result = await readFileTool.execute({ path: "/fake/small.txt" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("just a few lines");
    expect(result.output).not.toContain("[TRUNCATED");
  });

  // ── truncation branch ──────────────────────────────────────────────────────

  it("truncates to 500 lines and appends notice when file exceeds 500 lines", async () => {
    // 501 lines → lines.length (501) > MAX_LINES (500) → truncation path
    const lines = Array.from({ length: 501 }, (_, i) => `line ${i + 1}`);
    mockReadFileSync.mockReturnValueOnce(lines.join("\n"));

    const result = await readFileTool.execute({ path: "/fake/large.txt" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("line 1");
    expect(result.output).toContain("line 500");
    // line 501 must not appear as content (only in the truncation notice number)
    const outputLines = result.output.split("\n");
    expect(outputLines).not.toContain("line 501");
    expect(result.output).toContain("[TRUNCATED");
    expect(result.output).toContain("501 lines");
    expect(result.output).toContain("showing first 500");
  });

  // ── error: Error instance ──────────────────────────────────────────────────

  it("returns failure with err.message when readFileSync throws an Error instance", async () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    const result = await readFileTool.execute({ path: "/no/such/file.txt" });

    expect(result.success).toBe(false);
    expect(result.toolName).toBe("read-file");
    expect(result.output).toBe("");
    expect(result.error).toMatch(/Failed to read file:/);
    // err.message branch: the Error's message is included
    expect(result.error).toContain("ENOENT: no such file or directory");
  });

  // ── error: non-Error value — line 43 false branch ─────────────────────────

  it("uses String(error) when readFileSync throws a non-Error value (line 43 false branch)", async () => {
    mockReadFileSync.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "raw string failure"; // plain string — not an Error instance
    });

    const result = await readFileTool.execute({ path: "/fake/any.txt" });

    expect(result.success).toBe(false);
    expect(result.output).toBe("");
    expect(result.error).toMatch(/Failed to read file:/);
    // String(error) path on line 43 — includes the raw thrown value
    expect(result.error).toContain("raw string failure");
  });

  it("uses String(error) when readFileSync throws a numeric value (line 43 false branch — numeric)", async () => {
    mockReadFileSync.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 42; // not an Error — String(42) = "42"
    });

    const result = await readFileTool.execute({ path: "/fake/numeric.txt" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to read file:/);
    expect(result.error).toContain("42");
  });
});
