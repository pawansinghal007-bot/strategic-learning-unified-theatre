/**
 * logger-coverage_test.js
 *
 * Covers all remaining branch/line gaps in logger.js:
 *
 *   33-36  writeLine – sink === "file" branch:
 *            mkdirSync, appendFileSync, chmodSync, return
 *   40-41  writeLine – outer catch: write throws → console.error("[logger] write failed")
 *   51     normalizeError – ROTATOR_LOG_STACKS set + Error with stack →
 *            normalized.stack is assigned
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createLogger } from "../src/logger.js";

describe("logger: remaining branch coverage", () => {
  const originalSink = process.env.ROTATOR_LOG_SINK;
  const originalLevel = process.env.ROTATOR_LOG_LEVEL;
  const originalStacks = process.env.ROTATOR_LOG_STACKS;

  beforeEach(() => {
    process.env.ROTATOR_LOG_LEVEL = "info";
    process.env.ROTATOR_LOG_SINK = "stdout";
    delete process.env.ROTATOR_LOG_STACKS;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    originalLevel === undefined
      ? delete process.env.ROTATOR_LOG_LEVEL
      : (process.env.ROTATOR_LOG_LEVEL = originalLevel);
    originalSink === undefined
      ? delete process.env.ROTATOR_LOG_SINK
      : (process.env.ROTATOR_LOG_SINK = originalSink);
    originalStacks === undefined
      ? delete process.env.ROTATOR_LOG_STACKS
      : (process.env.ROTATOR_LOG_STACKS = originalStacks);
  });

  // ── lines 33-36: ROTATOR_LOG_SINK=file ────────────────────────────────────
  // logger.js uses LOG_DIR = ~/.vscode-rotator and LOG_PATH = ~/.vscode-rotator/app.log.
  // These are module-level constants captured at import time — we cannot redirect
  // them via mocking. Instead we let the real mkdirSync/appendFileSync/chmodSync
  // run against the real filesystem (same as production), then verify the file
  // was written and that stdout was NOT used.
  it("writes to file and skips stdout when ROTATOR_LOG_SINK=file (lines 33-36)", async () => {
    const logDir = path.join(os.homedir(), ".vscode-rotator");
    const logPath = path.join(logDir, "app.log");

    // Remove any pre-existing log file so we can detect the new write cleanly
    await fs.rm(logPath, { force: true });

    process.env.ROTATOR_LOG_SINK = "file";
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    createLogger("file-test").info("going to file");

    // stdout must NOT have been used (early return on line 36)
    expect(stdoutSpy).not.toHaveBeenCalled();

    // The log file must now exist and contain the emitted JSON line
    const contents = await fs.readFile(logPath, "utf8");
    const lastLine = contents.trim().split("\n").at(-1);
    const entry = JSON.parse(lastLine);
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("going to file");
    expect(entry.module).toBe("file-test");

    // Cleanup
    await fs.rm(logPath, { force: true });
  });

  // ── lines 40-41: writeLine outer catch → console.error ───────────────────
  // When process.stdout.write throws, the outer catch on line 40 fires and
  // calls console.error("[logger] write failed") on line 41.
  it("catches write errors and calls console.error (lines 40-41)", () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => {
      throw new Error("stdout broken");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      createLogger("err-test").info("will fail to write"),
    ).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith("[logger] write failed");
  });

  // ── line 51: ROTATOR_LOG_STACKS → normalized.stack assigned ──────────────
  // normalizeError assigns normalized.stack only when ROTATOR_LOG_STACKS is
  // set, error is an Error instance, and error.stack is truthy.
  it("includes redacted error.stack when ROTATOR_LOG_STACKS is set (line 51)", () => {
    process.env.ROTATOR_LOG_STACKS = "1";
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const err = new Error("boom with stack");
    createLogger("stack-test").error("failed", { error: err });

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const entry = JSON.parse(stdoutSpy.mock.calls[0][0].trim());
    expect(entry.error.message).toBe("boom with stack");
    expect(entry.error.stack).toBeDefined();
    expect(entry.error.stack).toContain("boom with stack");
  });
});
