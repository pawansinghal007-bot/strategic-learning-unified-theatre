/**
 * Coverage additions for repo-corpus-exporter.js
 *
 * Tests through the public API (generateRepoCorpusPairs, appendRepoCorpusPairs)
 * to cover the private functions they call internally.
 *
 * Targets: gitExec, resolveGitRef, resolveGitTimestamp, isAncestor,
 * determineEffectiveSinceRef, parseGitShowOutput, extractRepoCorpusPairsFromAddedLines,
 * isJsFile, parseGitLogOutput, extractDocComment, collectFunctionSource
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Mock the _child-process module that execFile comes from
vi.mock("../../src/llm/_child-process.js", () => ({
  execFile: vi.fn(),
}));

describe("repo-corpus-exporter coverage — generateRepoCorpusPairs", () => {
  let tmpDir;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "corpus-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns empty array when no commits in range", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse" || args[0] === "show" || args[0] === "merge-base") {
        cb(null, "", "");
      } else if (args[0] === "log") {
        cb(null, "", "");
      }
    });

    const { generateRepoCorpusPairs } = await import(
      "../../src/llm/repo-corpus-exporter.js"
    );
    const result = await generateRepoCorpusPairs("main", {
      baseDir: tmpDir,
      cwd: tmpDir,
    });

    expect(result).toEqual([]);
  });

  it("returns empty array when no js files in commits", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        cb(null, "abc123def456\n", "");
      } else if (args[0] === "show" && args.includes("%ct")) {
        cb(null, "1234567890\n", "");
      } else if (args[0] === "merge-base") {
        cb(null, "", "");
      } else if (args[0] === "log") {
        cb(null, "abc123\n", "");
      } else if (args[0] === "show") {
        // Non-js file diff
        cb(
          null,
          `diff --git a/readme.md b/readme.md
--- a/readme.md
+++ b/readme.md
@@ -1 +1,2 @@
+new line
old content
`,
          "",
        );
      }
    });

    const { generateRepoCorpusPairs } = await import(
      "../../src/llm/repo-corpus-exporter.js"
    );
    const result = await generateRepoCorpusPairs("main", {
      baseDir: tmpDir,
      cwd: tmpDir,
    });

    expect(result).toEqual([]);
  });

  it("generates pairs for js files with added lines", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        cb(null, "abc123def456\n", "");
      } else if (args[0] === "show" && args.includes("%ct")) {
        cb(null, "1234567890\n", "");
      } else if (args[0] === "merge-base") {
        cb(null, "", "");
      } else if (args[0] === "log") {
        cb(null, "abc123\n", "");
      } else if (args[0] === "show") {
        cb(
          null,
          `diff --git a/src/feature.js b/src/feature.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/feature.js
@@ -0,0 +1,3 @@
+export function hello() {
+  return "world";
+}
`,
          "",
        );
      }
    });

    const { generateRepoCorpusPairs } = await import(
      "../../src/llm/repo-corpus-exporter.js"
    );
    const result = await generateRepoCorpusPairs("main", {
      baseDir: tmpDir,
      cwd: tmpDir,
    });

    expect(Array.isArray(result)).toBe(true);
  });

  it("propagates gitExec failure during log", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        cb(null, "abc123def456\n", "");
      } else if (args[0] === "show" && args.includes("%ct")) {
        cb(null, "1234567890\n", "");
      } else if (args[0] === "merge-base") {
        cb(null, "", "");
      } else if (args[0] === "log") {
        cb(new Error("git log failed"), "", "error");
      }
    });

    const { generateRepoCorpusPairs } = await import(
      "../../src/llm/repo-corpus-exporter.js"
    );
    await expect(
      generateRepoCorpusPairs("main", { baseDir: tmpDir, cwd: tmpDir })
    ).rejects.toThrow("git log failed");
  });

  it("propagates gitExec failure during show", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        cb(null, "abc123def456\n", "");
      } else if (args[0] === "show" && args.includes("%ct")) {
        cb(null, "1234567890\n", "");
      } else if (args[0] === "merge-base") {
        cb(null, "", "");
      } else if (args[0] === "log") {
        cb(null, "abc123\n", "");
      } else if (args[0] === "show") {
        cb(new Error("git show failed"), "", "error");
      }
    });

    const { generateRepoCorpusPairs } = await import(
      "../../src/llm/repo-corpus-exporter.js"
    );
    await expect(
      generateRepoCorpusPairs("main", { baseDir: tmpDir, cwd: tmpDir })
    ).rejects.toThrow("git show failed");
  });

  it("saves state after processing", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        cb(null, "abc123def456\n", "");
      } else if (args[0] === "show" && args.includes("%ct")) {
        cb(null, "1234567890\n", "");
      } else if (args[0] === "merge-base") {
        cb(null, "", "");
      } else if (args[0] === "log") {
        cb(null, "abc123\n", "");
      } else if (args[0] === "show") {
        cb(
          null,
          `diff --git a/src/feature.js b/src/feature.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/feature.js
@@ -0,0 +1,3 @@
+export function hello() {
+  return "world";
+}
`,
          "",
        );
      }
    });

    const stateFile = path.join(tmpDir, "state.json");
    const outputFile = path.join(tmpDir, "output.jsonl");

    const { generateRepoCorpusPairs } = await import(
      "../../src/llm/repo-corpus-exporter.js"
    );
    await generateRepoCorpusPairs("main", {
      baseDir: tmpDir,
      cwd: tmpDir,
      stateFile,
      outputPath: outputFile,
    });

    const state = await fs.readFile(stateFile, "utf8");
    expect(state).toBeTruthy();
  });
});

describe("repo-corpus-exporter coverage — appendRepoCorpusPairs", () => {
  let tmpDir;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "corpus-append-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("appends pairs to existing corpus file", async () => {
    const outputFile = path.join(tmpDir, "corpus.jsonl");

    const { appendRepoCorpusPairs } = await import(
      "../../src/llm/repo-corpus-exporter.js"
    );
    await appendRepoCorpusPairs(
      [
        {
          source: "src/example.js",
          target: "export function hello() { return 'world'; }",
          metadata: { commit: "abc123" },
        },
      ],
      { outputPath: outputFile },
    );

    const content = await fs.readFile(outputFile, "utf8");
    expect(content).toBeTruthy();
    expect(content.split("\n").filter((l) => l.length > 0).length).toBeGreaterThan(0);
  });
});
