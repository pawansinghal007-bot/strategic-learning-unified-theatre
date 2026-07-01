/**
 * test-runner-branch-gaps.test.js
 *
 * Targets every remaining uncovered branch in src/test-runner.js.
 *
 * Uncovered branches (from v8 coverage-final.json):
 *
 *  line  49  binary-expr  detectPython:  stdout falsy → stderr used
 *  line  69  binary-expr  detectRobotFramework: version string empty → null
 *  line 127  cond-expr    generateSkeletonRobotFile: no exports → placeholder
 *  line 192  binary-expr  assertTddGate: options===null → default used (?? branch)
 *  line 220  cond-expr    parseRobotStats: no pass match → 0
 *  line 221  cond-expr    parseRobotStats: no fail match → 0
 *  line 222  cond-expr    parseRobotStats: no skip match → 0
 *  line 247  if           resolveRobotPath: falsy robotPath → return null
 *  line 259  if           collectRobotFiles: directory branch (skip non-special dirs)
 *  line 261  if           collectRobotFiles: isFile but NOT .robot → skipped
 *  line 310  cond-expr    runRobotFile: outputDir null → DEFAULT used
 *  line 334  cond-expr    runRobotFile: outputXml missing → "" string
 *  line 338  cond-expr    runRobotFile: xmlContents falsy → errors=[]
 *  line 341  binary-expr  runRobotFile: result.code null → 1 fallback
 *  line 420  cond-expr    runSuite: outputXml missing → "" string
 *  line 424  cond-expr    runSuite: xmlContents falsy → errors=[]
 *  line 427  binary-expr  runSuite: result.code null → 1 fallback
 *  line 492  if           CLI suite action: summary.errors.length === 0
 *  line 497  cond-expr    CLI suite action catch: non-Error thrown
 *  line 529  cond-expr    CLI tdd-check action catch: non-Error thrown
 *  line 544  cond-expr    CLI skeleton action catch: non-Error thrown
 *  fn  352   (anon)       collectJsFiles inner .then callback
 *  fn  438   (anon)       collectJsFiles entries.then callback
 */

import fs from "node:fs/promises";
import nodeFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── spawn mock ───────────────────────────────────────────────────────────────
var spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  __esModule: true,
  default: { spawn: (...args) => spawnMock(...args) },
  spawn: (...args) => spawnMock(...args),
}));

import {
  detectPython,
  detectRobotFramework,
  generateSkeletonRobotFile,
  assertTddGate,
  listRobotFiles,
  runRobotFile,
  runSuite,
  RobotFrameworkError,
} from "../src/test-runner.js";

// ── helpers ──────────────────────────────────────────────────────────────────
function createMockChild({ stdout = "", stderr = "", code = 0 } = {}) {
  return {
    stdout: {
      on(e, cb) {
        if (e === "data") cb(Buffer.from(stdout));
      },
    },
    stderr: {
      on(e, cb) {
        if (e === "data") cb(Buffer.from(stderr));
      },
    },
    on(e, cb) {
      if (e === "close") setTimeout(() => cb(code), 0);
      return this;
    },
  };
}

/** Set up python + robot as available; runProcess returns code=null to hit the ?? branch. */
function mockPythonRobotNullCode(outDir, xmlContent = "") {
  spawnMock.mockImplementation((cmd, args) => {
    if (args[0] === "--version")
      return createMockChild({ stdout: "Python 3.11.4\n", code: 0 });
    if (args[0] === "-m" && args[1] === "robot" && args[2] === "--version")
      return createMockChild({ stdout: "Robot Framework 6.0\n", code: 0 });
    if (args.includes("--outputdir")) {
      const od = args[args.indexOf("--outputdir") + 1];
      nodeFs.mkdirSync(od, { recursive: true });
      if (xmlContent) {
        nodeFs.writeFileSync(path.join(od, "output.xml"), xmlContent);
      }
      // Return a child whose 'close' callback fires with code=null
      return {
        stdout: { on(e, cb) { if (e === "data") cb(Buffer.from("")); } },
        stderr: { on(e, cb) { if (e === "data") cb(Buffer.from("")); } },
        on(e, cb) {
          if (e === "close") setTimeout(() => cb(null), 0); // null code
          return this;
        },
      };
    }
    return createMockChild({ code: 1 });
  });
}

function mockPythonRobotSuccess(outDir, xmlContent) {
  spawnMock.mockImplementation((cmd, args) => {
    if (args[0] === "--version")
      return createMockChild({ stdout: "Python 3.11.4\n", code: 0 });
    if (args[0] === "-m" && args[1] === "robot" && args[2] === "--version")
      return createMockChild({ stdout: "Robot Framework 6.0\n", code: 0 });
    if (args.includes("--outputdir")) {
      const od = args[args.indexOf("--outputdir") + 1];
      nodeFs.mkdirSync(od, { recursive: true });
      if (xmlContent) {
        nodeFs.writeFileSync(path.join(od, "output.xml"), xmlContent);
      }
      return createMockChild({ code: 0 });
    }
    return createMockChild({ code: 1 });
  });
}

// ── loadWithProgram helper (same pattern as cli-coverage tests) ──────────────
async function loadWithProgram({ urlRedirect = null } = {}) {
  vi.doUnmock("node:url");
  vi.resetModules();

  let capturedProgram = null;

  if (urlRedirect) {
    vi.doMock("node:url", async () => {
      const actual = await vi.importActual("node:url");
      return {
        ...actual,
        fileURLToPath: (url) => {
          if (String(url).includes("test-runner"))
            return urlRedirect + "/src/test-runner.js";
          return actual.fileURLToPath(url);
        },
      };
    });
  }

  vi.doMock("commander", async () => {
    const actual = await vi.importActual("commander");
    const OrigCommand = actual.Command;
    class TrackingCommand extends OrigCommand {
      constructor(...args) {
        super(...args);
        if (!capturedProgram) capturedProgram = this;
      }
      createCommand(name) {
        return new TrackingCommand(name);
      }
    }
    return { ...actual, Command: TrackingCommand };
  });

  await import("../src/test-runner.js");
  vi.doUnmock("commander");
  vi.doUnmock("node:url");

  return capturedProgram;
}

// ── test suite ────────────────────────────────────────────────────────────────
describe("test-runner: remaining branch gaps", () => {
  let tmpDir;
  const origExitCode = process.exitCode;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-gaps-"));
    spawnMock.mockReset();
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = origExitCode;
    vi.restoreAllMocks();
    vi.doUnmock("commander");
    vi.doUnmock("node:url");
    vi.resetModules();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── line 49: detectPython stdout falsy → stderr used ──────────────────────
  // python responds with version on stderr only (some builds do this)
  it("detectPython uses stderr when stdout is empty (line 49 falsy branch)", async () => {
    spawnMock.mockImplementationOnce(() =>
      createMockChild({ stdout: "", stderr: "Python 3.10.0\n", code: 0 }),
    );
    const result = await detectPython();
    expect(result.available).toBe(true);
    expect(result.version).toBe("3.10.0");
  });

  // ── line 69: detectRobotFramework version string empty → null ─────────────
  // robot --version exits 0 but stdout is empty → split[0] is "" → falsy → null
  it("detectRobotFramework returns version:null when stdout is empty (line 69 null branch)", async () => {
    spawnMock.mockImplementation(() =>
      createMockChild({ stdout: "", code: 0 }),
    );
    const result = await detectRobotFramework("python");
    expect(result.available).toBe(true);
    expect(result.version).toBeNull();
  });

  // ── line 127: generateSkeletonRobotFile no exports → placeholder ───────────
  // A source file with no `export` statements hits the false branch of the ternary.
  it("generateSkeletonRobotFile writes placeholder when source has no exports (line 127 false branch)", async () => {
    const srcFile = path.join(tmpDir, "no-exports.js");
    await fs.writeFile(
      srcFile,
      "// just a comment\nconst x = 1;\n",
      "utf8",
    );
    const robotDir = path.join(tmpDir, "robot");
    const robotPath = await generateSkeletonRobotFile(srcFile, robotDir);
    const content = await fs.readFile(robotPath, "utf8");
    expect(content).toContain("Placeholder test");
    expect(content).toContain("Fail    TODO add tests");
    expect(content).not.toContain("Test stub for");
  });

  // ── line 192: assertTddGate options===null → ?? fires default ─────────────
  // Passing explicit null for options triggers the `options ?? { strict:true, graceMs:0 }` branch.
  it("assertTddGate uses default options when null is passed (line 192 ?? branch)", async () => {
    const srcFile = path.join(tmpDir, "null-opts.js");
    await fs.writeFile(srcFile, "export function a() {}", "utf8");
    // strict defaults to true → should throw TddViolationError
    await expect(
      assertTddGate([srcFile], null, path.join(tmpDir, "robot")),
    ).rejects.toThrow(/TDD violations found/i);
  });

  // ── lines 220-222: parseRobotStats no-match → 0 fallbacks ─────────────────
  // XML with no pass/fail/skip attributes → all three ternary false branches.
  it("runRobotFile returns zero counts when XML has no statistics (lines 220-222 false branches)", async () => {
    spawnMock.mockImplementation((cmd, args) => {
      if (args[0] === "--version")
        return createMockChild({ stdout: "Python 3.11.4\n", code: 0 });
      if (args[0] === "-m" && args[1] === "robot" && args[2] === "--version")
        return createMockChild({ stdout: "Robot Framework 6.0\n", code: 0 });
      if (args.includes("--outputdir")) {
        const od = args[args.indexOf("--outputdir") + 1];
        nodeFs.mkdirSync(od, { recursive: true });
        // XML has no pass/fail/skip attributes at all
        nodeFs.writeFileSync(
          path.join(od, "output.xml"),
          "<robot><statistics><total/></statistics></robot>",
        );
        return createMockChild({ code: 0 });
      }
      return createMockChild({ code: 1 });
    });

    const robotFile = path.join(tmpDir, "empty-stats.robot");
    await fs.writeFile(robotFile, "*** Test Cases ***\nStub", "utf8");
    const summary = await runRobotFile(
      robotFile,
      path.join(tmpDir, "res"),
      {},
    );
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(0);
  });

  // ── line 247: resolveRobotPath falsy → return null ─────────────────────────
  // listRobotFiles → collectRobotFiles → resolveRobotPath is not called directly;
  // resolveRobotPath is internal. We reach it via readRobotFile with an empty-string path,
  // which passes null/empty so resolveRobotPath returns null, then pathExists(null) → false → throws.
  // Actually resolveRobotPath is used inside runRobotFile too — call it with "" to hit the null branch.
  it("runRobotFile handles null resolved path (line 247 !robotPath branch)", async () => {
    spawnMock.mockImplementation((cmd, args) => {
      if (args[0] === "--version")
        return createMockChild({ stdout: "Python 3.11.4\n", code: 0 });
      if (args[0] === "-m" && args[1] === "robot" && args[2] === "--version")
        return createMockChild({ stdout: "Robot Framework 6.0\n", code: 0 });
      return createMockChild({ code: 1 });
    });
    // Empty string robotPath → resolveRobotPath("") → !robotPath is true → returns null
    // → pathExists(null) → false → throws "Robot file not found: null"
    await expect(runRobotFile("", null, {})).rejects.toThrow(
      /Robot file not found/i,
    );
  });

  // ── lines 259, 261: collectRobotFiles directory traversal branches ─────────
  // line 258: item.isDirectory() true — recurse into non-special subdirectory
  // line 259: item.name === "node_modules" || ".git" → continue (skip) branch
  // line 261: a non-.robot file inside a dir is encountered but skipped
  it("listRobotFiles recurses into subdirs, skips node_modules/.git, skips non-.robot files (lines 258-261)", async () => {
    const robotDir = path.join(tmpDir, "robot");
    const subDir = path.join(robotDir, "suite-a");
    // node_modules and .git inside the robot dir — collectRobotFiles must skip them
    const nmDir = path.join(robotDir, "node_modules");
    const gitDir = path.join(robotDir, ".git");
    await fs.mkdir(subDir, { recursive: true });
    await fs.mkdir(nmDir, { recursive: true });
    await fs.mkdir(gitDir, { recursive: true });

    // A .robot file in the subdir (triggers isDirectory true + recursion + isFile+.robot true)
    await fs.writeFile(
      path.join(subDir, "test_a.robot"),
      "*** Test Cases ***\nOk",
      "utf8",
    );
    // A .robot file inside node_modules — must NOT appear (skipped)
    await fs.writeFile(
      path.join(nmDir, "vendor.robot"),
      "*** Test Cases ***\nVendor",
      "utf8",
    );
    // A .robot file inside .git — must NOT appear (skipped)
    await fs.writeFile(
      path.join(gitDir, "hooks.robot"),
      "*** Test Cases ***\nGit",
      "utf8",
    );
    // A non-.robot file in the subdir (triggers isFile true but !endsWith('.robot') → false branch line 261)
    await fs.writeFile(
      path.join(subDir, "readme.txt"),
      "not a robot file",
      "utf8",
    );
    // A non-.robot file at top level (same line 261 false branch for top-level items)
    await fs.writeFile(
      path.join(robotDir, "config.json"),
      "{}",
      "utf8",
    );

    const files = await listRobotFiles(robotDir);
    // Only suite-a/test_a.robot should appear; node_modules and .git contents excluded
    expect(files).toEqual([path.join("suite-a", "test_a.robot")]);
  });

  // ── line 310: runRobotFile outputDir null → DEFAULT_BASE_DIR/robot-results ─
  // Also hits lines 334 (outputXml missing → "") and 338 (xmlContents falsy → errors=[])
  // and 341 (null code → 1)
  it("runRobotFile uses default outputDir and handles missing xml (lines 310, 334, 338, 341)", async () => {
    // null code + no xml file written → hits all false branches
    mockPythonRobotNullCode(null, ""); // no xml written

    const robotFile = path.join(tmpDir, "r.robot");
    await fs.writeFile(robotFile, "*** Test Cases ***\nX", "utf8");

    // outputDir=null → line 310 false branch → DEFAULT path used
    const summary = await runRobotFile(robotFile, null, {});

    // xml was never written → pathExists(outputXml) false → xmlContents = "" (line 334 false)
    // xmlContents falsy → errors = [] (line 338 false)
    // code = null → exitCode = 1 (line 341 false via ??)
    expect(summary.exitCode).toBe(1);
    expect(summary.errors).toEqual([]);
    expect(summary.passed).toBe(0);
  });

  // ── lines 420, 424, 427: runSuite missing xml / null code ─────────────────
  it("runSuite handles missing output xml and null exit code (lines 420, 424, 427)", async () => {
    const robotDir = path.join(tmpDir, "robot", "functional");
    await fs.mkdir(robotDir, { recursive: true });
    const outDir = path.join(tmpDir, "suite-out");

    // null code, no xml file
    mockPythonRobotNullCode(outDir, "");

    const summary = await runSuite({
      suite: "functional",
      outputDir: outDir,
      baseDir: tmpDir,
    });

    // line 420: pathExists(outputXml) → false → xmlContents = ""
    // line 424: xmlContents falsy → errors = []
    // line 427: result.code null → exitCode = 1
    expect(summary.exitCode).toBe(1);
    expect(summary.errors).toEqual([]);
    expect(summary.passed).toBe(0);
  });

  // ── line 492: CLI suite action — summary.errors.length === 0 (no Errors log) ─
  // The success path already tested elsewhere always has errors. This ensures the
  // `if (summary.errors.length)` FALSE branch (no errors log printed).
  it("CLI suite action: no errors.length branch — does not log Errors (line 492 false branch)", async () => {
    const robotDir = path.join(tmpDir, "robot", "functional");
    await fs.mkdir(robotDir, { recursive: true });
    const outDir = path.join(tmpDir, "no-err-out");

    // xml with zero failures and zero errors
    const xml =
      '<robot><statistics><total pass="5" fail="0" skip="0"/></statistics></robot>';
    mockPythonRobotSuccess(outDir, xml);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const program = await loadWithProgram();

    await program.parseAsync([
      "node",
      "test-runner.js",
      "suite",
      "--suite",
      "functional",
      "--output-dir",
      outDir,
    ]);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("passed=5"),
    );
    // "Errors:" line must NOT have been logged
    const allLogs = logSpy.mock.calls.flat().join(" ");
    expect(allLogs).not.toContain("Errors:");
  });

  // ── line 497: CLI suite action catch — non-Error thrown ───────────────────
  // When something non-Error is thrown (e.g. a plain string), the
  // `err instanceof Error ? err.message : String(err)` picks the String() branch.
  // We let python+robot detection succeed, then make runSuite itself throw a
  // plain string by mocking fs.mkdir (called right before the robot process runs).
  it("CLI suite action catch: non-Error thrown uses String(err) (line 497 false branch)", async () => {
    const robotDir = path.join(tmpDir, "robot", "functional");
    await fs.mkdir(robotDir, { recursive: true });

    spawnMock.mockImplementation((cmd, args) => {
      if (args[0] === "--version")
        return createMockChild({ stdout: "Python 3.11.4\n", code: 0 });
      if (args[0] === "-m" && args[1] === "robot" && args[2] === "--version")
        return createMockChild({ stdout: "Robot Framework 6.0\n", code: 0 });
      return createMockChild({ code: 1 });
    });

    const program = await loadWithProgram();

    // After program is loaded (so module-level Command setup is done),
    // make fs.mkdir throw a plain string — this fires when runSuite calls
    // `await fs.mkdir(outputDir, { recursive: true })`.
    vi.spyOn(fs, "mkdir").mockRejectedValueOnce("mkdir-plain-string-error");

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "test-runner.js",
      "suite",
      "--suite",
      "functional",
      "--output-dir",
      path.join(tmpDir, "suite-out-err"),
    ]);

    expect(errSpy).toHaveBeenCalledWith("mkdir-plain-string-error");
    expect(process.exitCode).toBe(1);
  });

  // ── line 529: CLI tdd-check action catch — non-Error thrown ───────────────
  it("CLI tdd-check action catch: non-Error thrown uses String(err) (line 529 false branch)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Provide a file path that causes fs.stat to throw a non-Error (we mock fs)
    const program = await loadWithProgram();

    // Mock fs.stat inside the module to throw a plain object
    vi.spyOn(fs, "stat").mockRejectedValueOnce("stat-failure-string");

    const srcFile = path.join(tmpDir, "problematic.js");
    await fs.writeFile(srcFile, "export function x() {}", "utf8");

    // Reset the stat mock so only the first call (for enforceTdd) throws
    const sub = program.commands.find((c) => c.name() === "tdd-check");
    await sub._actionHandler([srcFile]);

    expect(errSpy).toHaveBeenCalledWith("stat-failure-string");
    expect(process.exitCode).toBe(1);
  });

  // ── line 544: CLI skeleton action catch — non-Error thrown ────────────────
  it("CLI skeleton action catch: non-Error thrown uses String(err) (line 544 false branch)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock fs.access to throw a plain string so pathExists() rejects non-Error
    vi.spyOn(fs, "access").mockRejectedValueOnce("access-denied-string");

    // generateSkeletonRobotFile calls pathExists → fs.access
    // pathExists catches and returns false (catch block), so access mock won't propagate.
    // Instead mock fs.readFile (called after pathExists passes) to throw a string.
    vi.spyOn(fs, "readFile").mockRejectedValueOnce("read-failure-string");

    // We need a file that "exists" so pathExists returns true, then readFile throws.
    const srcFile = path.join(tmpDir, "mock-exists.js");
    await fs.writeFile(srcFile, "export function y() {}", "utf8");
    // Restore access so pathExists works, but readFile throws string
    vi.restoreAllMocks();
    errSpy.mockRestore();
    const errSpy2 = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(fs, "readFile").mockRejectedValueOnce("read-failure-string");

    const program = await loadWithProgram();
    await program.parseAsync([
      "node",
      "test-runner.js",
      "skeleton",
      srcFile,
    ]);

    expect(errSpy2).toHaveBeenCalledWith("read-failure-string");
    expect(process.exitCode).toBe(1);
  });

  // ── fns 352 & 438: collectJsFiles anonymous callbacks ─────────────────────
  // collectJsFiles is used by the tdd-check CLI action when no file arg given.
  // urlRedirect makes DEFAULT_BASE_DIR=tmpDir so it scans tmpDir/src.
  // We need a directory structure with subdirs to hit both .then callbacks.
  it("collectJsFiles inner .then callbacks execute (fns at lines 352, 438)", async () => {
    const srcDir = path.join(tmpDir, "src");
    const subDir = path.join(srcDir, "utils");
    await fs.mkdir(subDir, { recursive: true });

    // .js files at both levels
    await fs.writeFile(
      path.join(srcDir, "main.js"),
      "export const a = 1;",
      "utf8",
    );
    await fs.writeFile(
      path.join(subDir, "helper.js"),
      "export const b = 2;",
      "utf8",
    );
    // a non-.js file (hits the return [] path inside the map)
    await fs.writeFile(
      path.join(srcDir, "config.json"),
      "{}",
      "utf8",
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const program = await loadWithProgram({ urlRedirect: tmpDir });

    // no file arg → collectJsFiles(tmpDir/src) → finds main.js + utils/helper.js
    const sub = program.commands.find((c) => c.name() === "tdd-check");
    await sub._actionHandler([]);

    // Both js files have no robot tests → 2 violations
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/TDD check found \d+ violation/),
    );
  });
});
