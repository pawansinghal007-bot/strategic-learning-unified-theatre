import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { statMock, readFileMock } = vi.hoisted(() => ({
  statMock: vi.fn(),
  readFileMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    stat: statMock,
    readFile: readFileMock,
  },
}));

import {
  getDaemonStatus,
  DAEMON_PID_FILE,
} from "../src/daemon/daemonStatus.js";

describe("daemonStatus", () => {
  let killSpy;
  let warnSpy;

  beforeEach(() => {
    statMock.mockReset();
    readFileMock.mockReset();
    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports a DAEMON_PID_FILE path ending in .vscode-rotator/daemon.pid", () => {
    expect(DAEMON_PID_FILE).toContain(".vscode-rotator");
    expect(DAEMON_PID_FILE).toContain("daemon.pid");
  });

  it("returns DEGRADED when the PID file doesn't exist (fs.stat throws)", async () => {
    statMock.mockRejectedValueOnce(new Error("ENOENT: no such file"));

    const result = await getDaemonStatus();

    expect(result.status).toBe("DEGRADED");
    expect(result.running).toBe(false);
    expect(result.pid).toBeNull();
    expect(result.reason).toContain("PID file missing");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns ERROR when the PID path exists but isn't a file", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => false });

    const result = await getDaemonStatus();

    expect(result.status).toBe("ERROR");
    expect(result.running).toBe(false);
    expect(result.reason).toContain("PID path exists but is not a file");
  });

  it("returns ERROR when the PID file exists but can't be read", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockRejectedValueOnce(new Error("permission denied"));

    const result = await getDaemonStatus();

    expect(result.status).toBe("ERROR");
    expect(result.reason).toContain("Unable to read PID file");
    expect(result.reason).toContain("permission denied");
  });

  it("returns ERROR for non-numeric PID file content", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("not-a-pid");

    const result = await getDaemonStatus();

    expect(result.status).toBe("ERROR");
    expect(result.reason).toContain("Invalid PID value in file: not-a-pid");
  });

  it("returns ERROR for empty/whitespace-only PID file content", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("   \n");

    const result = await getDaemonStatus();

    expect(result.status).toBe("ERROR");
    expect(result.reason).toContain("Invalid PID value");
  });

  it("returns ERROR for a zero or negative PID", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("0");

    const result = await getDaemonStatus();

    expect(result.status).toBe("ERROR");
    expect(result.reason).toContain("Invalid PID value in file: 0");

    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("-5");

    const result2 = await getDaemonStatus();
    expect(result2.status).toBe("ERROR");
  });

  it("returns ERROR for a non-integer PID (e.g. a float)", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("12.5");

    const result = await getDaemonStatus();

    expect(result.status).toBe("ERROR");
    expect(result.reason).toContain("Invalid PID value");
  });

  it("trims whitespace around an otherwise-valid PID", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("  4242  \n");

    const result = await getDaemonStatus();

    expect(result.status).toBe("OK");
    expect(result.pid).toBe(4242);
  });

  it("returns OK and running:true when the process is alive (process.kill succeeds)", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("1234");
    killSpy.mockImplementation(() => true);

    const result = await getDaemonStatus();

    expect(result).toEqual({
      status: "OK",
      running: true,
      pid: 1234,
      reason: null,
    });
    expect(killSpy).toHaveBeenCalledWith(1234, 0);
  });

  it("returns DEGRADED when the PID is stale (process.kill throws ESRCH)", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("1234");
    killSpy.mockImplementation(() => {
      const err = new Error("No such process");
      err.code = "ESRCH";
      throw err;
    });

    const result = await getDaemonStatus();

    expect(result.status).toBe("DEGRADED");
    expect(result.running).toBe(false);
    expect(result.pid).toBe(1234);
    expect(result.reason).toContain("not running");
  });

  it("treats EPERM as the process being alive but owned by another user (still OK)", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("1234");
    killSpy.mockImplementation(() => {
      const err = new Error("Operation not permitted");
      err.code = "EPERM";
      throw err;
    });

    const result = await getDaemonStatus();

    expect(result).toEqual({
      status: "OK",
      running: true,
      pid: 1234,
      reason: null,
    });
  });

  it("returns ERROR for any other process.kill failure code", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("1234");
    killSpy.mockImplementation(() => {
      const err = new Error("Something else went wrong");
      err.code = "EACCES";
      throw err;
    });

    const result = await getDaemonStatus();

    expect(result.status).toBe("ERROR");
    expect(result.running).toBe(false);
    expect(result.pid).toBe(1234);
    expect(result.reason).toContain("Something else went wrong");
  });

  it("returns ERROR using String(err) when process.kill throws something with no .message", async () => {
    statMock.mockResolvedValueOnce({ isFile: () => true });
    readFileMock.mockResolvedValueOnce("1234");
    killSpy.mockImplementation(() => {
      // eslint-disable-next-line no-throw-literal
      throw "raw kill failure";
    });

    const result = await getDaemonStatus();

    expect(result.status).toBe("ERROR");
    expect(result.reason).toBe("raw kill failure");
  });
});
