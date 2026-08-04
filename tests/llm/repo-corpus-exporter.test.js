import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/llm/_child-process.js", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "../../src/llm/_child-process.js";
import {
  generateRepoCorpusPairs,
  appendRepoCorpusPairs,
} from "../../src/llm/repo-corpus-exporter.js";

const mockExecFile = vi.mocked(execFile);

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "repo-corpus-exporter-test-"));
}

/**
 * Wire up the execFile mock to use callback-style (cmd, args, options, callback),
 * matching the real node:child_process.execFile signature.
 */
function setupExecFile(responses) {
  mockExecFile.mockImplementation((cmd, args, options, callback) => {
    const key = `${cmd} ${args.join(" ")}`;
    const response = responses[key];
    if (!response) {
      callback(new Error(`Unexpected command: ${key}`));
      return;
    }
    if (response.throw) {
      callback(response.throw);
      return;
    }
    callback(null, response.stdout ?? "", response.stderr ?? "");
  });
}

describe("repo-corpus-exporter", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    mockExecFile.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("extracts one repo-corpus pair from a commit containing a JSDoc-commented function", async () => {
    setupExecFile({
      "git log --format=%H --reverse HEAD": {
        stdout: "abc123\n",
      },
      "git show --unified=0 --no-color abc123": {
        stdout: [
          "diff --git a/src/example.js b/src/example.js",
          "new file mode 100644",
          "index 0000000..1111111",
          "--- /dev/null",
          "+++ b/src/example.js",
          "@@ -0,0 +1,5 @@",
          "+/**",
          "+ * Convert a kebab-case string to camelCase.",
          "+ */",
          "+function toCamelCase(value) {",
          "+  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());",
          "+}",
        ].join("\n"),
      },
    });

    const pairs = await generateRepoCorpusPairs(null, {
      cwd: tempDir,
      baseDir: tempDir,
      stateFile: path.join(tempDir, "repo-corpus-state.json"),
    });

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({
      type: "repo-corpus",
      platform: "git",
      commit_sha: "abc123",
      user: "Convert a kebab-case string to camelCase.",
      assistant: expect.stringContaining("function toCamelCase(value) {"),
      metadata: {
        file: "src/example.js",
        function_name: "toCamelCase",
        signature: "toCamelCase(value)",
        source: "git-diff",
      },
    });

    const stateContent = JSON.parse(
      await fs.readFile(path.join(tempDir, "repo-corpus-state.json"), "utf8"),
    );
    expect(stateContent.lastProcessedRef).toBe("abc123");
  });

  it("skips functions without a preceding JSDoc doc-comment", async () => {
    setupExecFile({
      "git log --format=%H --reverse HEAD": {
        stdout: "def456\n",
      },
      "git show --unified=0 --no-color def456": {
        stdout: [
          "diff --git a/src/other.js b/src/other.js",
          "new file mode 100644",
          "index 0000000..2222222",
          "--- /dev/null",
          "+++ b/src/other.js",
          "@@ -0,0 +1,3 @@",
          "+function noComment(value) {",
          "+  return value.trim();",
          "+}",
        ].join("\n"),
      },
    });

    const pairs = await generateRepoCorpusPairs(null, {
      cwd: tempDir,
      baseDir: tempDir,
      stateFile: path.join(tempDir, "repo-corpus-state.json"),
    });

    expect(pairs).toHaveLength(0);
    const stateContent = JSON.parse(
      await fs.readFile(path.join(tempDir, "repo-corpus-state.json"), "utf8"),
    );
    expect(stateContent.lastProcessedRef).toBe("def456");
  });

  it("returns zero pairs and avoids git show when the stored ref already covers the range", async () => {
    const statePath = path.join(tempDir, "repo-corpus-state.json");
    await fs.writeFile(statePath, JSON.stringify({ lastProcessedRef: "abc123" }), "utf8");

    setupExecFile({
      "git log --format=%H --reverse abc123..HEAD": {
        stdout: "",
      },
    });

    const pairs = await generateRepoCorpusPairs(null, {
      cwd: tempDir,
      baseDir: tempDir,
      stateFile: statePath,
    });

    expect(pairs).toHaveLength(0);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExecFile).toHaveBeenCalledWith(
      "git",
      ["log", "--format=%H", "--reverse", "abc123..HEAD"],
      expect.objectContaining({ maxBuffer: 128 * 1024 * 1024 }),
      expect.any(Function),
    );
  });

  it("appends pairs to the output JSONL file separately", async () => {
    const outputPath = path.join(tempDir, "output.jsonl");
    const resultPath = await appendRepoCorpusPairs(
      [
        {
          type: "repo-corpus",
          platform: "git",
          commit_sha: "abc123",
          user: "Do the thing.",
          assistant: "function doThing() { return true; }",
          metadata: {
            file: "src/example.js",
            function_name: "doThing",
            signature: "doThing()",
            source: "git-diff",
          },
        },
      ],
      { outputPath, baseDir: tempDir },
    );

    expect(resultPath).toBe(outputPath);
    const content = await fs.readFile(outputPath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      type: "repo-corpus",
      platform: "git",
      commit_sha: "abc123",
      user: "Do the thing.",
      assistant: "function doThing() { return true; }",
      metadata: {
        file: "src/example.js",
        function_name: "doThing",
        signature: "doThing()",
        source: "git-diff",
      },
    });
  });
});
