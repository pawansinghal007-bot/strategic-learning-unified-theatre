import fs from "node:fs/promises";
import nodeFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

var spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  __esModule: true,
  default: {
    spawn: (...args) => spawnMock(...args),
  },
  spawn: (...args) => spawnMock(...args),
}));

import {
  detectPython,
  detectRobotFramework,
  generateSkeletonRobotFile,
  enforceTdd,
  assertTddGate,
  listRobotFiles,
  readRobotFile,
  runRobotFile,
  runSuite,
} from "../src/test-runner.js";

function createMockChild({ stdout = "", stderr = "", code = 0 } = {}) {
  return {
    stdout: {
      on(event, cb) {
        if (event === "data") cb(Buffer.from(stdout));
      },
    },
    stderr: {
      on(event, cb) {
        if (event === "data") cb(Buffer.from(stderr));
      },
    },
    on(event, cb) {
      if (event === "close") {
        setTimeout(() => cb(code), 0);
      }
      return this;
    },
  };
}

describe("test-runner", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-runner-"));
    spawnMock.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("exports utility functions", () => {
    expect(typeof detectPython).toBe("function");
    expect(typeof detectRobotFramework).toBe("function");
    expect(typeof generateSkeletonRobotFile).toBe("function");
    expect(typeof enforceTdd).toBe("function");
  });

  it("detects python availability", async () => {
    spawnMock.mockImplementation((cmd, args) => {
      if (args[0] === "--version") {
        return createMockChild({ stdout: "Python 3.11.4\n", code: 0 });
      }
      return createMockChild({ code: 1 });
    });

    const result = await detectPython();
    expect(result.available).toBe(true);
    expect(result.version).toBe("3.11.4");
    expect(result.cmd).toBe("python");
  });

  it("detects Robot Framework availability", async () => {
    spawnMock.mockImplementation((cmd, args) => {
      if (args[0] === "-m" && args[1] === "robot" && args[2] === "--version") {
        return createMockChild({ stdout: "Robot Framework 5.0\n", code: 0 });
      }
      return createMockChild({ code: 1 });
    });

    const result = await detectRobotFramework("python");
    expect(result.available).toBe(true);
    expect(result.version).toBe("Robot Framework 5.0");
  });

  it("generates a skeleton robot test file for exports", async () => {
    const sourceDir = path.join(tmpDir, "src");
    await fs.mkdir(sourceDir, { recursive: true });
    const srcFile = path.join(sourceDir, "example-file.js");
    await fs.writeFile(
      srcFile,
      [
        "export function doThing() {}",
        "export const value = 42;",
        "export default function () {}",
      ].join("\n"),
      "utf8",
    );

    const robotDir = path.join(tmpDir, "robot");
    const robotPath = await generateSkeletonRobotFile(srcFile, robotDir);

    expect(path.basename(robotPath)).toBe("example_file.robot");
    const contents = await fs.readFile(robotPath, "utf8");
    expect(contents).toContain("doThing");
    expect(contents).toContain("value");
    expect(contents).toContain("default");
  });

  it("throws when generating a skeleton for a missing source file", async () => {
    await expect(
      generateSkeletonRobotFile(
        path.join(tmpDir, "missing.js"),
        path.join(tmpDir, "robot"),
      ),
    ).rejects.toThrow(/Source file not found/i);
  });

  it("enforces TDD compliance and honors robot file timestamps", async () => {
    const srcFile = path.join(tmpDir, "src.js");
    const robotDir = path.join(tmpDir, "robot");
    const robotFile = path.join(robotDir, "functional", "src.robot");
    await fs.mkdir(path.join(robotDir, "functional"), { recursive: true });
    await fs.writeFile(srcFile, "export function a() {}", "utf8");

    const missingResult = await enforceTdd(srcFile, robotDir);
    expect(missingResult.compliant).toBe(false);
    expect(missingResult.reason).toContain("No robot test found");

    await fs.writeFile(robotFile, "*** Test Cases ***\nFail    stub", "utf8");
    const now = Date.now();
    await fs.utimes(robotFile, new Date(now - 60000), new Date(now - 60000));
    await fs.utimes(srcFile, new Date(now - 30000), new Date(now - 30000));

    const staleResult = await enforceTdd(srcFile, robotDir);
    expect(staleResult.compliant).toBe(false);
    expect(staleResult.reason).toContain(
      "Implementation was modified after its test",
    );

    await fs.utimes(robotFile, new Date(now + 1000), new Date(now + 1000));
    await fs.utimes(srcFile, new Date(now), new Date(now));

    const goodResult = await enforceTdd(srcFile, robotDir);
    expect(goodResult.compliant).toBe(true);
    expect(goodResult.reason).toBeNull();
  });

  it("asserts TDD gate violations in non-strict mode", async () => {
    const srcFile = path.join(tmpDir, "missing_src.js");
    await fs.writeFile(srcFile, "export function a() {}", "utf8");
    const violations = await assertTddGate(
      [srcFile],
      { strict: false, graceMs: 0 },
      path.join(tmpDir, "robot"),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].robotPath).toMatch(/missing_src.robot$/);
  });

  it("lists and reads robot files from a robot directory", async () => {
    const robotDir = path.join(tmpDir, "robot");
    const nestedDir = path.join(robotDir, "functional");
    await fs.mkdir(nestedDir, { recursive: true });
    const robotFile = path.join(nestedDir, "sample_test.robot");
    await fs.writeFile(robotFile, "*** Test Cases ***\nExample Test", "utf8");

    const files = await listRobotFiles(robotDir);
    expect(files).toEqual([path.join("functional", "sample_test.robot")]);
    const contents = await readRobotFile(
      "functional/sample_test.robot",
      robotDir,
    );
    expect(contents).toContain("Example Test");
  });

  it("runs a Robot file and parses the output XML summary", async () => {
    spawnMock.mockImplementation((cmd, args) => {
      if (args[0] === "--version") {
        return createMockChild({ stdout: "Python 3.11.4\n", code: 0 });
      }
      if (args[0] === "-m" && args[1] === "robot" && args[2] === "--version") {
        return createMockChild({ stdout: "Robot Framework 5.0\n", code: 0 });
      }
      if (
        args[0] === "-m" &&
        args[1] === "robot" &&
        args.includes("--outputdir")
      ) {
        const outputDirIndex = args.indexOf("--outputdir");
        const outputDir = args[outputDirIndex + 1];
        const outputXml = path.join(outputDir, "output.xml");
        nodeFs.writeFileSync(
          outputXml,
          '<robot><statistics><total pass="1" fail="0" skip="0"/></statistics></robot>',
          "utf8",
        );
        return createMockChild({ stdout: "Robot run complete\n", code: 0 });
      }
      return createMockChild({ code: 1, stderr: "Unexpected args" });
    });

    const robotFile = path.join(tmpDir, "robotfile.robot");
    await fs.writeFile(robotFile, "*** Test Cases ***\nExample Test", "utf8");
    const summary = await runRobotFile(
      robotFile,
      path.join(tmpDir, "results"),
      {},
    );

    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.outputXml).toContain("output.xml");
  });

  it("runs a Robot suite with tags and dryRun options", async () => {
    spawnMock.mockImplementation((cmd, args) => {
      if (args[0] === "--version") {
        return createMockChild({ stdout: "Python 3.11.4\n", code: 0 });
      }
      if (args[0] === "-m" && args[1] === "robot" && args[2] === "--version") {
        return createMockChild({ stdout: "Robot Framework 5.0\n", code: 0 });
      }
      if (
        args[0] === "-m" &&
        args[1] === "robot" &&
        args.includes("--outputdir")
      ) {
        const outputDirIndex = args.indexOf("--outputdir");
        const outputDir = args[outputDirIndex + 1];
        const outputXml = path.join(outputDir, "output.xml");
        nodeFs.writeFileSync(
          outputXml,
          '<robot><statistics><total pass="2" fail="0" skip="1"/></statistics></robot>',
          "utf8",
        );
        return createMockChild({ stdout: "Robot suite complete\n", code: 0 });
      }
      return createMockChild({ code: 1, stderr: "Unexpected args" });
    });

    const robotDir = path.join(tmpDir, "robot", "functional");
    await fs.mkdir(robotDir, { recursive: true });

    const summary = await runSuite({
      suite: "functional",
      tags: ["smoke"],
      excludeTags: ["slow"],
      outputDir: path.join(tmpDir, "suite-results"),
      dryRun: true,
      baseDir: tmpDir,
      env: { TEST_ENV: "1" },
    });

    expect(summary.passed).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.errors).toEqual([]);
  });
});
