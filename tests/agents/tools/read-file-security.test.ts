/**
 * tests/agents/tools/read-file-security.test.ts
 *
 * Security tests for src/agents/tools/read-file.ts
 * Specifically tests the path traversal guard introduced in Step 2.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "node:path";

// ─── hoisted mocks ────────────────────────────────────────────────────────────
// read-file.ts does `import * as fs from "node:fs"`.
// The namespace object's properties are non-configurable, so vi.spyOn on a
// live import fails.  We hoist a controlled mock so every call to
// fs.readFileSync inside the module under test goes through mockReadFileSync.
// safe-path.ts uses fs.realpathSync, so we must also mock that.

const { mockReadFileSync, mockRealpathSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockRealpathSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    readFileSync: mockReadFileSync,
    realpathSync: mockRealpathSync,
  };
});

// ─── module under test ────────────────────────────────────────────────────────
// Import after the mock is registered so the hoisted mock is in place.
import { readFileTool } from "../../../src/agents/tools/read-file";

// ─── project root for tests ───────────────────────────────────────────────────
// We need to mock realpathSync to return paths within PROJECT_ROOT
// so that tests with fake absolute paths (like /abs/hello.txt) don't escape
const PROJECT_ROOT = process.cwd();

// ─── tests ────────────────────────────────────────────────────────────────────

describe("readFileTool security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock realpathSync to return the input path unchanged (identity function)
    // This allows tests to work with fake paths without requiring them to exist
    // The security check still works because we're comparing resolved paths
    mockRealpathSync.mockImplementation((p) => p);
  });

  // ── relative path inside PROJECT_ROOT ──────────────────────────────────────

  it("succeeds for relative path inside PROJECT_ROOT", async () => {
    const testFilePath = "src/agents/tools/read-file.ts";
    mockReadFileSync.mockReturnValueOnce("hello world");

    const result = await readFileTool.execute({ path: testFilePath });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("read-file");
    expect(result.output).toBe("hello world");
    expect(result.error).toBeUndefined();
    // Relative path should be resolved relative to PROJECT_ROOT
    const expectedPath = path.resolve(PROJECT_ROOT, testFilePath);
    expect(mockReadFileSync).toHaveBeenCalledWith(expectedPath, "utf8");
  });

  // ── relative path with path traversal ───────────────────────────────────────

  it("fails with error for relative path with ../../../etc/passwd traversal", async () => {
    const maliciousPath = "../../../etc/passwd";

    const result = await readFileTool.execute({ path: maliciousPath });

    expect(result.success).toBe(false);
    expect(result.toolName).toBe("read-file");
    expect(result.output).toBe("");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Path escapes project root");
    // File should NOT be read
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  // ── absolute path inside PROJECT_ROOT ──────────────────────────────────────

  it("succeeds for absolute path inside PROJECT_ROOT", async () => {
    const testFilePath = path.resolve(
      __dirname,
      "../../../src/agents/tools/read-file.ts",
    );
    mockReadFileSync.mockReturnValueOnce("hello world");

    const result = await readFileTool.execute({ path: testFilePath });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("read-file");
    expect(result.output).toBe("hello world");
    expect(result.error).toBeUndefined();
    expect(mockReadFileSync).toHaveBeenCalledWith(testFilePath, "utf8");
  });

  // ── absolute path outside PROJECT_ROOT ─────────────────────────────────────

  it("fails with error for absolute path outside PROJECT_ROOT", async () => {
    const maliciousPath = "/etc/hostname";

    const result = await readFileTool.execute({ path: maliciousPath });

    expect(result.success).toBe(false);
    expect(result.toolName).toBe("read-file");
    expect(result.output).toBe("");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Path escapes project root");
    // File should NOT be read
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });
});
