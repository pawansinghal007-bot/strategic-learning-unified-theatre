/**
 * storage-coverage.test.ts
 *
 * Targets uncovered lines in src/llm/storage.ts:
 *   31-35 — readJsonFile: file EXISTS but JSON.parse throws → logger.warn + returns fallback
 *   46    — writeJsonFile: writeFileSync throws → logger.error (silently swallowed)
 *
 * Strategy: use real temp directories so existsSync/readFileSync/writeFileSync
 * behave normally, then produce corrupt content or unwriteable paths to trigger
 * the catch blocks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Mock logger so we can assert on warn/error calls without I/O noise
// ---------------------------------------------------------------------------
vi.mock("../../src/shared/logging/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { readJsonFile, writeJsonFile, getStoragePath } from "../../src/llm/storage.js";
import { logger } from "../../src/shared/logging/logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let tempDir: string;

function setDataDir(dir: string) {
  process.env.UNIFIED_AI_DATA_DIR = dir;
}

function clearDataDir() {
  delete process.env.UNIFIED_AI_DATA_DIR;
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-cov-"));
  setDataDir(tempDir);
  vi.clearAllMocks();
});

afterEach(async () => {
  clearDataDir();
  vi.restoreAllMocks();
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readJsonFile — lines 31-35: file exists but JSON.parse throws → warn + fallback
// ---------------------------------------------------------------------------
describe("readJsonFile — corrupt JSON triggers warn + returns fallback (lines 31-35)", () => {
  it("returns fallback when file exists but contains invalid JSON", async () => {
    // Write corrupt JSON directly to the expected storage path
    const fileName = "corrupt.json";
    const filePath = path.join(tempDir, fileName);
    writeFileSync(filePath, "{ invalid json !!!", "utf8");

    const fallback = { default: "value" };
    const result = readJsonFile(fileName, fallback);

    expect(result).toBe(fallback);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "storage.read.failed",
      expect.objectContaining({ fileName }),
    );
  });

  it("includes error message in the warn log", async () => {
    const fileName = "bad-json.json";
    const filePath = path.join(tempDir, fileName);
    writeFileSync(filePath, "not valid json at all", "utf8");

    readJsonFile(fileName, null);

    const warnCall = vi.mocked(logger.warn).mock.calls[0];
    expect(warnCall[0]).toBe("storage.read.failed");
    expect(warnCall[1]).toMatchObject({ fileName });
    expect(typeof (warnCall[1] as any).error).toBe("string");
    expect((warnCall[1] as any).error.length).toBeGreaterThan(0);
  });

  it("returns array fallback when JSON is corrupt", async () => {
    const fileName = "array-file.json";
    writeFileSync(path.join(tempDir, fileName), "][invalid", "utf8");

    const result = readJsonFile<string[]>(fileName, []);
    expect(result).toEqual([]);
  });

  it("returns number fallback when JSON is corrupt", async () => {
    const fileName = "num-file.json";
    writeFileSync(path.join(tempDir, fileName), "oops", "utf8");

    const result = readJsonFile<number>(fileName, 42);
    expect(result).toBe(42);
  });

  it("does NOT call logger.warn when file does not exist (returns fallback silently)", () => {
    const result = readJsonFile("does-not-exist.json", "fallback-string");

    expect(result).toBe("fallback-string");
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
  });

  it("returns parsed value when file exists and JSON is valid", async () => {
    const fileName = "valid.json";
    writeFileSync(
      path.join(tempDir, fileName),
      JSON.stringify({ key: "value" }),
      "utf8",
    );

    const result = readJsonFile<{ key: string }>(fileName, { key: "default" });
    expect(result).toEqual({ key: "value" });
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
  });

  it("returns fallback for empty file (JSON.parse('') throws)", async () => {
    const fileName = "empty.json";
    writeFileSync(path.join(tempDir, fileName), "", "utf8");

    const result = readJsonFile(fileName, "empty-fallback");
    expect(result).toBe("empty-fallback");
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "storage.read.failed",
      expect.objectContaining({ fileName }),
    );
  });

  it("returns fallback for a file with only whitespace", async () => {
    const fileName = "whitespace.json";
    writeFileSync(path.join(tempDir, fileName), "   \n\t  ", "utf8");

    const result = readJsonFile(fileName, { ws: true });
    expect(result).toEqual({ ws: true });
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// writeJsonFile — line 46: writeFileSync throws → logger.error (silently swallowed)
// ---------------------------------------------------------------------------
describe("writeJsonFile — writeFileSync throws → logger.error (line 46)", () => {
  it("does NOT throw when writing to an unwriteable path", () => {
    // Point UNIFIED_AI_DATA_DIR at a path that cannot be written:
    // use a file as the directory (so mkdir succeeds but writeFile into it fails)
    const blockingFile = path.join(tempDir, "blocking-file");
    writeFileSync(blockingFile, "I am a file, not a dir", "utf8");

    // Now set the data dir to a subdirectory of blockingFile — since blockingFile
    // is a FILE, mkdirSync on its subdirectory will fail, which gets caught.
    setDataDir(path.join(blockingFile, "data"));

    expect(() => writeJsonFile("test.json", { x: 1 })).not.toThrow();
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "storage.write.failed",
      expect.objectContaining({ fileName: "test.json" }),
    );
  });

  it("includes error.message in the error log", () => {
    const blockingFile = path.join(tempDir, "block2");
    writeFileSync(blockingFile, "file", "utf8");
    setDataDir(path.join(blockingFile, "sub"));

    writeJsonFile("error-log.json", {});

    const errCall = vi.mocked(logger.error).mock.calls[0];
    expect(errCall).toBeDefined();
    expect(errCall[0]).toBe("storage.write.failed");
    const errArg = errCall[1] as any;
    expect(typeof errArg.error).toBe("string");
    expect(errArg.error.length).toBeGreaterThan(0);
  });

  it("does NOT call logger.error on successful write", async () => {
    writeJsonFile("ok.json", { success: true });
    expect(vi.mocked(logger.error)).not.toHaveBeenCalled();

    // Verify the file was actually written
    const content = await fs.readFile(path.join(tempDir, "ok.json"), "utf8");
    expect(JSON.parse(content)).toEqual({ success: true });
  });

  it("writes valid JSON with 2-space indentation on success", async () => {
    writeJsonFile("pretty.json", { a: 1, b: [1, 2] });
    const content = await fs.readFile(path.join(tempDir, "pretty.json"), "utf8");
    expect(content).toContain("  \"a\": 1");
    expect(JSON.parse(content)).toEqual({ a: 1, b: [1, 2] });
  });
});

// ---------------------------------------------------------------------------
// getStoragePath — basic sanity
// ---------------------------------------------------------------------------
describe("getStoragePath", () => {
  afterEach(() => clearDataDir());

  it("returns path inside UNIFIED_AI_DATA_DIR when env is set", () => {
    setDataDir("/custom/data/dir");
    const result = getStoragePath("my-file.json");
    expect(result).toBe("/custom/data/dir/my-file.json");
  });

  it("returns path inside ~/.unified-ai-workspace when env not set", () => {
    clearDataDir();
    const result = getStoragePath("my-file.json");
    expect(result).toContain("my-file.json");
    expect(result).toContain(".unified-ai-workspace");
  });
});
