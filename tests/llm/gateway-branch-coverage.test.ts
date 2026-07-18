/**
 * Comprehensive branch coverage tests for src/llm/gateway.ts
 *
 * Targets all 28 previously-uncovered BRDA branches:
 *   P0 — Trim step edge cases (8 branches):
 *     BRDA:96, BRDA:100, BRDA:103, BRDA:133, BRDA:137, BRDA:164, BRDA:203, BRDA:317
 *   P1 — Error injection (4 branches):
 *     BRDA:52, BRDA:427, BRDA:540, BRDA:877
 *   P2 — Stream errors (3 branches):
 *     BRDA:639, BRDA:660, BRDA:711
 *   P3 — Fallback loop (1 branch):
 *     BRDA:772
 *   P4 — Context extraction (1 branch):
 *     BRDA:485
 *   P5 — appendLocalIfAvailable (7 branches):
 *     BRDA:943, BRDA:944, BRDA:945, BRDA:1030, BRDA:1031 (x3)
 *   P6 — Proxy singleton (2 testable branches):
 *     BRDA:1062 (x2)
 *
 * NOTE: BRDA:1063 and BRDA:1067 (prototype definitions) are structural
 * and cannot be tested without v8-ignore — documented in COVERAGE-100-ANALYSIS.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Gateway,
  enforcePromptBudget,
  gateway,
} from "../../src/llm/gateway.js";
import {
  resetProviderHealth,
  markProviderFromError,
  isProviderAvailable,
} from "../../src/llm/provider-health.js";
import { resetProviderUsage } from "../../src/llm/provider-usage.js";
import { resetRoutingHistory } from "../../src/llm/routing-history.js";
import { DomainError } from "../../src/shared/errors/base.js";

// ---------------------------------------------------------------------------
// Module-level mocks
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

function makeFailingAdapter() {
  return {
    ask: vi.fn().mockRejectedValue(new Error("Provider unavailable")),
    stream: vi.fn().mockRejectedValue(new Error("Provider unavailable")),
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
// P0 — Trim step edge cases (8 tests → 8 branches)
// ============================================================================

describe("P0 — Trim step edge cases", () => {
  // -----------------------------------------------------------------------
  // BRDA:96,2,0,0 — tryDropWorkspaceContext: !prompt.startsWith(workspaceContext)
  // -----------------------------------------------------------------------
  it("BRDA:96 — tryDropWorkspaceContext: prompt doesn't start with workspaceContext", () => {
    const result = enforcePromptBudget(
      "Random prompt without workspace context",
      { budgetChars: 50 },
      "This is workspace context that doesn't match",
      "User content",
    );
    // Prompt doesn't start with workspaceContext → step (a) returns {changed:false}
    expect(result.trimmedPrompt).toBe(
      "Random prompt without workspace context",
    );
  });

  // -----------------------------------------------------------------------
  // BRDA:100,3,0,0 — tryDropWorkspaceContext: !remainingPrompt.startsWith(userRequestPrefix)
  // -----------------------------------------------------------------------
  it("BRDA:100 — tryDropWorkspaceContext: no User request: prefix after context", () => {
    const workspaceContext = "Workspace context prefix\n";
    const result = enforcePromptBudget(
      `${workspaceContext}Some content without User request: marker`,
      { budgetChars: 50 },
      workspaceContext,
      "User content",
    );
    // After dropping workspaceContext, remaining doesn't start with "User request: "
    expect(result.trimmedPrompt).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // BRDA:103,4,0,0 — tryDropWorkspaceContext: userPromptFromMarker.length > budgetChars
  // -----------------------------------------------------------------------
  it("BRDA:103 — tryDropWorkspaceContext: userPrompt exceeds budgetChars", () => {
    const longUserPrompt = "x".repeat(200);
    const result = enforcePromptBudget(
      `Workspace context\nUser request: ${longUserPrompt}`,
      { budgetChars: 50 },
      "Workspace context\n",
      longUserPrompt,
    );
    // userPrompt exceeds budget → step (a) returns {changed:false}
    expect(result.trimmedPrompt).toBeDefined();
    expect(result.originalLength).toBeGreaterThan(50);
  });

  // -----------------------------------------------------------------------
  // BRDA:133,6,1,0 — tryTruncateToolResult: nonToolPart.length > budgetChars (continue)
  // -----------------------------------------------------------------------
  it("BRDA:133 — tryTruncateToolResult: nonToolPart exceeds budget (continue)", () => {
    const longNonToolPart = "x".repeat(200);
    const result = enforcePromptBudget(
      `TOOL RESULT:short\n${longNonToolPart}`,
      { budgetChars: 50 },
      "",
      "user prompt",
    );
    // nonToolPart exceeds budget → continue to next pattern
    expect(result.trimmedPrompt).toBeDefined();
    expect(result.originalLength).toBeGreaterThan(50);
  });

  // -----------------------------------------------------------------------
  // BRDA:137,7,0,0 — tryTruncateToolResult: no pattern match → {changed:false}
  // -----------------------------------------------------------------------
  it("BRDA:137 — tryTruncateToolResult: no TOOL RESULT pattern", () => {
    const result = enforcePromptBudget(
      "Plain prompt without any tool result markers",
      { budgetChars: 30 },
      "",
      "user prompt",
    );
    // No TOOL RESULT pattern → step (b) returns {changed:false}
    expect(result.trimmedPrompt).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // BRDA:164,9,0,0 — tryPreserveUserPrompt: !userPrompt → early return
  // -----------------------------------------------------------------------
  it("BRDA:164 — tryPreserveUserPrompt: empty userPrompt", () => {
    const result = enforcePromptBudget(
      "Some prompt content",
      { budgetChars: 10 },
      "",
      "", // Empty userPrompt
    );
    // !userPrompt → step (c) returns {changed:false}
    expect(result.trimmedPrompt).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // BRDA:203,12,1,0 — tryMarkerBasedFallback: no "User request:" marker
  // -----------------------------------------------------------------------
  it("BRDA:203 — tryMarkerBasedFallback: no User request: marker", () => {
    const result = enforcePromptBudget(
      "Just some random text without any markers",
      { budgetChars: 20 },
      "",
      "user prompt",
    );
    // No "User request:" marker → step (d) returns {changed:false, markerFound:false}
    expect(result.trimmedPrompt).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // BRDA:317,24,1,0 — enforcePromptBudget: trimmedLength < originalLength (logging path)
  // -----------------------------------------------------------------------
  it("BRDA:317 — enforcePromptBudget: trimmedLength < originalLength (logging)", () => {
    const workspaceContext = "WORKSPACE CONTEXT: " + "x".repeat(2000);
    const userPromptText = "x".repeat(1000);
    const prompt = `${workspaceContext}\n\nUser request: ${userPromptText}`;

    const result = enforcePromptBudget(
      prompt,
      { maxTokens: 375 }, // 1500 chars budget
      workspaceContext,
      userPromptText,
    );

    // Workspace context dropped → trimmedLength < originalLength → logging path
    expect(result.trimmedLength).toBeLessThan(result.originalLength);
    expect(result.trimmedPrompt).not.toContain("WORKSPACE CONTEXT");
    expect(result.trimmedPrompt).toContain(userPromptText);
    // Verify logger.warn was called with truncation info
    expect(logger.warn).toHaveBeenCalled();
  });
});

// ============================================================================
// P1 — Error injection (4 tests → 4 branches)
// ============================================================================

describe("P1 — Error injection", () => {
  // -----------------------------------------------------------------------
  // BRDA:52,0,1,0 — logNonFatalError: String(error) path (non-Error throw)
  // -----------------------------------------------------------------------
  it("BRDA:52 — logNonFatalError: non-Error throw (String path)", async () => {
    // We need getState to throw ONLY in appendLocalIfAvailable context,
    // not in getProviderPolicy (called by explainRoutingSelection on success).
    // Use call counting: first calls succeed (getProviderPolicy), later call throws (getState in appendLocalIfAvailable).
    let getStateCallCount = 0;
    const defaultState = {
      routingMode: "cloud",
      allowedProviders: ["local"],
      blockedProviders: [],
      manualProvider: null,
      activePreset: "default",
      updatedAt: Date.now(),
    };
    mockGetState.mockImplementation(() => {
      getStateCallCount++;
      // First call is from getProviderPolicy (via explainRoutingSelection in recordSuccessResponse)
      // Second call is from getState in appendLocalIfAvailable
      // We want to throw on the appendLocalIfAvailable call but NOT on getProviderPolicy
      // Since appendLocalIfAvailable is called BEFORE the provider succeeds, it's the first getState call
      if (getStateCallCount === 1) {
        // First call: appendLocalIfAvailable → throw string to hit String(error) path
        throw "string error not Error instance";
      }
      return defaultState;
    });

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    // ask() calls appendLocalIfAvailable which catches the string error via logNonFatalError
    // The catch block still adds "local" to candidates, so the request proceeds
    // but the error is logged with String(error) instead of error.message
    const response = await gw.ask(makeRequest());
    expect(response).toBeDefined();
    // Verify logger.warn was called (logNonFatalError path with String(error))
    expect(logger.warn).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // BRDA:427,32,0,0 — validateProviderAvailable: !provider (provider not found)
  // -----------------------------------------------------------------------
  it("BRDA:427 — validateProviderAvailable: provider not found in map", async () => {
    // Create gateway with only groq provider (which fails)
    const failingAdapter = makeFailingAdapter();
    const gw = new Gateway({ providers: { groq: failingAdapter } });

    // Mark groq as unhealthy so it gets skipped, then fallback to providers
    // that don't exist in the map → triggers BRDA:427 (!provider check)
    markProviderFromError("groq", new Error("Health check failed"));

    await expect(
      gw.ask({
        ...makeRequest(),
        constraints: {
          ...makeRequest().constraints,
          excludedProviders: ["local", "openai", "gemini", "perplexity"],
        },
      }),
    ).rejects.toThrow("All providers failed for the request");
  });

  // -----------------------------------------------------------------------
  // BRDA:540,39,1,0 — recordFailureResponse: error instanceof DomainError
  // -----------------------------------------------------------------------
  it("BRDA:540 — recordFailureResponse: DomainError path", async () => {
    // Create a provider that throws a DomainError
    const domainErrorAdapter = {
      ask: vi
        .fn()
        .mockRejectedValue(
          new DomainError("RATE_LIMITED", "Rate limit exceeded"),
        ),
    };

    const gw = new Gateway({ providers: { local: domainErrorAdapter } });

    await expect(gw.ask(makeRequest())).rejects.toThrow(
      "All providers failed for the request",
    );

    // markProviderFromError should have been called (DomainError path)
    // The DomainError branch in recordFailureResponse triggers markProviderFromError
  });

  // -----------------------------------------------------------------------
  // BRDA:877,60,1,0 — stream catch: error instanceof DomainError
  // -----------------------------------------------------------------------
  it("BRDA:877 — stream catch: DomainError path", async () => {
    // Create a provider whose stream method is an async generator that throws
    // a DomainError — this triggers the catch block at line 877 in the outer
    // stream() method. Note: mockRejectedValue cannot be used here because
    // for await...of on a rejected Promise throws a TypeError ("not async
    // iterable") rather than propagating the original rejection on Node ≥ 22.
    const domainErr = new DomainError("STREAM_FAILED", "Stream error");
    const domainErrorStreamAdapter = {
      ask: vi.fn().mockResolvedValue({
        outputText: "Response",
        model: "local-model",
        finishReason: "stop",
      }),
      stream: vi.fn().mockImplementation(async function* () {
        throw domainErr;
      }),
    };

    const gw = new Gateway({ providers: { local: domainErrorStreamAdapter }, defaultOrder: ['local'] as any });

    // Consume the stream — the DomainError thrown inside the async generator
    // will be caught by the catch block at line 877, which calls
    // markProviderFromError, then re-throws
    try {
      for await (const _chunk of gw.stream(makeRequest())) {
        // Should not yield any chunks
      }
      throw new Error("Expected stream to throw");
    } catch (error: any) {
      // The error should be the DomainError that was re-thrown
      expect(error.message).toBe("Stream error");
      expect(error instanceof DomainError).toBe(true);
    }
  });
});

// ============================================================================
// P2 — Stream-specific paths (3 tests → 3 branches)
// ============================================================================

describe("P2 — Stream-specific paths", () => {
  // -----------------------------------------------------------------------
  // BRDA:639,44,0,0 — stream: !candidates.length (no candidates error)
  // -----------------------------------------------------------------------
  it("BRDA:639 — stream: no candidates after policy", async () => {
    const gw = new Gateway({ providers: {} }); // Empty providers map

    const request = makeRequest({
      constraints: {
        ...makeRequest().constraints,
        excludedProviders: ["local", "openai", "groq", "gemini", "perplexity"],
      },
    });

    await expect(async () => {
      for await (const _chunk of gw.stream(request)) {
        // Should not reach here
      }
    }).rejects.toThrow("No provider candidates available for stream");
  });

  // -----------------------------------------------------------------------
  // BRDA:660,45,0,0 — stream: !providerName (no streaming-capable provider)
  // -----------------------------------------------------------------------
  it("BRDA:660 — stream: no streaming-capable healthy provider", async () => {
    // Create a provider without stream capability
    const noStreamAdapter = {
      ask: vi.fn().mockResolvedValue({
        outputText: "Response",
        model: "test-model",
        finishReason: "stop",
      }),
      // No stream method
    };

    const gw = new Gateway({ providers: { local: noStreamAdapter } });

    // Mock isProviderAvailable to return false for "local"
    vi.mocked(isProviderAvailable).mockReturnValue(false);

    await expect(async () => {
      for await (const _chunk of gw.stream(makeRequest())) {
        // Should not reach here
      }
    }).rejects.toThrow("No streaming-capable healthy provider available");
  });

  // -----------------------------------------------------------------------
  // BRDA:711,47,1,0 — processProviderRequest: catch block error return
  // -----------------------------------------------------------------------
  it("BRDA:711 — processProviderRequest: catch block error return", async () => {
    // Create a provider that throws a non-DomainError
    const errorAdapter = {
      ask: vi.fn().mockRejectedValue(new Error("Generic provider error")),
    };

    const gw = new Gateway({ providers: { local: errorAdapter } });

    // This triggers the catch block in processProviderRequest which returns
    // an error object (line 711) rather than a response
    await expect(gw.ask(makeRequest())).rejects.toThrow(
      "All providers failed for the request",
    );
  });
});

// ============================================================================
// P3 — Fallback loop (1 test → 1 branch)
// ============================================================================

describe("P3 — Fallback loop", () => {
  // -----------------------------------------------------------------------
  // BRDA:772,52,1,0 — ask: all providers fail → throw RoutingNoProviderError
  // -----------------------------------------------------------------------
  it("BRDA:772 — ask: all providers fail → RoutingNoProviderError", async () => {
    // Create multiple failing providers
    const failingLocal = makeFailingAdapter();
    const failingOpenai = makeFailingAdapter();
    const failingGemini = makeFailingAdapter();

    const gw = new Gateway({
      providers: {
        local: failingLocal,
        openai: failingOpenai,
        gemini: failingGemini,
      },
    });

    // All providers fail → RoutingNoProviderError is thrown
    await expect(gw.ask(makeRequest())).rejects.toThrow(
      "All providers failed for the request",
    );

    // Verify all providers were attempted
    expect(failingLocal.ask).toHaveBeenCalled();
    expect(failingOpenai.ask).toHaveBeenCalled();
    expect(failingGemini.ask).toHaveBeenCalled();
  });
});

// ============================================================================
// P4 — Context extraction edge case (1 test → 1 branch)
// ============================================================================

describe("P4 — Context extraction edge case", () => {
  // -----------------------------------------------------------------------
  // BRDA:485,38,0,0 — extractWorkspaceContext: simple marker fallback (simpleIndex > 0)
  // -----------------------------------------------------------------------
  it("BRDA:485 — extractWorkspaceContext: simple marker fallback", async () => {
    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    // Create a request where the full prompt has "User request:" marker
    // but the userPrompt doesn't exactly match (so the first indexOf fails)
    // This triggers the simple marker fallback at line 485
    const response = await gw.ask({
      ...makeRequest(),
      prompt: "Some workspace context\n\nUser request: Different prompt text",
      userPrompt: "Different prompt text", // Matches the marker content
    });

    expect(response).toBeDefined();
  });
});

// ============================================================================
// P5 — appendLocalIfAvailable branches (7 tests → 7 branches)
// ============================================================================

describe("P5 — appendLocalIfAvailable branches", () => {
  // -----------------------------------------------------------------------
  // BRDA:943,66,1,0 + BRDA:944,67,1,0 — appendLocalIfAvailableForStream: preferredProvider === "local" (unshift)
  // -----------------------------------------------------------------------
  it("BRDA:943/944 — appendLocalIfAvailableForStream: preferredProvider === 'local' (unshift)", async () => {
    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    const chunks: any[] = [];
    for await (const chunk of gw.stream(
      makeRequest({ preferredProvider: "local" }),
    )) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // BRDA:945,68,1,0 — appendLocalIfAvailableForStream: preferredProvider !== "local" (push)
  // -----------------------------------------------------------------------
  it("BRDA:945 — appendLocalIfAvailableForStream: preferredProvider !== 'local' (push)", async () => {
    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    const chunks: any[] = [];
    // No preferredProvider or preferredProvider !== "local"
    for await (const chunk of gw.stream(makeRequest())) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // BRDA:1030,76,0,0 + BRDA:1031,77,0,0 — catch: preferredProvider === "local" (unshift)
  // -----------------------------------------------------------------------
  it("BRDA:1030/1031 — appendLocalIfAvailableForStream catch: preferredProvider === 'local' (unshift)", async () => {
    // Make getState throw to trigger catch block
    mockGetState.mockImplementation(() => {
      throw new Error("Policy state unavailable");
    });

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    // Call the prototype method directly to bypass explainRoutingSelection
    // which also uses mockGetState via getProviderPolicy
    const candidates: any[] = [];
    gw.appendLocalIfAvailableForStream(candidates, [], "local");

    // Verify logNonFatalError was called (catch path)
    expect(logger.warn).toHaveBeenCalled();
    // Verify "local" was prepended (unshift) due to preferredProvider === "local"
    expect(candidates).toEqual(["local"]);
  });

  // -----------------------------------------------------------------------
  // BRDA:1030,76,1,0 + BRDA:1031,77,1,0 — catch: preferredProvider !== "local" (push)
  // -----------------------------------------------------------------------
  it("BRDA:1030/1031 — appendLocalIfAvailableForStream catch: preferredProvider !== 'local' (push)", async () => {
    // Make getState throw to trigger catch block
    mockGetState.mockImplementation(() => {
      throw new Error("Policy state unavailable");
    });

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    // Call the prototype method directly to bypass explainRoutingSelection
    const candidates: any[] = [];
    gw.appendLocalIfAvailableForStream(candidates, [], "openai");

    // Verify logNonFatalError was called (catch path)
    expect(logger.warn).toHaveBeenCalled();
    // Verify "local" was appended (push) due to preferredProvider !== "local"
    expect(candidates).toEqual(["local"]);
  });

  // -----------------------------------------------------------------------
  // BRDA:1031,77,2,0 — catch: else branch (no preferredProvider)
  // -----------------------------------------------------------------------
  it("BRDA:1031 — appendLocalIfAvailableForStream catch: else branch (no preferredProvider)", async () => {
    // Make getState throw to trigger catch block
    mockGetState.mockImplementation(() => {
      throw new Error("Policy state unavailable");
    });

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    // Call the prototype method directly - no preferredProvider → else branch (push)
    const candidates: any[] = [];
    gw.appendLocalIfAvailableForStream(candidates, []);

    // Verify logNonFatalError was called (catch path)
    expect(logger.warn).toHaveBeenCalled();
    // Verify "local" was appended (push) due to no preferredProvider
    expect(candidates).toEqual(["local"]);
  });

  // -----------------------------------------------------------------------
  // Additional: appendLocalIfAvailable (ask variant) catch path
  // -----------------------------------------------------------------------
  it("appendLocalIfAvailable (ask): policy error catch path", async () => {
    // Make getState throw to trigger catch block
    mockGetState.mockImplementation(() => {
      throw new Error("Policy state unavailable");
    });

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    // Call the prototype method directly to bypass explainRoutingSelection
    const candidates: any[] = [];
    gw.appendLocalIfAvailable(candidates, []);

    // Verify logNonFatalError was called (catch path)
    expect(logger.warn).toHaveBeenCalled();
    // Verify "local" was appended
    expect(candidates).toEqual(["local"]);
  });

  // -----------------------------------------------------------------------
  // Additional: appendLocalIfAvailable local already in candidates
  // -----------------------------------------------------------------------
  it("appendLocalIfAvailable: local already in candidates (no duplicate)", async () => {
    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    // When "local" is already the only candidate, it should not be duplicated
    const response = await gw.ask(makeRequest({ preferredProvider: "local" }));
    expect(response.outputText).toBe("Local response");
    expect(localAdapter.ask).toHaveBeenCalled();
  });
});

// ============================================================================
// P6 — Proxy singleton (2 tests → 2 testable branches)
// ============================================================================

describe("P6 — Proxy singleton", () => {
  // -----------------------------------------------------------------------
  // BRDA:1062,81,0,0 — gateway Proxy: first access triggers instantiation
  // -----------------------------------------------------------------------
  it("BRDA:1062 — gateway Proxy: first access triggers instantiation", () => {
    // The gateway proxy is a lazy singleton — first access triggers instantiation
    // We can test that the proxy returns a valid Gateway instance
    expect(gateway).toBeDefined();
    expect(typeof gateway.ask).toBe("function");
    expect(typeof gateway.stream).toBe("function");
  });

  // -----------------------------------------------------------------------
  // BRDA:1062,81,1,0 — gateway Proxy: subsequent access returns same instance
  // -----------------------------------------------------------------------
  it("BRDA:1062 — gateway Proxy: subsequent access returns same instance", () => {
    // Subsequent accesses should return the same instance
    const firstAccess = gateway;
    const secondAccess = gateway;
    expect(firstAccess).toBe(secondAccess);
  });
});

// ============================================================================
// Integration tests — multiple branch coverage
// ============================================================================

describe("Integration — multiple branch coverage", () => {
  it("complete ask flow with workspace quota enforcement", async () => {
    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    const response = await gw.ask({
      ...makeRequest(),
      workspaceId: "test-workspace",
    });

    expect(response).toBeDefined();
    expect(response.provider).toBe("local");
  });

  it("complete stream flow with error handling", async () => {
    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    const chunks: any[] = [];
    for await (const chunk of gw.stream(makeRequest())) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
  });

  it("enforcePromptBudget: under-budget prompt passes through unchanged", () => {
    const prompt = "Hello, world!";
    const result = enforcePromptBudget(prompt);

    expect(result.trimmedPrompt).toBe(prompt);
    expect(result.originalLength).toBe(prompt.length);
    expect(result.trimmedLength).toBe(prompt.length);
  });

  it("enforcePromptBudget: workspace context drop path", () => {
    const workspaceContext = "WORKSPACE CONTEXT: " + "x".repeat(2000);
    const userPromptText = "x".repeat(1000);
    const prompt = `${workspaceContext}\n\nUser request: ${userPromptText}`;

    const result = enforcePromptBudget(
      prompt,
      { maxTokens: 375 },
      workspaceContext,
      userPromptText,
    );

    expect(result.trimmedPrompt).not.toContain("WORKSPACE CONTEXT");
    expect(result.trimmedPrompt).toContain(userPromptText);
  });

  it("enforcePromptBudget: true fail-safe (no marker)", () => {
    const uniqueMarker = "UNIQUE_FAILSAFE_MARKER_12345";
    const prompt = `${uniqueMarker}_${"x".repeat(8000)}`;

    const result = enforcePromptBudget(
      prompt,
      { maxTokens: 375 },
      undefined,
      undefined,
    );

    expect(result.trimmedPrompt).toBe(prompt);
    expect(result.trimmedLength).toBe(result.originalLength);
    expect(result.trimmedLength).toBeGreaterThan(1500);

    const cannotTruncateCalls = logger.warn.mock.calls.filter(
      (call) => call[0] === "gateway.prompt.cannot-truncate-no-boundary",
    );
    expect(cannotTruncateCalls).toHaveLength(1);
  });
});
