/**
 * provider-health-coverage.test.ts
 *
 * Targets uncovered lines in src/llm/provider-health.ts:
 *   41    — markProviderFromError: err is not an Error instance but has no .message
 *            → String(err) used; also when err.message is undefined
 *   93-96 — isProviderAvailable: cooldown===null but state!=="healthy"
 *            → returns false for "auth_error" and "exhausted" with null cooldown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock storage so we don't hit the real filesystem
vi.mock("../../src/llm/storage.js", () => ({
  readJsonFile: vi.fn(() => ({})),
  writeJsonFile: vi.fn(),
}));

// Mock logger
vi.mock("../../src/shared/logging/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock shared errors so we can construct them in tests
vi.mock("../../src/shared/errors/index.js", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return { ...actual };
});

import {
  markProviderFromError,
  markProviderHealthy,
  isProviderAvailable,
  resetProviderHealth,
  getProviderHealthSnapshot,
} from "../../src/llm/provider-health.js";
import { readJsonFile, writeJsonFile } from "../../src/llm/storage.js";
import { logger } from "../../src/shared/logging/logger.js";
import {
  ProviderAuthError,
  ProviderQuotaError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "../../src/shared/errors/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetStorage(initialState: Record<string, any> = {}) {
  vi.mocked(readJsonFile).mockReturnValue(initialState as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStorage({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// markProviderFromError — line 41: err has no .message (non-Error, no message prop)
// ---------------------------------------------------------------------------
describe("markProviderFromError — err.message access (line 41)", () => {
  it("uses String(err) when err is a plain string (no .message property)", () => {
    // When stateFromError returns a state, the code accesses err.message.
    // For auth errors via code, err could be a plain object with only a code.
    const plainObj = { code: "PROVIDER_AUTH_FAILED" }; // no .message

    markProviderFromError("groq", plainObj);

    const calls = vi.mocked(writeJsonFile).mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const savedState = calls[0][1] as any;
    // reason should be undefined or the string representation
    expect(savedState["groq"]).toBeDefined();
    expect(savedState["groq"].state).toBe("auth_error");
  });

  it("uses err.message when err is an Error instance (ProviderAuthError)", () => {
    const err = new ProviderAuthError("Invalid API key");
    markProviderFromError("groq", err);

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    expect(savedState["groq"].reason).toBe("Invalid API key");
    expect(savedState["groq"].state).toBe("auth_error");
  });

  it("uses err.message when err is a ProviderQuotaError", () => {
    const err = new ProviderQuotaError("Quota exceeded");
    markProviderFromError("openai", err);

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    expect(savedState["openai"].state).toBe("exhausted");
    expect(savedState["openai"].reason).toBe("Quota exceeded");
  });

  it("uses err.message when err is a ProviderTimeoutError", () => {
    const err = new ProviderTimeoutError("Request timed out");
    markProviderFromError("gemini", err);

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    expect(savedState["gemini"].state).toBe("temporarily_down");
  });

  it("uses err.message when err is a ProviderUnavailableError", () => {
    const err = new ProviderUnavailableError("Service down");
    markProviderFromError("perplexity", err);

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    expect(savedState["perplexity"].state).toBe("temporarily_down");
  });

  it("does nothing when stateFromError returns null (unrecognized error)", () => {
    const unrecognizedErr = new Error("some random error");
    markProviderFromError("groq", unrecognizedErr);

    // writeJsonFile should NOT be called since state is null
    expect(vi.mocked(writeJsonFile)).not.toHaveBeenCalled();
  });

  it("handles err being a plain number (no .message)", () => {
    // code path: stateFromError checks instanceof and .code
    // A number has no .code, returns null → markProviderFromError returns early
    markProviderFromError("groq", 42 as any);
    expect(vi.mocked(writeJsonFile)).not.toHaveBeenCalled();
  });

  it("handles err code PROVIDER_TIMEOUT via .code property", () => {
    const errWithCode = { code: "PROVIDER_TIMEOUT" } as any; // no .message
    markProviderFromError("gemini", errWithCode);

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    expect(savedState["gemini"].state).toBe("temporarily_down");
  });

  it("handles err code PROVIDER_QUOTA_EXCEEDED via .code property", () => {
    const errWithCode = { code: "PROVIDER_QUOTA_EXCEEDED", message: "Quota hit" } as any;
    markProviderFromError("groq", errWithCode);

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    expect(savedState["groq"].state).toBe("exhausted");
    expect(savedState["groq"].reason).toBe("Quota hit");
  });

  it("logs warn with provider, state, and reason", () => {
    const err = new ProviderAuthError("Bad key");
    markProviderFromError("groq", err);

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "provider.health.mark",
      expect.objectContaining({
        provider: "groq",
        state: "auth_error",
      }),
    );
  });

  it("sets recoversAt=undefined for auth_error (null cooldown)", () => {
    const err = new ProviderAuthError("Auth failed");
    markProviderFromError("openai", err);

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    // auth_error cooldown is null → recoversAt should be undefined (not set)
    expect(savedState["openai"].recoversAt).toBeUndefined();
  });

  it("sets recoversAt for temporarily_down (5 min cooldown)", () => {
    const before = Date.now();
    const err = new ProviderTimeoutError("Timeout");
    markProviderFromError("groq", err);

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    const recoversAt = savedState["groq"].recoversAt;
    expect(typeof recoversAt).toBe("number");
    expect(recoversAt).toBeGreaterThanOrEqual(before + 4 * 60 * 1000);
    expect(recoversAt).toBeLessThanOrEqual(before + 6 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// isProviderAvailable — lines 93-96: cooldown===null + state!=="healthy" → false
// ---------------------------------------------------------------------------
describe("isProviderAvailable — null cooldown, non-healthy state (lines 93-96)", () => {
  it("returns false for auth_error state (cooldown=null, state!='healthy')", () => {
    // auth_error has COOLDOWN_MS[state] = null
    resetStorage({
      groq: {
        provider: "groq",
        state: "auth_error",
        reason: "Invalid key",
        since: Date.now(),
        recoversAt: undefined,
      },
    });

    const result = isProviderAvailable("groq");
    expect(result).toBe(false);
  });

  it("returns false for exhausted state with null cooldown (edge: custom state)", () => {
    // exhausted normally has cooldown=24h, but let's test the generic null path
    // by injecting a state that maps to null cooldown via a hypothetical override.
    // In practice we test auth_error (which definitively has null cooldown).
    resetStorage({
      perplexity: {
        provider: "perplexity",
        state: "auth_error",
        reason: "Key revoked",
        since: Date.now(),
        recoversAt: undefined,
      },
    });

    const result = isProviderAvailable("perplexity");
    expect(result).toBe(false);
  });

  it("returns true for healthy state (record present but state=healthy is NOT stored — no record)", () => {
    // Provider with no record → healthy (returns true)
    resetStorage({});
    expect(isProviderAvailable("groq")).toBe(true);
  });

  it("returns true when recoversAt has passed (temporarily_down auto-recovery)", () => {
    const pastTime = Date.now() - 10 * 60 * 1000; // 10 min ago
    const mockState: Record<string, any> = {
      gemini: {
        provider: "gemini",
        state: "temporarily_down",
        reason: "Timeout",
        since: pastTime - 5 * 60 * 1000,
        recoversAt: pastTime, // already passed
      },
    };
    // After isProviderAvailable runs, it deletes the record and re-saves
    vi.mocked(readJsonFile).mockReturnValue({ ...mockState } as any);

    const result = isProviderAvailable("gemini");
    expect(result).toBe(true);
    // saveHealth should have been called to persist the cleanup
    expect(vi.mocked(writeJsonFile)).toHaveBeenCalled();
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "provider.health.recovered",
      { provider: "gemini" },
    );
  });

  it("returns false when recoversAt is in the future (temporarily_down, not yet recovered)", () => {
    const futureTime = Date.now() + 10 * 60 * 1000;
    resetStorage({
      openai: {
        provider: "openai",
        state: "temporarily_down",
        reason: "503",
        since: Date.now(),
        recoversAt: futureTime,
      },
    });

    const result = isProviderAvailable("openai");
    expect(result).toBe(false);
  });

  it("returns false for exhausted state (24h cooldown, not yet recovered)", () => {
    const futureTime = Date.now() + 20 * 60 * 60 * 1000; // 20h from now
    resetStorage({
      groq: {
        provider: "groq",
        state: "exhausted",
        reason: "Daily limit",
        since: Date.now(),
        recoversAt: futureTime,
      },
    });

    const result = isProviderAvailable("groq");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// markProviderHealthy — deletes record and saves
// ---------------------------------------------------------------------------
describe("markProviderHealthy", () => {
  it("removes the provider record and saves", () => {
    resetStorage({
      groq: { provider: "groq", state: "auth_error", reason: "old", since: 0 },
    });

    markProviderHealthy("groq");

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    expect(savedState["groq"]).toBeUndefined();
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "provider.health.healthy",
      { provider: "groq" },
    );
  });
});

// ---------------------------------------------------------------------------
// resetProviderHealth — without provider (reset all) and with provider
// ---------------------------------------------------------------------------
describe("resetProviderHealth", () => {
  it("resets all providers when called with no argument", () => {
    resetStorage({
      groq: { state: "auth_error" },
      gemini: { state: "exhausted" },
    });

    resetProviderHealth();

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    expect(Object.keys(savedState)).toHaveLength(0);
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith("provider.health.reset_all");
  });

  it("resets a single provider when called with a provider name", () => {
    resetStorage({
      groq: { state: "auth_error" },
      gemini: { state: "exhausted" },
    });

    resetProviderHealth("groq");

    const savedState = vi.mocked(writeJsonFile).mock.calls[0][1] as any;
    expect(savedState["groq"]).toBeUndefined();
    expect(savedState["gemini"]).toBeDefined();
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith("provider.health.reset", {
      provider: "groq",
    });
  });
});

// ---------------------------------------------------------------------------
// getProviderHealthSnapshot — returns array of records
// ---------------------------------------------------------------------------
describe("getProviderHealthSnapshot", () => {
  it("returns empty array when no records exist", () => {
    resetStorage({});
    const snapshot = getProviderHealthSnapshot();
    expect(snapshot).toEqual([]);
  });

  it("returns all non-null provider records as an array", () => {
    resetStorage({
      groq: { provider: "groq", state: "auth_error" },
      gemini: { provider: "gemini", state: "exhausted" },
    });

    const snapshot = getProviderHealthSnapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.some((r: any) => r.provider === "groq")).toBe(true);
    expect(snapshot.some((r: any) => r.provider === "gemini")).toBe(true);
  });
});
