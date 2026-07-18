/**
 * Targeted branch coverage tests for src/llm/gateway.ts — remaining uncovered branches.
 *
 * Targets 10 testable branches (P0-P2 priority):
 *   P0 — Error type guards (3 tests):
 *     BRDA:540 — recordFailureResponse: String(error) path for non-Error throwables
 *     BRDA:711 — processProviderRequest catch: String(error) path for non-Error throwables
 *     BRDA:877 — stream catch: String(error) path for non-Error throwables
 *   P1 — Normalization fallbacks (3 tests):
 *     BRDA:943 — normalizeResponse: "unknown-model" when response.model is falsy
 *     BRDA:944 — normalizeResponse: "" when response.outputText is null
 *     BRDA:945 — normalizeResponse: "unknown" when response.finishReason is null
 *   P2 — Integration scenarios (4 tests):
 *     BRDA:427 — validateProviderAvailable: !provider (provider missing from map)
 *     BRDA:639 — processProviderRequest: budget_enforced logging when prompt trimmed
 *     BRDA:660 — processProviderRequest: ValidationFailedError for malformed response
 *     BRDA:772 — ask: error accumulation when all providers fail
 *
 * NOTE: Two branches (BRDA:133 and BRDA:203) are confirmed dead code:
 *   - BRDA:133: `match.index ?? 0` — RegExp.exec() always sets .index on success
 *   - BRDA:203: `userRequestMatch.index ?? 0` — same pattern, always defined
 * These are documented in COVERAGE-100-ANALYSIS.md as untestable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Gateway } from "../../src/llm/gateway.js";
import {
  resetProviderHealth,
  markProviderFromError,
  isProviderAvailable,
} from "../../src/llm/provider-health.js";
import { resetProviderUsage } from "../../src/llm/provider-usage.js";
import { resetRoutingHistory } from "../../src/llm/routing-history.js";

// ---------------------------------------------------------------------------
// Module-level mocks (mirrors existing gateway test infrastructure)
// ---------------------------------------------------------------------------

vi.mock("../../src/shared/logging/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../src/governance/workspace-quotas.js", () => ({
  evaluateWorkspaceQuotaStatus: vi.fn(() => ({
    allowed: true,
    blocked: false,
    shouldFallback: false,
    shouldAlert: false,
    thresholdReached: false,
    fallbackProvider: null,
  })),
  recordWorkspaceQuotaUsage: vi.fn(),
}));

vi.mock("../../src/memory/request-context.js", () => ({
  buildRequestContextPrompt: vi.fn(() => null),
}));

vi.mock("../../src/llm/provider-health.js", async () => {
  const actual = await vi.importActual("../../src/llm/provider-health.js");
  return {
    ...(actual || {}),
    resetProviderHealth: vi.fn(),
    markProviderFromError: vi.fn(),
    getProviderHealthSnapshot: vi.fn(() => ({})),
    isProviderAvailable: vi.fn(() => true),
    markProviderFailed: vi.fn(),
  };
});

// Mock provider-policy with controllable getState
const mockGetState = vi.fn(() => ({
  routingMode: "cloud",
  allowedProviders: ["local"],
  blockedProviders: [],
  manualProvider: null,
  activePreset: "default",
  updatedAt: Date.now(),
}));

vi.mock("../../src/policies/provider-policy.js", () => ({
  getState: () => mockGetState(),
  getProviderPolicy: () => mockGetState(),
  applyPolicyToCandidatesWithReason: vi.fn((candidates, _request) => ({
    candidates: [...candidates],
    policyReason: "default-policy",
  })),
  applyPolicyToCandidates: vi.fn((candidates) => [...candidates]),
}));

import { logger } from "../../src/shared/logging/logger.js";
import * as requestContextModule from "../../src/memory/request-context.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides = {}) {
  return {
    prompt: "Test prompt",
    userPrompt: "Test user prompt",
    requestId: `test-${Date.now()}`,
    constraints: { maxTokens: 256, temperature: 0.5 },
    ...overrides,
  };
}

function makeLocalAdapter(overrides = {}) {
  return {
    ask: vi.fn().mockResolvedValue({
      outputText: "Local response",
      model: "local-model",
      finishReason: "stop",
    }),
    stream: vi.fn().mockImplementation(async function* () {
      yield { delta: "streamed ", provider: "local" };
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetProviderHealth();
  resetProviderUsage();
  resetRoutingHistory();
  vi.mocked(isProviderAvailable).mockReturnValue(true);
  mockGetState.mockClear();
  mockGetState.mockReturnValue({
    routingMode: "cloud",
    allowedProviders: ["local"],
    blockedProviders: [],
    manualProvider: null,
    activePreset: "default",
    updatedAt: Date.now(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
  resetProviderHealth();
  resetProviderUsage();
  resetRoutingHistory();
});

// ============================================================================
// P0 — Error type guards: String(error) path for non-Error throwables (3 tests)
// ============================================================================

describe("P0 — Error type guards: String(error) path", () => {
  // -----------------------------------------------------------------------
  // BRDA:540,39,1,0 — recordFailureResponse: String(error) for non-Error
  // -----------------------------------------------------------------------
  it("BRDA:540 — recordFailureResponse handles string throwables via String(error)", async () => {
    const adapter = {
      ask: vi.fn().mockRejectedValue("string error not Error instance"),
    };
    const gw = new Gateway({ providers: { local: adapter } });

    await expect(gw.ask(makeRequest())).rejects.toThrow(
      "All providers failed for the request",
    );

    // String("string error...") = "string error..." (not error.message)
    expect(logger.warn).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // BRDA:711,47,1,0 — processProviderRequest catch: String(error) for non-Error
  // -----------------------------------------------------------------------
  it("BRDA:711 — processProviderRequest catch handles string throwables via String(error)", async () => {
    const adapter = {
      ask: vi.fn().mockRejectedValue("provider error string"),
    };
    const gw = new Gateway({ providers: { local: adapter } });

    await expect(gw.ask(makeRequest())).rejects.toThrow(
      "All providers failed for the request",
    );

    // String("provider error string") path in catch block
    expect(logger.error).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // BRDA:877,60,1,0 — stream catch: String(error) for non-Error
  // -----------------------------------------------------------------------
  it("BRDA:877 — stream catch handles string throwables via String(error)", async () => {
    const adapter = {
      ask: vi.fn().mockResolvedValue({
        outputText: "Response",
        model: "local-model",
        finishReason: "stop",
      }),
      stream: vi.fn().mockImplementation(async function* () {
        throw "stream error string";
      }),
    };
    const gw = new Gateway({
      providers: { local: adapter },
      defaultOrder: ["local"] as any,
    });

    try {
      for await (const _chunk of gw.stream(makeRequest())) {
        // Should not yield any chunks
      }
    } catch (error: any) {
      // Re-thrown as-is (string)
      expect(error).toBe("stream error string");
    }

    // String("stream error string") path in catch block
    expect(logger.warn).toHaveBeenCalled();
  });
});

// ============================================================================
// P1 — Normalization fallbacks (3 tests)
// ============================================================================

describe("P1 — Normalization fallbacks", () => {
  // -----------------------------------------------------------------------
  // BRDA:943,66,1,0 — normalizeResponse: response.model || "unknown-model"
  // -----------------------------------------------------------------------
  it('BRDA:943 — normalizeResponse uses "unknown-model" when response.model is falsy', async () => {
    const adapter = {
      ask: vi.fn().mockResolvedValue({
        outputText: "Response",
        model: undefined,
        finishReason: "stop",
      }),
    };
    const gw = new Gateway({ providers: { local: adapter } });

    const response = await gw.ask(makeRequest());
    expect(response.model).toBe("unknown-model");
  });

  // -----------------------------------------------------------------------
  // BRDA:944,67,1,0 — normalizeResponse: response.outputText ?? ""
  // -----------------------------------------------------------------------
  it('BRDA:944 — normalizeResponse uses "" when response.outputText is null', async () => {
    const adapter = {
      ask: vi.fn().mockResolvedValue({
        outputText: null,
        model: "test-model",
        finishReason: "stop",
      }),
    };
    const gw = new Gateway({ providers: { local: adapter } });

    const response = await gw.ask(makeRequest());
    expect(response.outputText).toBe("");
  });

  // -----------------------------------------------------------------------
  // BRDA:945,68,1,0 — normalizeResponse: response.finishReason ?? "unknown"
  // -----------------------------------------------------------------------
  it('BRDA:945 — normalizeResponse uses "unknown" when response.finishReason is null', async () => {
    const adapter = {
      ask: vi.fn().mockResolvedValue({
        outputText: "Response",
        model: "test-model",
        finishReason: null,
      }),
    };
    const gw = new Gateway({ providers: { local: adapter } });

    const response = await gw.ask(makeRequest());
    expect(response.finishReason).toBe("unknown");
  });
});

// ============================================================================
// P2 — Integration scenarios (4 tests)
// ============================================================================

describe("P2 — Integration scenarios", () => {
  // -----------------------------------------------------------------------
  // BRDA:427,32,0,0 — validateProviderAvailable: !provider (provider missing)
  // -----------------------------------------------------------------------
  it("BRDA:427 — validateProviderAvailable returns error when provider missing from map", async () => {
    // Create gateway with ONLY local provider (overriding defaults)
    const failingAdapter = {
      ask: vi.fn().mockRejectedValue(new Error("Local provider fails")),
    };
    const gw = new Gateway({ providers: { local: failingAdapter } });

    // Delete all default providers except local from the providers map
    // so that resolveCandidates returns names that don't exist in this.providers
    delete (gw as any).providers.openai;
    delete (gw as any).providers.gemini;
    delete (gw as any).providers.groq;
    delete (gw as any).providers.perplexity;

    // Now defaultOrder includes groq, gemini, openai, perplexity which are NOT
    // in gw.providers → validateProviderAvailable hits !provider branch for each
    await expect(
      gw.ask({
        ...makeRequest(),
        constraints: {
          ...makeRequest().constraints,
          excludedProviders: [],
        },
      }),
    ).rejects.toThrow("All providers failed for the request");

    // Logger should have warned about missing providers
    expect(logger.warn).toHaveBeenCalledWith(
      "gateway.provider.missing",
      expect.objectContaining({ provider: expect.any(String) }),
    );
  });

  // -----------------------------------------------------------------------
  // BRDA:639,44,0,0 — processProviderRequest: budget_enforced logging
  // -----------------------------------------------------------------------
  it("BRDA:639 — processProviderRequest logs budget_enforced when prompt trimmed", async () => {
    // Mock context injection to return a large workspace context
    vi.spyOn(requestContextModule, "buildRequestContextPrompt").mockReturnValue(
      "WORKSPACE CONTEXT: " + "x".repeat(2000),
    );

    const adapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: adapter } });

    // Small user prompt + large injected context = oversized prompt
    // Budget (maxTokens=12 → ~48 chars) << total prompt size
    const response = await gw.ask({
      ...makeRequest(),
      workspaceId: "test-workspace",
      constraints: { maxTokens: 12 }, // Very small budget
    });

    expect(response).toBeDefined();
    // Budget enforcement warning should have been logged
    expect(logger.warn).toHaveBeenCalledWith(
      "gateway.prompt.budget_enforced",
      expect.objectContaining({
        originalLength: expect.any(Number),
        trimmedLength: expect.any(Number),
        reason: "budget_exceeded",
      }),
    );
  });

  // -----------------------------------------------------------------------
  // BRDA:660,45,0,0 — processProviderRequest: ValidationFailedError path
  // -----------------------------------------------------------------------
  it("BRDA:660 — processProviderRequest handles ValidationFailedError for malformed response", async () => {
    // Mock normalizeResponse to return a response that fails Zod schema validation.
    // Normal provider responses always produce valid normalized output, so we
    // intercept the private method to force the validation failure path.
    const adapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: adapter } });

    // Spy on normalizeResponse and return a response with empty model (fails .min(1))
    vi.spyOn(gw as any, "normalizeResponse").mockReturnValue({
      requestId: "test-id",
      provider: "local",
      model: "", // Empty string fails z.string().min(1)
      outputText: "Response",
      finishReason: "stop",
    });

    // ValidationFailedError is thrown inside processProviderRequest, caught by
    // the catch block (hitting BRDA:711 String(error) path), and converted to
    // an error object. ask() collects errors and throws RoutingNoProviderError.
    const error = await gw.ask(makeRequest()).catch((e) => e);
    expect(error.message).toContain("All providers failed for the request");

    // The accumulated errors should contain the validation error
    expect(logger.error).toHaveBeenCalledWith(
      "gateway.ask.failed",
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            provider: "local",
            message: expect.stringContaining("Invalid provider response"),
          }),
        ]),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // BRDA:772,52,1,0 — ask: error accumulation when all providers fail
  // -----------------------------------------------------------------------
  it("BRDA:772 — ask accumulates errors when all providers fail", async () => {
    // Create two failing providers
    const failingLocal = {
      ask: vi.fn().mockRejectedValue(new Error("Local provider fails")),
    };
    const failingGroq = {
      ask: vi.fn().mockRejectedValue(new Error("Groq provider fails")),
    };

    const gw = new Gateway({
      providers: { local: failingLocal, groq: failingGroq },
    });

    // Allow both providers as candidates
    mockGetState.mockReturnValue({
      routingMode: "cloud",
      allowedProviders: ["local", "groq"],
      blockedProviders: [],
      manualProvider: null,
      activePreset: "default",
      updatedAt: Date.now(),
    });

    await expect(
      gw.ask({
        ...makeRequest(),
        constraints: {
          ...makeRequest().constraints,
          excludedProviders: [],
        },
      }),
    ).rejects.toThrow("All providers failed for the request");

    // Both providers should have been called
    expect(failingLocal.ask).toHaveBeenCalled();
    expect(failingGroq.ask).toHaveBeenCalled();

    // Error accumulation in the loop (result.error path)
    expect(logger.error).toHaveBeenCalledWith(
      "gateway.ask.failed",
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({ provider: expect.any(String) }),
        ]),
      }),
    );
  });
});
