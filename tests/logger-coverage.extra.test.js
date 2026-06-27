/**
 * logger-coverage-extra.test.js
 *
 * Covers the remaining branch gaps in logger.js left after
 * logger-coverage.test.js:
 *
 *   48     normalizeError – error is not an Error instance →
 *            falls back to String(error)
 *   57     buildEntry – fields is explicitly null/non-object (bypasses the
 *            `= {}` default param, which only applies to undefined) →
 *            falls back to {}
 *   68     buildEntry – msg is undefined/null →
 *            `msg ?? ""` true branch
 *   83     createLogger – moduleName is falsy → falls back to "unknown"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createLogger } from "../src/logger.js";

describe("logger: remaining branch coverage (extra)", () => {
  const originalLevel = process.env.ROTATOR_LOG_LEVEL;
  const originalSink = process.env.ROTATOR_LOG_SINK;
  let writeSpy;

  beforeEach(() => {
    process.env.ROTATOR_LOG_LEVEL = "info";
    process.env.ROTATOR_LOG_SINK = "stdout";
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    originalLevel === undefined
      ? delete process.env.ROTATOR_LOG_LEVEL
      : (process.env.ROTATOR_LOG_LEVEL = originalLevel);
    originalSink === undefined
      ? delete process.env.ROTATOR_LOG_SINK
      : (process.env.ROTATOR_LOG_SINK = originalSink);
  });

  function emittedEntry() {
    expect(writeSpy).toHaveBeenCalledTimes(1);
    return JSON.parse(writeSpy.mock.calls[0][0].trim());
  }

  // ── line 48: error is not an Error instance ───────────────────────────
  it("stringifies a non-Error value passed as the error field", () => {
    createLogger("test").error("failed", { error: "raw string failure" });

    const entry = emittedEntry();
    expect(entry.error.message).toBe("raw string failure");
  });

  // ── line 57: fields is explicitly null ─────────────────────────────────
  it("treats an explicit null fields argument as no extra fields", () => {
    // The `fields = {}` default param only kicks in for `undefined`; passing
    // null explicitly bypasses it and exercises buildEntry's own fallback.
    createLogger("test").info("hello", null);

    const entry = emittedEntry();
    expect(entry.msg).toBe("hello");
    expect(entry.correlationId).toBeUndefined();
    expect(entry.error).toBeUndefined();
  });

  // ── line 68: msg is undefined ───────────────────────────────────────────
  it("falls back to an empty string when msg is omitted", () => {
    createLogger("test").info();

    const entry = emittedEntry();
    expect(entry.msg).toBe("");
  });

  // ── line 83: moduleName is falsy ────────────────────────────────────────
  it("falls back to 'unknown' when moduleName is falsy", () => {
    createLogger().info("hello");

    const entry = emittedEntry();
    expect(entry.module).toBe("unknown");
  });
});
