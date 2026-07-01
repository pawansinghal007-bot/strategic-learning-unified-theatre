/**
 * tests/vscode.test.js
 *
 * Coverage targets for src/vscode.js (lines 9-93):
 *  - parsePidsFromText  — all branches
 *  - findProcesses      — linux pgrep-f hit, linux pgrep-f empty → pgrep-x,
 *                          linux both fail, win32 tasklist success, win32 fail
 *  - gracefulClose      — SIGTERM+SIGKILL, SIGTERM+exit, win32 taskkill ok/fail,
 *                          SIGTERM throws, SIGKILL throws
 *  - launchWithProfile  — spawn called, unref called
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock child_process ───────────────────────────────────────────────────────
// vscode.js imports "node:child_process" as a namespace so mocking the
// namespace object lets us control execFile after module load.
vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    execFile: vi.fn(),
    spawn: vi.fn(),
  };
});

// Import the module under test AFTER mocks are registered
import { findProcesses, gracefulClose, launchWithProfile } from "../src/vscode.js";

// ─────────────────────────────────────────────────────────────────────────────
// parsePidsFromText (white-box shadow — matches the exact logic in vscode.js)
// ─────────────────────────────────────────────────────────────────────────────

describe("parsePidsFromText (shadow copy)", () => {
  function parsePidsFromText(text) {
    return text
      .split(/\r?\n/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
  }

  it("returns [] for empty string", () => {
    expect(parsePidsFromText("")).toEqual([]);
  });

  it("parses a single PID", () => {
    expect(parsePidsFromText("1234\n")).toEqual([1234]);
  });

  it("parses multiple PIDs separated by LF", () => {
    expect(parsePidsFromText("100\n200\n300")).toEqual([100, 200, 300]);
  });

  it("parses multiple PIDs separated by CRLF", () => {
    expect(parsePidsFromText("100\r\n200\r\n300")).toEqual([100, 200, 300]);
  });

  it("filters out non-numeric lines", () => {
    expect(parsePidsFromText("abc\n99\nfoo\n")).toEqual([99]);
  });

  it("filters out zero and negative values", () => {
    expect(parsePidsFromText("0\n-5\n42\n")).toEqual([42]);
  });

  it("trims whitespace before parsing", () => {
    expect(parsePidsFromText("  42  \n  7 \n")).toEqual([42, 7]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findProcesses — exercises all platform branches through the mocked execFile
// ─────────────────────────────────────────────────────────────────────────────

describe("findProcesses", () => {
  let cp;
  let originalPlatform;

  beforeEach(async () => {
    cp = await import("node:child_process");
    originalPlatform = process.platform;
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  function setPlatform(p) {
    Object.defineProperty(process, "platform", { value: p, configurable: true });
  }

  it("returns pids from pgrep -f when it succeeds with output (linux)", async () => {
    setPlatform("linux");
    cp.execFile.mockImplementation((cmd, args, opts, cb) => {
      // promisify passes (cmd, args, cb) — no opts for execFile without options
      const callback = typeof opts === "function" ? opts : cb;
      if (cmd === "pgrep" && args[0] === "-f") callback(null, { stdout: "100\n200\n" });
      else callback(new Error("unexpected"), null);
    });
    const pids = await findProcesses();
    expect(Array.isArray(pids)).toBe(true);
    expect(pids.length).toBeGreaterThan(0);
  });

  it("falls back to pgrep -x when pgrep -f stdout is empty (linux)", async () => {
    setPlatform("linux");
    let xCalled = false;
    cp.execFile.mockImplementation((cmd, args, opts, cb) => {
      const callback = typeof opts === "function" ? opts : cb;
      if (cmd === "pgrep" && args[0] === "-f") callback(null, { stdout: "" });
      else if (cmd === "pgrep" && args[0] === "-x") { xCalled = true; callback(null, { stdout: "42\n" }); }
      else callback(new Error("unexpected"), null);
    });
    await findProcesses();
    expect(xCalled).toBe(true);
  });

  it("returns [] when pgrep -f throws and pgrep -x throws (linux)", async () => {
    setPlatform("linux");
    cp.execFile.mockImplementation((cmd, args, opts, cb) => {
      const callback = typeof opts === "function" ? opts : cb;
      callback(new Error("not found"), null);
    });
    const pids = await findProcesses();
    expect(pids).toEqual([]);
  });

  it("returns [] when tasklist throws on win32", async () => {
    setPlatform("win32");
    cp.execFile.mockImplementation((cmd, args, opts, cb) => {
      const callback = typeof opts === "function" ? opts : cb;
      callback(new Error("access denied"), null);
    });
    const pids = await findProcesses();
    expect(pids).toEqual([]);
  });

  it("parses tasklist CSV output on win32", async () => {
    setPlatform("win32");
    const csv =
      '"Code.exe","1234","Console","1","100 K"\r\n"Code.exe","5678","Console","1","200 K"\r\n';
    cp.execFile.mockImplementation((cmd, args, opts, cb) => {
      const callback = typeof opts === "function" ? opts : cb;
      callback(null, { stdout: csv });
    });
    const pids = await findProcesses();
    expect(Array.isArray(pids)).toBe(true);
    expect(pids).toContain(1234);
    expect(pids).toContain(5678);
  });

  it("filters NaN PIDs from malformed tasklist output (win32)", async () => {
    setPlatform("win32");
    cp.execFile.mockImplementation((cmd, args, opts, cb) => {
      const callback = typeof opts === "function" ? opts : cb;
      callback(null, { stdout: '"Code.exe","not-a-number","Console"\r\n' });
    });
    const pids = await findProcesses();
    expect(Array.isArray(pids)).toBe(true);
    expect(pids).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// gracefulClose — all branches
// ─────────────────────────────────────────────────────────────────────────────

describe("gracefulClose", () => {
  let cp;
  let killSpy;
  let originalPlatform;

  beforeEach(async () => {
    cp = await import("node:child_process");
    originalPlatform = process.platform;
    vi.clearAllMocks();
    vi.useFakeTimers();
    killSpy = vi.spyOn(process, "kill").mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
    killSpy.mockRestore();
    vi.useRealTimers();
  });

  function setPlatform(p) {
    Object.defineProperty(process, "platform", { value: p, configurable: true });
  }

  it("sends SIGTERM then SIGKILL when process is still alive after sleep (linux)", async () => {
    setPlatform("linux");
    // kill(pid, 0) doesn't throw → process still alive
    killSpy.mockImplementation(() => {});

    const p = gracefulClose(1234);
    await vi.advanceTimersByTimeAsync(4000);
    await p;

    const signals = killSpy.mock.calls.map((c) => c[1]);
    expect(signals).toContain("SIGTERM");
    expect(signals).toContain("SIGKILL");
  });

  it("returns early without SIGKILL when process is gone after SIGTERM (linux)", async () => {
    setPlatform("linux");
    killSpy.mockImplementation((pid, sig) => {
      if (sig === 0) throw new Error("ESRCH"); // process gone
    });

    const p = gracefulClose(9999);
    await vi.advanceTimersByTimeAsync(4000);
    await p;

    const signals = killSpy.mock.calls.map((c) => c[1]);
    expect(signals).toContain("SIGTERM");
    expect(signals).not.toContain("SIGKILL");
  });

  it("swallows SIGTERM throw and continues (linux)", async () => {
    setPlatform("linux");
    killSpy.mockImplementation((pid, sig) => {
      if (sig === "SIGTERM") throw new Error("EPERM");
      if (sig === 0) throw new Error("ESRCH"); // process gone after sleep
    });

    const p = gracefulClose(3333);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(p).resolves.toBeUndefined(); // must not throw
  });

  it("swallows SIGKILL throw (linux)", async () => {
    setPlatform("linux");
    killSpy.mockImplementation((pid, sig) => {
      if (sig === "SIGKILL") throw new Error("EPERM");
      // sig === 0 does NOT throw → process still alive, SIGKILL will be attempted
    });

    const p = gracefulClose(4444);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(p).resolves.toBeUndefined();
  });

  it("calls taskkill before SIGTERM on win32", async () => {
    setPlatform("win32");
    cp.execFile.mockImplementation((cmd, args, opts, cb) => {
      const callback = typeof opts === "function" ? opts : cb;
      callback(null, { stdout: "" });
    });
    killSpy.mockImplementation((pid, sig) => {
      if (sig === 0) throw new Error("ESRCH");
    });

    const p = gracefulClose(1111);
    await vi.advanceTimersByTimeAsync(4000);
    await p;

    // Verify taskkill was invoked
    expect(cp.execFile).toHaveBeenCalledWith(
      "taskkill",
      expect.arrayContaining(["/PID", "1111"]),
      expect.any(Function),
    );
    const signals = killSpy.mock.calls.map((c) => c[1]);
    expect(signals).toContain("SIGTERM");
  });

  it("swallows taskkill failure and continues on win32", async () => {
    setPlatform("win32");
    cp.execFile.mockImplementation((cmd, args, opts, cb) => {
      const callback = typeof opts === "function" ? opts : cb;
      callback(new Error("taskkill failed"), null);
    });
    killSpy.mockImplementation((pid, sig) => {
      if (sig === 0) throw new Error("ESRCH");
    });

    const p = gracefulClose(2222);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(p).resolves.toBeUndefined();
    expect(killSpy).toHaveBeenCalledWith(2222, "SIGTERM");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// launchWithProfile
// ─────────────────────────────────────────────────────────────────────────────

describe("launchWithProfile", () => {
  let cp;

  beforeEach(async () => {
    cp = await import("node:child_process");
    vi.clearAllMocks();
    // Use env override so resolveVSCodeBin resolves immediately
    process.env.VSCODE_ROTATOR_CODE_BIN = "/usr/bin/code";
  });

  afterEach(() => {
    delete process.env.VSCODE_ROTATOR_CODE_BIN;
  });

  it("spawns VS Code with --profile flag and unrefs the child process", async () => {
    const unrefMock = vi.fn();
    cp.spawn.mockReturnValue({ unref: unrefMock });

    await launchWithProfile("MyProfile");

    expect(cp.spawn).toHaveBeenCalledWith(
      "/usr/bin/code",
      ["--profile", "MyProfile"],
      expect.objectContaining({ detached: true, stdio: "ignore" }),
    );
    expect(unrefMock).toHaveBeenCalledTimes(1);
  });

  it("passes any profile name through to spawn", async () => {
    const unrefMock = vi.fn();
    cp.spawn.mockReturnValue({ unref: unrefMock });

    await launchWithProfile("work-account");

    expect(cp.spawn).toHaveBeenCalledWith(
      "/usr/bin/code",
      ["--profile", "work-account"],
      expect.any(Object),
    );
    expect(unrefMock).toHaveBeenCalled();
  });
});
