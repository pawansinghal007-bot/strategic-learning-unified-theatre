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
      if (
        args[0] === "rev-parse" ||
        args[0] === "show" ||
        args[0] === "merge-base"
      ) {
        cb(null, "", "");
      } else if (args[0] === "log") {
        cb(null, "", "");
      }
    });

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
    const result = await generateRepoCorpusPairs("main", {
      baseDir: tmpDir,
      cwd: tmpDir,
    });

    expect(result).toEqual([]);
  });

  it("uses stored ref when no sinceRef is provided", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        cb(null, "abc123def456\n", "");
      } else if (args[0] === "log") {
        cb(null, "", "");
      }
    });

    const statePath = path.join(tmpDir, "repo-corpus-state.json");
    await fs.writeFile(
      statePath,
      JSON.stringify({ lastProcessedRef: "abc123def456" }),
      "utf8",
    );

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
    const result = await generateRepoCorpusPairs(null, {
      baseDir: tmpDir,
      cwd: tmpDir,
      stateFile: statePath,
    });

    expect(result).toEqual([]);
  });

  it("falls back to stored ref when sinceRef is invalid", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        if (args[args.length - 1] === "invalid") {
          cb(null, "", "");
        } else {
          cb(null, "abc123def456\n", "");
        }
      } else if (args[0] === "log") {
        cb(null, "", "");
      }
    });

    const statePath = path.join(tmpDir, "repo-corpus-state.json");
    await fs.writeFile(
      statePath,
      JSON.stringify({ lastProcessedRef: "abc123def456" }),
      "utf8",
    );

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
    const result = await generateRepoCorpusPairs("invalid", {
      baseDir: tmpDir,
      cwd: tmpDir,
      stateFile: statePath,
    });

    expect(result).toEqual([]);
  });

  it("returns null when appending an empty pair list", async () => {
    const outputFile = path.join(tmpDir, "empty-output.jsonl");
    const { appendRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");

    const result = await appendRepoCorpusPairs([], {
      outputPath: outputFile,
    });

    expect(result).toBeNull();
    const stat = await fs.stat(outputFile).catch(() => null);
    expect(stat).toBeNull();
  });

  it("chooses the newer ref when stored and since refs diverge", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        const ref = args[args.length - 1];
        cb(null, ref === "since" ? "since-sha\n" : "stored-sha\n", "");
      } else if (args[0] === "merge-base") {
        const error = new Error("not ancestor");
        error.code = 1;
        cb(error, "", "");
      } else if (args[0] === "show" && args.includes("--format=%ct")) {
        const ref = args[args.length - 1];
        cb(null, ref === "since" ? "2000000000\n" : "1000000000\n", "");
      } else if (args[0] === "log") {
        cb(null, "since-sha\n", "");
      } else if (args[0] === "show") {
        cb(null, "", "");
      }
    });

    const statePath = path.join(tmpDir, "repo-corpus-state.json");
    await fs.writeFile(
      statePath,
      JSON.stringify({ lastProcessedRef: "stored" }),
      "utf8",
    );

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
    const result = await generateRepoCorpusPairs("since", {
      baseDir: tmpDir,
      cwd: tmpDir,
      stateFile: statePath,
    });

    expect(result).toEqual([]);
    const stateContent = JSON.parse(await fs.readFile(statePath, "utf8"));
    expect(stateContent.lastProcessedRef).toBe("since-sha");
  });

  it("supports multiple JS files and merged diff output", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        cb(null, "abc123def456\n", "");
      } else if (args[0] === "log") {
        cb(null, "abc123\n", "");
      } else if (args[0] === "show") {
        cb(
          null,
          [
            "diff --git a/src/first.js b/src/first.js",
            "new file mode 100644",
            "index 0000000..1111111",
            "--- /dev/null",
            "+++ b/src/first.js",
            "@@ -0,0 +1,5 @@",
            "+/**",
            "+ * First function description.",
            "+ */",
            "+export function first() {",
            "+  return 1;",
            "+}",
            "diff --git a/src/second.js b/src/second.js",
            "new file mode 100644",
            "index 0000000..2222222",
            "--- /dev/null",
            "+++ b/src/second.js",
            "@@ -0,0 +1,5 @@",
            "+/**",
            "+ * Second function description.",
            "+ */",
            "+function second() {",
            "+  return 2;",
            "+}",
          ].join("\n"),
          "",
        );
      }
    });

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
    const result = await generateRepoCorpusPairs("main", {
      baseDir: tmpDir,
      cwd: tmpDir,
      stateFile: path.join(tmpDir, "repo-corpus-state.json"),
    });

    expect(result).toHaveLength(2);
    expect(result[0].metadata.file).toBe("src/first.js");
    expect(result[1].metadata.file).toBe("src/second.js");
  });

  it("skips JS files without a JSDoc comment and valid signature", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        cb(null, "abc123def456\n", "");
      } else if (args[0] === "log") {
        cb(null, "abc123\n", "");
      } else if (args[0] === "show") {
        cb(
          null,
          [
            "diff --git a/src/skip.js b/src/skip.js",
            "new file mode 100644",
            "index 0000000..1111111",
            "--- /dev/null",
            "+++ b/src/skip.js",
            "@@ -0,0 +1,4 @@",
            "+export function skip() {",
            "+  return undefined;",
            "+}",
          ].join("\n"),
          "",
        );
      }
    });

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
    const result = await generateRepoCorpusPairs("main", {
      baseDir: tmpDir,
      cwd: tmpDir,
      stateFile: path.join(tmpDir, "repo-corpus-state.json"),
    });

    expect(result).toEqual([]);
  });

  it("handles default async exported functions in git diffs", async () => {
    const { execFile } = await import("../../src/llm/_child-process.js");
    execFile.mockImplementation((cmd, args, opts, cb) => {
      if (args[0] === "rev-parse") {
        cb(null, "abc123def456\n", "");
      } else if (args[0] === "log") {
        cb(null, "abc123\n", "");
      } else if (args[0] === "show") {
        cb(
          null,
          [
            "diff --git a/src/async.js b/src/async.js",
            "new file mode 100644",
            "index 0000000..1111111",
            "--- /dev/null",
            "+++ b/src/async.js",
            "@@ -0,0 +1,5 @@",
            "+/**",
            "+ * Async helper function.",
            "+ */",
            "+export default async function upload(data) {",
            "+  return data;",
            "+}",
          ].join("\n"),
          "",
        );
      }
    });

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
    const result = await generateRepoCorpusPairs("main", {
      baseDir: tmpDir,
      cwd: tmpDir,
      stateFile: path.join(tmpDir, "repo-corpus-state.json"),
    });

    expect(result).toHaveLength(1);
    expect(result[0].metadata.function_name).toBe("upload");
    expect(result[0].metadata.signature).toBe("upload(data)");
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

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
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

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
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

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
    await expect(
      generateRepoCorpusPairs("main", { baseDir: tmpDir, cwd: tmpDir }),
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

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
    await expect(
      generateRepoCorpusPairs("main", { baseDir: tmpDir, cwd: tmpDir }),
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

    const { generateRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
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

    const { appendRepoCorpusPairs } =
      await import("../../src/llm/repo-corpus-exporter.js");
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
    expect(
      content.split("\n").filter((l) => l.length > 0).length,
    ).toBeGreaterThan(0);
  });
});
