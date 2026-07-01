/**
 * tests/agents/registry.test.ts
 *
 * Unit tests for src/agents/tools/registry.ts and src/agents/tools/read-file.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

// Each test re-imports the registry after vi.resetModules() to get a clean
// Map state (the module-level `tools` Map is singleton per module instance).

describe("tools registry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getTool returns the built-in read-file tool", async () => {
    const { getTool } = await import("../../src/agents/tools/registry");
    const tool = getTool("read-file");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("read-file");
  });

  it("getTool returns undefined for an unknown tool name", async () => {
    const { getTool } = await import("../../src/agents/tools/registry");
    expect(getTool("does-not-exist")).toBeUndefined();
  });

  it("getToolDescriptions includes the read-file tool description", async () => {
    const { getToolDescriptions } = await import("../../src/agents/tools/registry");
    const desc = getToolDescriptions();
    expect(desc).toContain("read-file");
    expect(desc).toContain("Read a source file");
  });

  it("registerTool makes a new tool retrievable via getTool", async () => {
    const { registerTool, getTool } = await import("../../src/agents/tools/registry");

    const fakeTool = {
      name: "fake-tool",
      description: "A fake tool for testing",
      execute: vi.fn().mockResolvedValue({ toolName: "fake-tool", success: true, output: "fake" }),
    };

    registerTool(fakeTool);
    expect(getTool("fake-tool")).toBe(fakeTool);
  });

  it("registerTool overwrites an existing tool with the same name", async () => {
    const { registerTool, getTool } = await import("../../src/agents/tools/registry");

    const v1 = {
      name: "my-tool",
      description: "version 1",
      execute: vi.fn(),
    };
    const v2 = {
      name: "my-tool",
      description: "version 2",
      execute: vi.fn(),
    };

    registerTool(v1);
    registerTool(v2);

    expect(getTool("my-tool")!.description).toBe("version 2");
  });

  it("getToolDescriptions includes registered tools", async () => {
    const { registerTool, getToolDescriptions } = await import(
      "../../src/agents/tools/registry"
    );

    registerTool({
      name: "my-custom-tool",
      description: "custom description text",
      execute: vi.fn(),
    });

    const desc = getToolDescriptions();
    expect(desc).toContain("my-custom-tool");
    expect(desc).toContain("custom description text");
  });
});

// ─── read-file tool ───────────────────────────────────────────────────────────

describe("read-file tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "read-file-test-"));
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads an existing file and returns its content", async () => {
    const filePath = path.join(tmpDir, "hello.txt");
    fs.writeFileSync(filePath, "hello world");

    const { readFileTool } = await import("../../src/agents/tools/read-file");
    const result = await readFileTool.execute({ path: filePath });

    expect(result.success).toBe(true);
    expect(result.output).toBe("hello world");
    expect(result.toolName).toBe("read-file");
  });

  it("returns failure result when file does not exist", async () => {
    const { readFileTool } = await import("../../src/agents/tools/read-file");
    const result = await readFileTool.execute({
      path: path.join(tmpDir, "nonexistent.ts"),
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to read file/);
    expect(result.output).toBe("");
  });

  it("truncates files exceeding 500 lines", async () => {
    const filePath = path.join(tmpDir, "big.txt");
    const lines = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`);
    fs.writeFileSync(filePath, lines.join("\n"));

    const { readFileTool } = await import("../../src/agents/tools/read-file");
    const result = await readFileTool.execute({ path: filePath });

    expect(result.success).toBe(true);
    expect(result.output).toContain("[TRUNCATED:");
    expect(result.output).toContain("600 lines");
    // Should only contain first 500 lines
    expect(result.output).toContain("line 500");
    expect(result.output).not.toContain("line 501\n");
  });

  it("does not truncate files with exactly 500 lines", async () => {
    const filePath = path.join(tmpDir, "exact.txt");
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
    fs.writeFileSync(filePath, lines.join("\n"));

    const { readFileTool } = await import("../../src/agents/tools/read-file");
    const result = await readFileTool.execute({ path: filePath });

    expect(result.success).toBe(true);
    expect(result.output).not.toContain("[TRUNCATED:");
  });

  it("resolves relative paths against PROJECT_ROOT", async () => {
    const projectRoot = tmpDir;
    process.env.PROJECT_ROOT = projectRoot;
    vi.resetModules(); // reload with updated env

    const filePath = path.join(tmpDir, "relative.txt");
    fs.writeFileSync(filePath, "relative content");

    const { readFileTool } = await import("../../src/agents/tools/read-file");
    const result = await readFileTool.execute({ path: "relative.txt" });

    expect(result.success).toBe(true);
    expect(result.output).toBe("relative content");

    delete process.env.PROJECT_ROOT;
  });
});
