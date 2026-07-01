/**
 * provider-usage-coverage.test.ts
 *
 * Targets uncovered lines in src/llm/provider-usage.ts:
 *   57-69 — autoResetIfNeeded: rec.resetAt is reached (Date.now() >= rec.resetAt)
 *            → resets the record, sets new resetAt, calls logger.info("provider.usage.auto_reset")
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock storage.
// The module has an internal _cache that persists between tests.
// The only way to bypass it is to call resetProviderUsage() which sets _cache={}
// (not null). After that, loadUsage() returns the empty _cache directly without
// reading storage again. So we must inject records AFTER the reset by making
// the write-back mechanism populate _cache via the writeJsonFile mock.
//
// Strategy:
//   1. In beforeEach: call resetProviderUsage() to set _cache={}
//   2. In each test: call the function under test twice:
//      - First call: recordProviderSuccess/Failure will call autoResetIfNeeded
//        which calls ensureRecord which creates a fresh record, then auto-reset
//        runs on that record. But that means the record in _cache won't have
//        our preset high requestCount or past resetAt.
//
// Better strategy: use writeJsonFile to inject into _cache indirectly.
// Since writeJsonFile mock does: `_cache = state` via the module, we can call
// saveUsage-equivalent by calling resetProviderUsage() then... no.
//
// THE REAL FIX: After resetProviderUsage() sets _cache={}, readJsonFile
// is NOT called again (because _cache is non-null). So we need to:
//   a) Call resetProviderUsage() (sets _cache = {}, then writes {} to storage)
//   b) Mutate _cache IN PLACE via saveUsage by calling the module's writeJsonFile
//      mock BUT the module code only calls saveUsage internally...
//
// The simplest working approach: make writeJsonFile mock both update storageState
// AND feed back into the module's _cache by having readJsonFile always return
// the current storageState, COMBINED with calling resetProviderUsage() at the
// start of each test with a special "seed" in storageState that will be picked
// up during the reset's own loadUsage() call... but resetProviderUsage overwrites.
//
// CLEANEST SOLUTION: Use vi.resetModules() + dynamic import per test to get
// a fresh module with clean _cache. This is reliable and idiomatic.
// ---------------------------------------------------------------------------

vi.mock("../../src/shared/logging/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// We will dynamically import provider-usage in each test to get a fresh _cache.
// The storage mock is set up before each test.
let storageState: Record<string, any> = {};

vi.mock("../../src/llm/storage.js", () => ({
  readJsonFile: vi.fn(() => JSON.parse(JSON.stringify(storageState))),
  writeJsonFile: vi.fn((_fileName: string, value: any) => {
    storageState = JSON.parse(JSON.stringify(value));
  }),
}));

import { logger } from "../../src/shared/logging/logger.js";

beforeEach(() => {
  vi.clearAllMocks();
  storageState = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: get fresh module-level functions with a clean _cache
async function freshModule() {
  // Re-import causes a fresh module instance with _cache = null
  // We use vi.resetModules() to bust the import cache
  vi.resetModules();
  // Re-apply storage mock after module reset
  vi.mock("../../src/llm/storage.js", () => ({
    readJsonFile: vi.fn(() => JSON.parse(JSON.stringify(storageState))),
    writeJsonFile: vi.fn((_fileName: string, value: any) => {
      storageState = JSON.parse(JSON.stringify(value));
    }),
  }));
  vi.mock("../../src/shared/logging/logger.js", () => ({
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  }));
  const mod = await import("../../src/llm/provider-usage.js");
  const { logger: log } = await import("../../src/shared/logging/logger.js");
  return { mod, log };
}

// ---------------------------------------------------------------------------
// autoResetIfNeeded — lines 57-69: resetAt in the past → auto-reset fires
// ---------------------------------------------------------------------------
describe("autoResetIfNeeded — reset triggered when resetAt has passed (lines 57-69)", () => {
  it("resets the provider record when resetAt is in the past", async () => {
    const pastResetAt = Date.now() - 1000;
    storageState = {
      groq: {
        provider: "groq",
        requestCount: 50,
        successCount: 45,
        failureCount: 5,
        inputTokens: 10000,
        outputTokens: 5000,
        totalTokens: 15000,
        estimatedCostUsd: 0.5,
        lastUsedAt: Date.now() - 60000,
        resetAt: pastResetAt,
      },
    };

    const { mod, log } = await freshModule();
    mod.recordProviderSuccess("groq", {
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    expect(vi.mocked(log.info)).toHaveBeenCalledWith(
      "provider.usage.auto_reset",
      { provider: "groq" },
    );
    // After reset + 1 success: requestCount=1
    expect(storageState.groq.requestCount).toBe(1);
    expect(storageState.groq.successCount).toBe(1);
    expect(storageState.groq.inputTokens).toBe(10);
  });

  it("resets counts to zero then applies the new operation", async () => {
    const pastResetAt = Date.now() - 5000;
    storageState = {
      groq: {
        provider: "groq",
        requestCount: 100,
        successCount: 90,
        failureCount: 10,
        inputTokens: 50000,
        outputTokens: 25000,
        totalTokens: 75000,
        estimatedCostUsd: 2.5,
        lastUsedAt: Date.now() - 100000,
        resetAt: pastResetAt,
      },
    };

    const { mod, log } = await freshModule();
    mod.recordProviderFailure("groq");

    expect(vi.mocked(log.info)).toHaveBeenCalledWith(
      "provider.usage.auto_reset",
      { provider: "groq" },
    );
    expect(storageState.groq.requestCount).toBe(1);
    expect(storageState.groq.failureCount).toBe(1);
    expect(storageState.groq.successCount).toBe(0);
    expect(storageState.groq.inputTokens).toBe(0);
  });

  it("does NOT auto-reset when resetAt is null", async () => {
    storageState = {
      local: {
        provider: "local",
        requestCount: 20,
        successCount: 20,
        failureCount: 0,
        inputTokens: 2000,
        outputTokens: 1000,
        totalTokens: 3000,
        estimatedCostUsd: 0,
        lastUsedAt: Date.now() - 1000,
        resetAt: null,
      },
    };

    const { mod, log } = await freshModule();
    mod.recordProviderSuccess("local", { usage: {} });

    expect(vi.mocked(log.info)).not.toHaveBeenCalledWith(
      "provider.usage.auto_reset",
      expect.anything(),
    );
    // requestCount should be 21 (20+1), not reset to 1
    expect(storageState.local.requestCount).toBe(21);
  });

  it("does NOT auto-reset when resetAt is in the future", async () => {
    const futureResetAt = Date.now() + 60 * 60 * 1000;
    storageState = {
      groq: {
        provider: "groq",
        requestCount: 15,
        successCount: 15,
        failureCount: 0,
        inputTokens: 3000,
        outputTokens: 1500,
        totalTokens: 4500,
        estimatedCostUsd: 0.2,
        lastUsedAt: Date.now() - 5000,
        resetAt: futureResetAt,
      },
    };

    const { mod, log } = await freshModule();
    mod.recordProviderSuccess("groq", {
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    expect(vi.mocked(log.info)).not.toHaveBeenCalledWith(
      "provider.usage.auto_reset",
      expect.anything(),
    );
    expect(storageState.groq.requestCount).toBe(16);
  });

  it("auto-resets exactly at resetAt boundary (Date.now() >= resetAt)", async () => {
    const nowMs = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(nowMs);

    storageState = {
      perplexity: {
        provider: "perplexity",
        requestCount: 30,
        successCount: 28,
        failureCount: 2,
        inputTokens: 6000,
        outputTokens: 3000,
        totalTokens: 9000,
        estimatedCostUsd: 0.9,
        lastUsedAt: nowMs - 1000,
        resetAt: nowMs, // exactly now → should reset (>= condition)
      },
    };

    const { mod, log } = await freshModule();
    mod.recordProviderSuccess("perplexity", { usage: {} });

    expect(vi.mocked(log.info)).toHaveBeenCalledWith(
      "provider.usage.auto_reset",
      { provider: "perplexity" },
    );
    expect(storageState.perplexity.requestCount).toBe(1);
  });

  it("sets lastUsedAt to a number after auto-reset + operation (line 65)", async () => {
    const pastResetAt = Date.now() - 1;
    storageState = {
      gemini: {
        provider: "gemini",
        requestCount: 5,
        successCount: 5,
        failureCount: 0,
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        estimatedCostUsd: 0.1,
        lastUsedAt: Date.now() - 3600000,
        resetAt: pastResetAt,
      },
    };

    const { mod, log } = await freshModule();
    mod.recordProviderSuccess("gemini", { usage: {} });

    expect(vi.mocked(log.info)).toHaveBeenCalledWith(
      "provider.usage.auto_reset",
      { provider: "gemini" },
    );
    expect(typeof storageState.gemini.lastUsedAt).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// autoResetIfNeeded triggered via getProviderUsage (read-only path)
// ---------------------------------------------------------------------------
describe("autoResetIfNeeded triggered from getProviderUsage", () => {
  it("fires auto-reset for a provider during getProviderUsage when resetAt is past", async () => {
    const pastResetAt = Date.now() - 100;
    storageState = {
      groq: {
        provider: "groq",
        requestCount: 99,
        successCount: 90,
        failureCount: 9,
        inputTokens: 20000,
        outputTokens: 10000,
        totalTokens: 30000,
        estimatedCostUsd: 1.0,
        lastUsedAt: Date.now() - 3600000,
        resetAt: pastResetAt,
      },
    };

    const { mod, log } = await freshModule();
    const usage = mod.getProviderUsage();
    const groqRow = usage.find((u: any) => u.provider === "groq");

    expect(vi.mocked(log.info)).toHaveBeenCalledWith(
      "provider.usage.auto_reset",
      { provider: "groq" },
    );
    expect(groqRow?.requestCount).toBe(0);
    expect(groqRow?.successCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// recordProviderSuccess — token field aliases
// ---------------------------------------------------------------------------
describe("recordProviderSuccess — token field aliases", () => {
  it("uses promptTokens alias when inputTokens is absent", async () => {
    const { mod } = await freshModule();
    mod.recordProviderSuccess("openai", {
      usage: { promptTokens: 20, completionTokens: 10, total_tokens: 30 },
    });
    expect(storageState.openai.inputTokens).toBe(20);
    expect(storageState.openai.outputTokens).toBe(10);
    expect(storageState.openai.totalTokens).toBe(30);
  });

  it("uses prompt_tokens / completion_tokens aliases", async () => {
    const { mod } = await freshModule();
    mod.recordProviderSuccess("groq", {
      usage: { prompt_tokens: 15, completion_tokens: 8 },
    });
    expect(storageState.groq.inputTokens).toBe(15);
    expect(storageState.groq.outputTokens).toBe(8);
    expect(storageState.groq.totalTokens).toBe(23);
  });

  it("uses costUsd alias when estimatedCostUsd is absent", async () => {
    const { mod } = await freshModule();
    mod.recordProviderSuccess("gemini", {
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8, costUsd: 0.001 },
    });
    expect(storageState.gemini.estimatedCostUsd).toBe(0.001);
  });

  it("handles null response gracefully (no usage)", async () => {
    const { mod } = await freshModule();
    mod.recordProviderSuccess("local", null);
    expect(storageState.local.requestCount).toBe(1);
    expect(storageState.local.inputTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resetProviderUsage
// ---------------------------------------------------------------------------
describe("resetProviderUsage", () => {
  it("resets all providers when called with no argument", async () => {
    const { mod, log } = await freshModule();
    mod.resetProviderUsage();
    expect(vi.mocked(log.info)).toHaveBeenCalledWith("provider.usage.reset_all");
    expect(storageState).toEqual({});
  });

  it("resets a single provider when called with a provider name", async () => {
    storageState = {
      groq: { provider: "groq", requestCount: 5 },
      gemini: { provider: "gemini", requestCount: 3 },
    };
    const { mod, log } = await freshModule();
    mod.resetProviderUsage("groq");

    expect(storageState["groq"]).toBeUndefined();
    expect(storageState["gemini"]).toBeDefined();
    expect(vi.mocked(log.info)).toHaveBeenCalledWith("provider.usage.reset", {
      provider: "groq",
    });
  });
});
