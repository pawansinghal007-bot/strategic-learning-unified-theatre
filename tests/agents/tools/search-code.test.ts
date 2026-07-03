/**
 * tests/agents/tools/search-code.test.ts
 *
 * Unit tests for src/agents/tools/search-code.ts
 *
 * Covers:
 *   - Missing required arg `pattern` → { success: false, error: ... } without calling retrieval
 *   - Successful call maps hits into file:line: text formatted output
 *   - Empty results case returns a no-matches message
 *   - Optional `glob` arg is forwarded to searchCode
 *   - Thrown error from retrieval layer is caught and surfaced as ToolResult.error
 *   - Path traversal error from resolveGlob is caught and surfaced
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockSearchCode } = vi.hoisted(() => ({
  mockSearchCode: vi.fn(),
}));

vi.mock("../../../src/shared/retrieval/code-search", () => ({
  searchCode: (...args: unknown[]) => mockSearchCode(...args),
}));

// ─── module under test ────────────────────────────────────────────────────────

import { searchCodeTool } from "../../../src/agents/tools/search-code";

// ─── tests ────────────────────────────────────────────────────────────────────

describe("searchCodeTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── metadata ───────────────────────────────────────────────────────────────

  it("has the correct tool name", () => {
    expect(searchCodeTool.name).toBe("search-code");
  });

  it("has a description mentioning ripgrep and usage syntax", () => {
    expect(searchCodeTool.description).toContain("ripgrep");
    expect(searchCodeTool.description).toContain("search-code");
  });

  // ── missing required arg ───────────────────────────────────────────────────

  it("returns success:false when pattern arg is missing", async () => {
    const result = await searchCodeTool.execute({});

    expect(result.success).toBe(false);
    expect(result.toolName).toBe("search-code");
    expect(result.output).toBe("");
    expect(result.error).toMatch(/Missing required arg: pattern/);
  });

  it("does NOT call searchCode when pattern is missing", async () => {
    await searchCodeTool.execute({});

    expect(mockSearchCode).not.toHaveBeenCalled();
  });

  it("returns success:false when pattern is empty string", async () => {
    const result = await searchCodeTool.execute({ pattern: "" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Missing required arg: pattern/);
    expect(mockSearchCode).not.toHaveBeenCalled();
  });

  // ── successful call ────────────────────────────────────────────────────────

  it("returns success:true with formatted hits on successful search", async () => {
    mockSearchCode.mockResolvedValueOnce([
      { file: "src/agents/sub-agent.ts", line: 42, text: "export async function runSubAgent(" },
      { file: "src/agents/cli.ts", line: 15, text: "await runSubAgent(task)" },
    ]);

    const result = await searchCodeTool.execute({ pattern: "runSubAgent" });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("search-code");
    expect(result.output).toContain("src/agents/sub-agent.ts:42: export async function runSubAgent(");
    expect(result.output).toContain("src/agents/cli.ts:15: await runSubAgent(task)");
  });

  it("formats each hit as file:line: text on its own line", async () => {
    mockSearchCode.mockResolvedValueOnce([
      { file: "a.ts", line: 1, text: "first" },
      { file: "b.ts", line: 2, text: "second" },
    ]);

    const result = await searchCodeTool.execute({ pattern: "x" });

    const lines = result.output.split("\n");
    expect(lines[0]).toBe("a.ts:1: first");
    expect(lines[1]).toBe("b.ts:2: second");
  });

  // ── empty results ──────────────────────────────────────────────────────────

  it("returns success:true with a no-matches message when hits is empty", async () => {
    mockSearchCode.mockResolvedValueOnce([]);

    const result = await searchCodeTool.execute({ pattern: "nonexistent_xyz" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("No matches");
    expect(result.output).toContain("nonexistent_xyz");
    expect(result.error).toBeUndefined();
  });

  // ── glob arg forwarding ────────────────────────────────────────────────────

  it("forwards glob arg to searchCode when provided", async () => {
    mockSearchCode.mockResolvedValueOnce([]);

    await searchCodeTool.execute({ pattern: "foo", glob: "src/agents" });

    expect(mockSearchCode).toHaveBeenCalledWith("foo", "src/agents");
  });

  it("passes undefined glob to searchCode when arg is absent", async () => {
    mockSearchCode.mockResolvedValueOnce([]);

    await searchCodeTool.execute({ pattern: "bar" });

    expect(mockSearchCode).toHaveBeenCalledWith("bar", undefined);
  });

  // ── error from retrieval layer ─────────────────────────────────────────────

  it("catches thrown Error from searchCode and returns success:false", async () => {
    mockSearchCode.mockRejectedValueOnce(new Error("rg not found in PATH"));

    const result = await searchCodeTool.execute({ pattern: "foo" });

    expect(result.success).toBe(false);
    expect(result.toolName).toBe("search-code");
    expect(result.output).toBe("");
    expect(result.error).toMatch(/search-code failed:/);
    expect(result.error).toContain("rg not found in PATH");
  });

  it("catches path traversal error from resolveGlob and returns success:false", async () => {
    mockSearchCode.mockRejectedValueOnce(
      new Error("resolveGlob: path \"../../etc\" escapes REPO_ROOT"),
    );

    const result = await searchCodeTool.execute({ pattern: "foo", glob: "../../etc" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/search-code failed:/);
    expect(result.error).toContain("escapes REPO_ROOT");
  });

  it("catches non-Error thrown value and stringifies it", async () => {
    mockSearchCode.mockRejectedValueOnce("string failure");

    const result = await searchCodeTool.execute({ pattern: "x" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("string failure");
  });
});
