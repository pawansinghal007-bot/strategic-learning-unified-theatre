/**
 * tests/agents/tools/code-search.test.ts
 *
 * Unit tests for src/shared/retrieval/code-search.ts
 *
 * Covers:
 *   - searchCode: successful match parsing from `rg --json` output
 *   - searchCode: zero-match case (rg exit 1, empty stdout) returns [] not throws
 *   - searchCode: rg exit > 1 (real error) propagates as thrown Error
 *   - searchCode: skips non-match JSON lines (summary lines)
 *   - searchCode: skips malformed (non-JSON) lines
 *   - resolveGlob: path traversal rejection
 *   - resolveGlob: undefined/empty glob returns REPO_ROOT
 *   - resolveGlob: valid sub-directory resolves correctly
 *
 * execFile is mocked via node:child_process at the module level so the
 * promisify() call inside code-search.ts wraps the mock function.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "node:path";

// ─── hoisted mocks ────────────────────────────────────────────────────────────
//
// code-search.ts does:
//   import * as childProcess from "node:child_process"
//   const execFile = promisify(childProcess.execFile)
//
// The key: Node's real execFile has [util.promisify.custom] attached, which
// makes promisify() return a function that resolves { stdout, stderr }.
// Our mock must also have this symbol set before module load so the captured
// `execFile` in code-search.ts resolves to { stdout, stderr }.
//
// We store the current target in a shared mutable object so resolveExecFile /
// rejectExecFile can point it to a new Promise factory per test.

const { mockExecFile, promisifyTarget } = vi.hoisted(() => {
  const promisifyTarget = { impl: (_cmd: string, _args: string[], _opts: unknown) => Promise.resolve({ stdout: "", stderr: "" }) };
  const mockExecFile = Object.assign(
    vi.fn(),
    {
      // util.promisify uses [util.promisify.custom] if present
      [Symbol.for("nodejs.util.promisify.custom")]: (
        cmd: string,
        args: string[],
        opts: unknown,
      ) => promisifyTarget.impl(cmd, args, opts),
    },
  );
  return { mockExecFile, promisifyTarget };
});

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return { ...real, execFile: mockExecFile };
});

vi.mock("../../../src/shared/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── module under test (imported after mocks) ─────────────────────────────────

import { searchCode, resolveGlob } from "../../../src/shared/retrieval/code-search";

// ─── REPO_ROOT used by code-search.ts ────────────────────────────────────────

const REPO_ROOT = path.resolve(process.env.REPO_ROOT ?? process.cwd());

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build rg --json match-line output for a single match.
 * `filePath` is absolute; code-search.ts relativises it.
 */
function rgMatchLine(
  filePath: string,
  lineNumber: number,
  text: string,
): string {
  return JSON.stringify({
    type: "match",
    data: {
      path: { text: filePath },
      line_number: lineNumber,
      lines: { text: `${text}\n` },
    },
  });
}

/** Build a rg summary/begin/end line (should be skipped). */
function rgSummaryLine(): string {
  return JSON.stringify({
    type: "summary",
    data: { stats: { matches: 1 } },
  });
}

/**
 * Point the promisifyTarget at a successful resolution for this test.
 * code-search.ts does `result.stdout` so we resolve { stdout, stderr }.
 */
function resolveExecFile(stdout: string): void {
  promisifyTarget.impl = (_cmd, _args, _opts) =>
    Promise.resolve({ stdout, stderr: "" });
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, stdout, "");
    },
  );
}

/**
 * Point the promisifyTarget at a rejection for this test.
 * The error has .code, .stdout, .stderr matching real child_process errors.
 */
function rejectExecFile(code: number | string, stdout = "", stderr = ""): void {
  const err = Object.assign(new Error(`Command failed: rg`), {
    code: String(code),
    stdout,
    stderr,
  }) as NodeJS.ErrnoException & { stdout: string; stderr: string };
  promisifyTarget.impl = (_cmd, _args, _opts) => Promise.reject(err);
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(err, stdout, stderr);
    },
  );
}

// ─── tests: resolveGlob ───────────────────────────────────────────────────────

describe("resolveGlob", () => {
  it("returns REPO_ROOT when glob is undefined", () => {
    expect(resolveGlob(undefined)).toBe(REPO_ROOT);
  });

  it("returns REPO_ROOT when glob is empty string", () => {
    expect(resolveGlob("")).toBe(REPO_ROOT);
  });

  it("resolves a valid sub-directory glob within REPO_ROOT", () => {
    const result = resolveGlob("src/agents");
    expect(result).toBe(path.join(REPO_ROOT, "src/agents"));
  });

  it("resolves a deeply nested sub-path within REPO_ROOT", () => {
    const result = resolveGlob("src/shared/retrieval");
    expect(result).toBe(path.join(REPO_ROOT, "src/shared/retrieval"));
  });

  it("throws for a path traversal attempt: ../../etc", () => {
    expect(() => resolveGlob("../../etc")).toThrow(/resolveGlob.*escapes REPO_ROOT/);
  });

  it("throws for a path traversal using absolute path outside REPO_ROOT", () => {
    expect(() => resolveGlob("/etc/passwd")).toThrow(/resolveGlob.*escapes REPO_ROOT/);
  });

  it("throws for a traversal that lands exactly at a parent directory", () => {
    expect(() => resolveGlob("../escape")).toThrow(/resolveGlob.*escapes REPO_ROOT/);
  });
});

// ─── tests: searchCode ────────────────────────────────────────────────────────

describe("searchCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses match lines from rg --json output into CodeSearchHit objects", async () => {
    const file1 = path.join(REPO_ROOT, "src/foo.ts");
    const file2 = path.join(REPO_ROOT, "src/bar.ts");
    const stdout = [
      rgMatchLine(file1, 10, "function runSubAgent("),
      rgMatchLine(file2, 42, "export function runSubAgent(task"),
      rgSummaryLine(),
    ].join("\n");

    resolveExecFile(stdout);

    const hits = await searchCode("runSubAgent");

    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({ file: "src/foo.ts", line: 10, text: "function runSubAgent(" });
    expect(hits[1]).toEqual({ file: "src/bar.ts", line: 42, text: "export function runSubAgent(task" });
  });

  it("skips non-match JSON lines (type !== 'match') without error", async () => {
    const file = path.join(REPO_ROOT, "src/index.ts");
    const stdout = [
      JSON.stringify({ type: "begin", data: { path: { text: file } } }),
      rgMatchLine(file, 5, "const x = 1;"),
      JSON.stringify({ type: "end", data: { path: { text: file } } }),
      rgSummaryLine(),
    ].join("\n");

    resolveExecFile(stdout);

    const hits = await searchCode("const x");

    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe("const x = 1;");
  });

  it("skips malformed (non-JSON) lines without throwing", async () => {
    const file = path.join(REPO_ROOT, "src/foo.ts");
    const stdout = [
      "this is not json",
      rgMatchLine(file, 7, "const y = 2;"),
      "another bad line {{{",
    ].join("\n");

    resolveExecFile(stdout);

    const hits = await searchCode("const y");

    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe("const y = 2;");
  });

  it("returns [] when rg exits with code 1 and empty stdout (zero matches)", async () => {
    rejectExecFile(1, "", "");

    const hits = await searchCode("no_match_anywhere_xyz");

    expect(hits).toEqual([]);
  });

  it("does NOT throw when rg exits with code 1 (zero-match case)", async () => {
    rejectExecFile(1, "", "");

    await expect(searchCode("nothing")).resolves.toEqual([]);
  });

  it("throws when rg exits with code 2 (real error, not a no-match)", async () => {
    rejectExecFile(2, "", "error: regex syntax error");

    await expect(searchCode("bad[regex")).rejects.toThrow(/searchCode: rg failed.*code 2/);
  });

  it("throws when rg exits with code 1 BUT stdout is non-empty (unexpected case)", async () => {
    // code 1 + non-empty stdout means execErr.stdout?.trim() is truthy → throws
    rejectExecFile(1, "some content", "");

    await expect(searchCode("pattern")).rejects.toThrow(/searchCode: rg failed/);
  });

  it("returns file paths relative to REPO_ROOT", async () => {
    const absFile = path.join(REPO_ROOT, "src/agents/sub-agent.ts");
    const stdout = [rgMatchLine(absFile, 1, "import")].join("\n");

    resolveExecFile(stdout);

    const hits = await searchCode("import");

    expect(hits[0].file).toBe("src/agents/sub-agent.ts");
    expect(path.isAbsolute(hits[0].file)).toBe(false);
  });

  it("trims trailing newline from match text", async () => {
    const file = path.join(REPO_ROOT, "src/foo.ts");
    const stdout = JSON.stringify({
      type: "match",
      data: {
        path: { text: file },
        line_number: 3,
        lines: { text: "  const x = 1;  \n" },
      },
    });

    resolveExecFile(stdout);

    const hits = await searchCode("const");

    expect(hits[0].text).toBe("const x = 1;");
  });

  it("respects the glob arg and passes search path to rg", async () => {
    const file = path.join(REPO_ROOT, "src/agents/foo.ts");
    resolveExecFile(rgMatchLine(file, 1, "match"));

    const hits = await searchCode("match", "src/agents");

    expect(hits).toHaveLength(1);
    // Verify the resolved search path was src/agents subdir (not REPO_ROOT)
    // We confirm by checking the returned file is under src/agents
    expect(hits[0].file).toBe("src/agents/foo.ts");
  });

  it("throws for a path traversal in the glob arg", async () => {
    await expect(searchCode("pattern", "../../etc")).rejects.toThrow(
      /resolveGlob.*escapes REPO_ROOT/,
    );
  });

  it("caps results at 50 hits", async () => {
    const file = path.join(REPO_ROOT, "src/foo.ts");
    // 60 match lines
    const stdout = Array.from({ length: 60 }, (_, i) =>
      rgMatchLine(file, i + 1, `line ${i + 1}`),
    ).join("\n");

    resolveExecFile(stdout);

    const hits = await searchCode("line");

    expect(hits).toHaveLength(50);
  });
});
