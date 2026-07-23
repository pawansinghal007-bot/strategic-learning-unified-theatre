/**
 * tests/shared/retrieval/code-search.test.ts
 *
 * Unit tests for src/shared/retrieval/code-search.ts
 *
 * Covers:
 *   - resolveGlob: undefined/empty → REPO_ROOT, valid relative paths, traversal guard
 *   - searchCode: normal hits, zero matches (exit 1), AbortError timeout (line 126),
 *     rg hard failure, malformed JSON lines skipped, MAX_RESULTS cap
 *
 * Mocking strategy:
 *   code-search.ts calls `promisify(childProcess.execFile)` at module load time,
 *   binding the callback-style execFile immediately. We mock `node:child_process`
 *   so its `execFile` is a callback-based spy controlled by `mockExecFileBehavior`.
 *   The real `promisify` wraps our spy, so the module's internal `execFile` const
 *   calls our spy on each invocation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "node:path";

// ─── hoisted state ────────────────────────────────────────────────────────────
// vi.hoisted ensures these are evaluated before any vi.mock() factory runs.

const { MOCK_ROOT, mockLogger, nextExecFileResult } = vi.hoisted(() => {
  let _nextResult: (() => void) | null = null;

  return {
    MOCK_ROOT: "/mock/project/root",
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    nextExecFileResult: {
      // Set before each test to control what the callback-based execFile returns
      resolve: null as ((stdout: string) => void) | null,
      reject: null as ((err: NodeJS.ErrnoException & { stdout?: string; stderr?: string }) => void) | null,
    },
  };
});

// ─── mock node:child_process ──────────────────────────────────────────────────
// execFile is callback-style: (file, args, opts, callback) => void
// promisify wraps it so the module's `execFile` const is a promise-returning fn.

vi.mock("node:child_process", () => ({
  execFile: (
    _file: string,
    _args: string[],
    _opts: unknown,
    callback: (err: Error | null, result?: { stdout: string; stderr: string }) => void,
  ) => {
    // Schedule async so the AbortController timer can fire first if needed
    Promise.resolve().then(() => {
      if (nextExecFileResult.reject) {
        const rejFn = nextExecFileResult.reject;
        nextExecFileResult.reject = null;
        nextExecFileResult.resolve = null;
        callback(rejFn as unknown as Error);
      } else if (nextExecFileResult.resolve) {
        const resFn = nextExecFileResult.resolve;
        nextExecFileResult.resolve = null;
        nextExecFileResult.reject = null;
        callback(null, { stdout: resFn as unknown as string, stderr: "" });
      } else {
        // Default: resolve with empty stdout
        callback(null, { stdout: "", stderr: "" });
      }
    });
  },
}));

// Actually, the above approach won't work cleanly. Let's use a different pattern:
// store callbacks and resolve them imperatively.

// ─── Better approach: use a queue ─────────────────────────────────────────────

type ExecResult = { stdout: string; stderr: string };
type ExecError = Error & { code?: string; stdout?: string; stderr?: string };

// Queue of pending { resolve, reject } for each execFile call
const execQueue: Array<{
  resolve: (result: ExecResult) => void;
  reject: (err: ExecError) => void;
}> = [];

// Re-mock with a queue-based approach
vi.mock("node:child_process", () => ({
  execFile: (
    _file: string,
    _args: string[],
    _opts: unknown,
    callback: (err: ExecError | null, result?: ExecResult) => void,
  ) => {
    execQueue.push({
      resolve: (result) => callback(null, result),
      reject: (err) => callback(err),
    });
  },
}));

vi.mock("../../../src/shared/logging/logger.js", () => ({
  logger: mockLogger,
}));

vi.mock("../../../src/shared/config/paths.js", () => ({
  PROJECT_ROOT: MOCK_ROOT,
}));

// ─── module under test (imported AFTER mocks are registered) ─────────────────

import {
  resolveGlob,
  searchCode,
} from "../../../src/shared/retrieval/code-search.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeRgMatchLine(absoluteFile: string, lineNumber: number, text: string): string {
  return JSON.stringify({
    type: "match",
    data: {
      path: { text: absoluteFile },
      line_number: lineNumber,
      lines: { text: text },
    },
  });
}

/** Resolve the next pending execFile call with a given stdout. */
function resolveExec(stdout: string) {
  const pending = execQueue.shift();
  if (!pending) throw new Error("No pending execFile call in queue");
  pending.resolve({ stdout, stderr: "" });
}

/** Reject the next pending execFile call with a given error. */
function rejectExec(err: ExecError) {
  const pending = execQueue.shift();
  if (!pending) throw new Error("No pending execFile call in queue");
  pending.reject(err);
}

// ─── resolveGlob ──────────────────────────────────────────────────────────────

describe("resolveGlob", () => {
  it("returns REPO_ROOT when glob is undefined", () => {
    const result = resolveGlob(undefined);
    expect(result).toBe(MOCK_ROOT);
  });

  it("returns REPO_ROOT when glob is empty string", () => {
    const result = resolveGlob("");
    expect(result).toBe(MOCK_ROOT);
  });

  it("resolves a valid relative path inside REPO_ROOT", () => {
    const result = resolveGlob("src/agents");
    expect(result).toBe(path.join(MOCK_ROOT, "src/agents"));
  });

  it("throws when path escapes REPO_ROOT via traversal", () => {
    expect(() => resolveGlob("../../etc/passwd")).toThrow(/escapes REPO_ROOT/);
  });

  it("throws when path escapes REPO_ROOT via absolute path", () => {
    expect(() => resolveGlob("/etc/passwd")).toThrow(/escapes REPO_ROOT/);
  });
});

// ─── searchCode ───────────────────────────────────────────────────────────────

describe("searchCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Drain any leftover pending calls
    execQueue.length = 0;
  });

  it("returns parsed hits from rg --json output", async () => {
    const line1 = makeRgMatchLine(`${MOCK_ROOT}/src/foo.ts`, 10, "export function foo()");
    const line2 = makeRgMatchLine(`${MOCK_ROOT}/src/bar.ts`, 42, "  foo(args)");

    const promise = searchCode("foo");
    resolveExec(`${line1}\n${line2}\n`);
    const hits = await promise;

    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({ file: "src/foo.ts", line: 10, text: "export function foo()" });
    expect(hits[1]).toEqual({ file: "src/bar.ts", line: 42, text: "foo(args)" });
  });

  it("returns empty array when rg exits with code 1 (no matches)", async () => {
    const err = Object.assign(new Error("Command failed"), { code: "1", stdout: "", stderr: "" });

    const promise = searchCode("no_such_pattern");
    rejectExec(err);
    const hits = await promise;

    expect(hits).toEqual([]);
  });

  it("throws when rg exits with code > 1 (real error)", async () => {
    const err = Object.assign(new Error("Command failed"), { code: "2", stdout: "", stderr: "rg: some fatal error" });

    const promise = searchCode("pattern");
    rejectExec(err);

    await expect(promise).rejects.toThrow(/rg failed \(code 2\)/);
  });

  it("throws with timeout message on AbortError", async () => {
    const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });

    const promise = searchCode("pattern");
    rejectExec(abortErr as ExecError);

    await expect(promise).rejects.toThrow(/timed out after/);
  });

  it("skips malformed JSON lines without throwing", async () => {
    const validLine = makeRgMatchLine(`${MOCK_ROOT}/src/foo.ts`, 5, "match");
    const stdout = `not-json\n${validLine}\n{bad json}\n`;

    const promise = searchCode("foo");
    resolveExec(stdout);
    const hits = await promise;

    expect(hits).toHaveLength(1);
    expect(hits[0].file).toBe("src/foo.ts");
  });

  it("skips non-match type lines (e.g. summary)", async () => {
    const summaryLine = JSON.stringify({ type: "summary", data: { stats: {} } });
    const matchLine = makeRgMatchLine(`${MOCK_ROOT}/src/x.ts`, 1, "hit");

    const promise = searchCode("foo");
    resolveExec(`${summaryLine}\n${matchLine}\n`);
    const hits = await promise;

    expect(hits).toHaveLength(1);
  });

  it("caps results at MAX_RESULTS (50)", async () => {
    const lines = Array.from({ length: 60 }, (_, i) =>
      makeRgMatchLine(`${MOCK_ROOT}/src/file${i}.ts`, i + 1, `hit ${i}`),
    ).join("\n");

    const promise = searchCode("pattern");
    resolveExec(lines);
    const hits = await promise;

    expect(hits).toHaveLength(50);
  });

  it("logs result count via logger.info on success", async () => {
    const line = makeRgMatchLine(`${MOCK_ROOT}/src/foo.ts`, 1, "match");

    const promise = searchCode("foo", "src");
    resolveExec(line);
    await promise;

    expect(mockLogger.info).toHaveBeenCalledWith(
      "retrieval.code-search",
      expect.objectContaining({ pattern: "foo", hits: 1 }),
    );
  });

  it("logs zero hits on no-match result", async () => {
    const err = Object.assign(new Error("no match"), { code: "1", stdout: "", stderr: "" });

    const promise = searchCode("nothing");
    rejectExec(err);
    await promise;

    expect(mockLogger.info).toHaveBeenCalledWith(
      "retrieval.code-search",
      expect.objectContaining({ hits: 0 }),
    );
  });

  it("trims whitespace from matched text", async () => {
    const line = makeRgMatchLine(`${MOCK_ROOT}/src/foo.ts`, 3, "  padded text  ");

    const promise = searchCode("padded");
    resolveExec(line);
    const hits = await promise;

    expect(hits[0].text).toBe("padded text");
  });

  it("uses REPO_ROOT directly when glob resolves exactly to REPO_ROOT (sep branch)", () => {
    // resolveGlob("") returns REPO_ROOT. This exercises the
    // `resolved !== REPO_ROOT` guard branch where resolved === REPO_ROOT.
    const result = resolveGlob(".");
    // path.resolve(MOCK_ROOT, ".") === MOCK_ROOT, so the guard passes
    expect(result).toBe(MOCK_ROOT);
  });

  it("throws when rg exits with code 1 but stdout has content (real error, not no-match)", async () => {
    // rg code 1 with non-empty stdout is treated as a real error
    // (the guard is: exitCode === "1" && !execErr.stdout?.trim())
    const err = Object.assign(new Error("Command failed"), {
      code: "1",
      stdout: "some unexpected output",
      stderr: "",
    });

    const promise = searchCode("pattern");
    rejectExec(err as ExecError);

    await expect(promise).rejects.toThrow(/rg failed \(code 1\)/);
  });

  it("uses stderr in error message when available", async () => {
    const err = Object.assign(new Error("Command failed"), {
      code: "2",
      stdout: "",
      stderr: "rg: regex syntax error",
    });

    const promise = searchCode("bad[pattern");
    rejectExec(err as ExecError);

    await expect(promise).rejects.toThrow(/rg: regex syntax error/);
  });

  it("falls back to String(err) in error message when stderr is empty", async () => {
    const err = Object.assign(new Error("Command failed with no stderr"), {
      code: "2",
      stdout: "",
      stderr: "",
    });

    const promise = searchCode("pattern");
    rejectExec(err as ExecError);

    await expect(promise).rejects.toThrow(/rg failed \(code 2\)/);
  });

  it("handles rg record with missing path field (defaults to empty string)", async () => {
    const line = JSON.stringify({
      type: "match",
      data: {
        // path field intentionally absent
        line_number: 5,
        lines: { text: "match text" },
      },
    });

    const promise = searchCode("pattern");
    resolveExec(line);
    const hits = await promise;

    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(5);
    expect(hits[0].text).toBe("match text");
  });

  it("handles rg record with missing line_number (defaults to 0)", async () => {
    const line = JSON.stringify({
      type: "match",
      data: {
        path: { text: `${MOCK_ROOT}/src/foo.ts` },
        // line_number intentionally absent
        lines: { text: "some text" },
      },
    });

    const promise = searchCode("pattern");
    resolveExec(line);
    const hits = await promise;

    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(0);
  });

  it("handles rg record with missing lines field (defaults to empty string)", async () => {
    const line = JSON.stringify({
      type: "match",
      data: {
        path: { text: `${MOCK_ROOT}/src/foo.ts` },
        line_number: 10,
        // lines field intentionally absent
      },
    });

    const promise = searchCode("pattern");
    resolveExec(line);
    const hits = await promise;

    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe("");
  });
});
