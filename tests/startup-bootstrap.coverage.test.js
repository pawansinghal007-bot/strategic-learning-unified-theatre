/**
 * startup-bootstrap-coverage_test.js
 *
 * Covers all uncovered lines/branches in startup-bootstrap.js:
 *
 *   26-30  setTimeout callback – credentials is null/falsy →
 *            activeLogger.log("Bootstrap paused…") + return
 *   32-34  setTimeout callback – credentials truthy →
 *            activeLogger.log("Bootstrap completed…")
 *   36-40  setTimeout callback – getSupervisorCredentials throws →
 *            activeLogger.error(…) + console.error(…)
 *
 * Also covers normalizeLogger fallback branches (lines 11-17):
 *   logger.log not a function  → noopLogger.log used
 *   logger.error not a function → noopLogger.error used
 *
 * Strategy: vi.useFakeTimers() + vi.runAllTimersAsync() forces the
 * setTimeout(fn, 0) callback to execute and complete within the test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initializeStartupBootstrap } from "../src/startup-bootstrap.js";
import * as secretStore from "../src/accounts/secret-store.js";

vi.mock("../src/accounts/secret-store.js", () => ({
  getSupervisorCredentials: vi.fn(),
  setSupervisorCredentials: vi.fn(),
}));

describe("startup-bootstrap: full async coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── lines 26-30: credentials null → "Bootstrap paused" + early return ────
  it("logs 'Bootstrap paused' and returns early when credentials are null (lines 26-30)", async () => {
    secretStore.getSupervisorCredentials.mockResolvedValue(null);
    const mockLogger = { log: vi.fn(), error: vi.fn() };

    const result = initializeStartupBootstrap(mockLogger);
    expect(result.status).toBe("initializing_in_background");

    // Drive the setTimeout(fn, 0) callback to completion
    await vi.runAllTimersAsync();

    expect(mockLogger.log).toHaveBeenCalledOnce();
    expect(mockLogger.log).toHaveBeenCalledWith(
      "[Supervisor] Bootstrap paused: Missing secure credentials.",
    );
    // The early return means the "completed" message must NOT appear
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.log.mock.calls[0][0]).not.toContain("completed");
  });

  // ── lines 32-34: credentials truthy → "Bootstrap completed" ──────────────
  it("logs 'Bootstrap completed' when credentials are present (lines 32-34)", async () => {
    secretStore.getSupervisorCredentials.mockResolvedValue({
      username: "supervisor",
      token: "tok-123",
    });
    const mockLogger = { log: vi.fn(), error: vi.fn() };

    initializeStartupBootstrap(mockLogger);
    await vi.runAllTimersAsync();

    expect(mockLogger.log).toHaveBeenCalledOnce();
    expect(mockLogger.log).toHaveBeenCalledWith(
      "[Supervisor] Bootstrap completed successfully. Ready for session continuity.",
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  // ── lines 36-40: getSupervisorCredentials throws → catch branch ──────────
  it("calls activeLogger.error and console.error when credentials throw (lines 36-40)", async () => {
    const boom = new Error("Keychain locked");
    secretStore.getSupervisorCredentials.mockRejectedValue(boom);
    const mockLogger = { log: vi.fn(), error: vi.fn() };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    initializeStartupBootstrap(mockLogger);
    await vi.runAllTimersAsync();

    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error).toHaveBeenCalledWith(
      "[Supervisor] Bootstrap failed gracefully. Action required: Check secure storage.",
      { error: boom },
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[startup-bootstrap] bootstrap failed",
      boom,
    );
    expect(mockLogger.log).not.toHaveBeenCalled();
  });

  // ── normalizeLogger fallbacks (lines 11-17) ───────────────────────────────
  // When logger.log or logger.error are not functions, noopLogger methods are
  // used. We verify this doesn't throw by passing loggers missing those methods.
  it("uses noop fallback when logger.log is not a function (lines 11-14)", async () => {
    secretStore.getSupervisorCredentials.mockResolvedValue({ token: "t" });
    // logger with no `log` method — normalizeLogger falls back to noopLogger.log
    const partialLogger = { error: vi.fn() };

    expect(() => {
      const r = initializeStartupBootstrap(partialLogger);
      expect(r.status).toBe("initializing_in_background");
    }).not.toThrow();

    // Running the timer must not throw even though logger.log is a noop
    await expect(vi.runAllTimersAsync()).resolves.not.toThrow();
    // error was not called (credentials were present)
    expect(partialLogger.error).not.toHaveBeenCalled();
  });

  it("uses noop fallback when logger.error is not a function (lines 15-17)", async () => {
    const boom = new Error("vault down");
    secretStore.getSupervisorCredentials.mockRejectedValue(boom);
    // logger with no `error` method — normalizeLogger falls back to noopLogger.error
    const partialLogger = { log: vi.fn() };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => initializeStartupBootstrap(partialLogger)).not.toThrow();
    await expect(vi.runAllTimersAsync()).resolves.not.toThrow();

    // consoleSpy confirms the catch block ran despite error being a noop
    expect(consoleSpy).toHaveBeenCalledWith(
      "[startup-bootstrap] bootstrap failed",
      boom,
    );
  });

  // ── default logger parameter (logger = noopLogger, line 21) ──────────────
  it("works with no logger argument, using the built-in noop (line 21)", async () => {
    secretStore.getSupervisorCredentials.mockResolvedValue(null);

    // Called with no arguments — uses default `logger = noopLogger`
    const result = initializeStartupBootstrap();
    expect(result.status).toBe("initializing_in_background");
    await expect(vi.runAllTimersAsync()).resolves.not.toThrow();
  });
});
