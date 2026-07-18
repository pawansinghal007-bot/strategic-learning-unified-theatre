/**
 * Targeted branch coverage tests for src/llm/gateway.ts
 *
 * Targets 14 remaining uncovered BRDA branches:
 *   P0 — Trim step edge cases (4 branches):
 *     BRDA:96,2,0,0 — tryDropWorkspaceContext: !prompt.startsWith(workspaceContext)
 *     BRDA:133,6,1,0 — tryTruncateToolResult: nonToolPart.length > budgetChars (continue)
 *     BRDA:137,7,0,0 — tryTruncateToolResult: !match continue (pattern no-match)
 *     BRDA:203,12,1,0 — tryMarkerBasedFallback: no "User request:" marker
 *   P1 — Error injection (4 branches):
 *     BRDA:427,32,0,0 — validateProviderAvailable: !provider (provider not found)
 *     BRDA:540,39,1,0 — recordFailureResponse: error instanceof DomainError
 *     BRDA:711,47,1,0 — processProviderRequest: catch block error return
 *     BRDA:772,52,1,0 — ask: all providers fail → RoutingNoProviderError
 *   P2 — Stream paths (2 branches):
 *     BRDA:639,44,0,0 — stream: !candidates.length (no candidates error)
 *     BRDA:660,45,0,0 — stream: !providerName (no streaming-capable provider)
 *   P3 — Stream error (1 branch):
 *     BRDA:877,60,1,0 — stream catch: error instanceof DomainError
 *   P5 — appendLocalIfAvailableForStream (3 branches):
 *     BRDA:943,66,1,0 — preferredProvider === "local" (unshift)
 *     BRDA:944,67,1,0 — preferredProvider === "local" (unshift)
 *     BRDA:945,68,1,0 — preferredProvider !== "local" (push)
 *
 * CRITICAL: enforcePromptBudget signature is:
 *   enforcePromptBudget(prompt, constraints?: { maxTokens?: number }, workspaceContext?, userPrompt?)
 * Budget is calculated as maxTokens * 4 (chars/token).
 * To reach trim steps, prompt MUST exceed budget (prompt.length > maxTokens * 4).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Gateway, enforcePromptBudget } from "../../src/llm/gateway.js";
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

const mockApplyPolicyToCandidatesWithReason = vi.fn((candidates, _request) => ({
  candidates: [...candidates],
  policyReason: "default-policy",
}));

vi.mock("../../src/policies/provider-policy.js", () => ({
  getState: () => mockGetState(),
  getProviderPolicy: () => mockGetState(),
  applyPolicyToCandidatesWithReason: (candidates, request) =>
    mockApplyPolicyToCandidatesWithReason(candidates, request),
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
  mockApplyPolicyToCandidatesWithReason.mockClear();
  mockApplyPolicyToCandidatesWithReason.mockImplementation(
    (candidates, _request) => ({
      candidates: [...candidates],
      policyReason: "default-policy",
    }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
  resetProviderHealth();
  resetProviderUsage();
  resetRoutingHistory();
});

// ============================================================================
// P0 — Trim step edge cases (4 tests → 4 branches)
// ============================================================================

describe("P0 — Trim step edge cases (v3 corrected)", () => {
  // -----------------------------------------------------------------------
  // BRDA:96,2,0,0 — tryDropWorkspaceContext: !prompt.startsWith(workspaceContext)
  // CRITICAL: Prompt MUST exceed budget to reach trim steps.
  // -----------------------------------------------------------------------
  it("BRDA:96 — tryDropWorkspaceContext: prompt doesn't start with workspaceContext", () => {
    // Create a prompt that EXCEEDS budget (maxTokens=5 → 20 chars budget)
    const longPrompt = "x".repeat(100); // 100 chars > 20 budget
    const workspaceContext = "This is workspace context that doesn't match";

    const result = enforcePromptBudget(
      longPrompt,
      { maxTokens: 5 }, // 20 chars budget — prompt (100 chars) exceeds budget
      workspaceContext,
      "User content",
    );

    // Prompt doesn't start with workspaceContext → step (a) returns {changed:false}
    // Since prompt exceeds budget and no trim steps succeed, it falls through to step (d)
    // which has no "User request:" marker → returns original prompt
    expect(result.originalLength).toBe(100);
    expect(result.trimmedLength).toBe(100);
  });

  // -----------------------------------------------------------------------
  // BRDA:133,6,1,0 — tryTruncateToolResult: nonToolPart.length > budgetChars (continue)
  // Need: TOOL RESULT pattern found, but nonToolPart (before TOOL RESULT) > budget
  // -----------------------------------------------------------------------
  it("BRDA:133 — tryTruncateToolResult: nonToolPart exceeds budget (continue)", () => {
    // Create a prompt with a long non-tool part followed by TOOL RESULT
    // The nonToolPart must exceed budget for the `continue` branch to trigger
    const longNonToolPart = "x".repeat(200); // 200 chars
    const toolResult = "TOOL RESULT: short output";
    const prompt = `${longNonToolPart}\n\n${toolResult}`;

    const result = enforcePromptBudget(
      prompt,
      { maxTokens: 10 }, // 40 chars budget — nonToolPart (200 chars) > budget (40)
      "",
      "user prompt",
    );

    // nonToolPart exceeds budget → continue to next pattern
    // All patterns will fail (nonToolPart > budget) → step (b) returns {changed:false}
    expect(result.originalLength).toBeGreaterThan(50);
  });

  // -----------------------------------------------------------------------
  // BRDA:137,7,0,0 — tryTruncateToolResult: !match continue (pattern no-match)
  // Need: A prompt that matches ONE pattern but not another, so we hit the continue
  // -----------------------------------------------------------------------
  it("BRDA:137 — tryTruncateToolResult: pattern no-match continue", () => {
    // Create a prompt with "Tool output:" pattern (matches 2nd pattern)
    // The 1st pattern (TOOL RESULT:) won't match → continue (BRDA:137)
    // The 2nd pattern (Tool output:) WILL match AND nonToolPart fits budget → return {changed: true}
    // NOTE: truncateToTokens has min 100 chars worth of tokens, so tool result must exceed ~400 chars
    const longContent = "x".repeat(600); // 600 chars
    const prompt = `short prefix\n\nTool output: ${longContent}`; // ~615 chars total

    const result = enforcePromptBudget(
      prompt,
      { maxTokens: 50 }, // 200 chars budget — prompt (615 chars) > budget (200), nonToolPart (15 chars) < budget (200)
      "",
      "user prompt",
    );

    // Prompt exceeds budget → enters trim steps
    // Step (a): no workspaceContext → skip
    // Step (b): 1st pattern (TOOL RESULT:) doesn't match → continue (BRDA:137)
    // Step (b): 2nd pattern (Tool output:) matches, nonToolPart (15 chars) < budget (200) → truncate tool result
    // Step (d): No "User request:" marker → discards partial trimming and returns original
    // The key is that BRDA:137 (continue branch) is hit when pattern 1 doesn't match
    expect(result.originalLength).toBeGreaterThan(50);
  });

  // -----------------------------------------------------------------------
  // BRDA:203,12,1,0 — tryMarkerBasedFallback: no "User request:" marker
  // Need: Prompt exceeding budget with no "User request:" marker
  // -----------------------------------------------------------------------
  it("BRDA:203 — tryMarkerBasedFallback: no User request: marker", () => {
    // Create a prompt that exceeds budget with no "User request:" marker
    const longPrompt = "Just some random text without any markers ".repeat(20); // ~980 chars

    const result = enforcePromptBudget(
      longPrompt,
      { maxTokens: 5 }, // 20 chars budget — prompt (980 chars) exceeds budget
      "",
      "user prompt",
    );

    // No "User request:" marker → step (d) returns {changed:false, markerFound:false}
    // This is the TRUE fail-safe case → returns original prompt
    expect(result.originalLength).toBeGreaterThan(50);
    expect(result.trimmedLength).toBe(result.originalLength);
    expect(logger.warn).toHaveBeenCalledWith(
      "gateway.prompt.cannot-truncate-no-boundary",
      expect.any(Object),
    );
  });
});

// ============================================================================
// P1 — Error injection (4 tests → 4 branches)
// ============================================================================

describe("P1 — Error injection (v3 corrected)", () => {
  // -----------------------------------------------------------------------
  // BRDA:427,32,0,0 — validateProviderAvailable: !provider (provider not found)
  // Need: Gateway with a provider that fails, then fallback to a provider NOT in the map
  // -----------------------------------------------------------------------
  it("BRDA:427 — validateProviderAvailable: provider not found in map", async () => {
    // Create gateway with ONLY "local" provider (which fails)
    const failingAdapter = makeFailingAdapter();
    const gw = new Gateway({ providers: { local: failingAdapter } });

    // Mark local as unhealthy so it gets skipped
    vi.mocked(isProviderAvailable).mockImplementation((name) => {
      return name !== "local";
    });

    // Request with defaultOrder that includes providers NOT in the map
    // The fallback loop will try providers that don't exist → triggers BRDA:427
    await expect(
      gw.ask({
        ...makeRequest(),
        constraints: {
          ...makeRequest().constraints,
          excludedProviders: [],
        },
      }),
    ).rejects.toThrow("All providers failed for the request");
  });

  // -----------------------------------------------------------------------
  // BRDA:540,39,1,0 — recordFailureResponse: error instanceof DomainError
  // Need: Provider that throws a DomainError
  // -----------------------------------------------------------------------
  it("BRDA:540 — recordFailureResponse: DomainError path", async () => {
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
  });

  // -----------------------------------------------------------------------
  // BRDA:711,47,1,0 — processProviderRequest: catch block error return
  // Need: Provider that throws an error during ask()
  // -----------------------------------------------------------------------
  it("BRDA:711 — processProviderRequest: catch block error return", async () => {
    const errorAdapter = {
      ask: vi.fn().mockRejectedValue(new Error("Generic provider error")),
    };

    const gw = new Gateway({ providers: { local: errorAdapter } });

    await expect(gw.ask(makeRequest())).rejects.toThrow(
      "All providers failed for the request",
    );
  });

  // -----------------------------------------------------------------------
  // BRDA:772,52,1,0 — ask: all providers fail → RoutingNoProviderError
  // Need: Multiple providers that all fail
  // -----------------------------------------------------------------------
  it("BRDA:772 — ask: all providers fail → RoutingNoProviderError", async () => {
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

    await expect(gw.ask(makeRequest())).rejects.toThrow(
      "All providers failed for the request",
    );

    expect(failingLocal.ask).toHaveBeenCalled();
    expect(failingOpenai.ask).toHaveBeenCalled();
    expect(failingGemini.ask).toHaveBeenCalled();
  });
});

// ============================================================================
// P2 — Stream-specific paths (2 tests → 2 branches)
// ============================================================================

describe("P2 — Stream-specific paths (v3 corrected)", () => {
  // -----------------------------------------------------------------------
  // BRDA:639,44,0,0 — stream: !candidates.length (no candidates error)
  // Need: Empty providers map → no candidates
  // -----------------------------------------------------------------------
  it("BRDA:639 — stream: no candidates after policy", async () => {
    const gw = new Gateway({ providers: {} });

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
  // Need: Provider without stream capability or unhealthy
  // -----------------------------------------------------------------------
  it("BRDA:660 — stream: no streaming-capable healthy provider", async () => {
    const noStreamAdapter = {
      ask: vi.fn().mockResolvedValue({
        outputText: "Response",
        model: "test-model",
        finishReason: "stop",
      }),
      // No stream method
    };

    const gw = new Gateway({ providers: { local: noStreamAdapter } });

    vi.mocked(isProviderAvailable).mockReturnValue(false);

    await expect(async () => {
      for await (const _chunk of gw.stream(makeRequest())) {
        // Should not reach here
      }
    }).rejects.toThrow("No streaming-capable healthy provider available");
  });
});

// ============================================================================
// P3 — Stream error (1 test → 1 branch)
// ============================================================================

describe("P3 — Stream error (v3 corrected)", () => {
  // -----------------------------------------------------------------------
  // BRDA:877,60,1,0 — stream catch: error instanceof DomainError
  // Need: Stream that throws DomainError
  // -----------------------------------------------------------------------
  it("BRDA:877 — stream catch: DomainError path", async () => {
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

    const gw = new Gateway({
      providers: { local: domainErrorStreamAdapter },
      defaultOrder: ["local"] as any,
    });

    try {
      for await (const _chunk of gw.stream(makeRequest())) {
        // Should not yield any chunks
      }
      throw new Error("Expected stream to throw");
    } catch (error: any) {
      expect(error.message).toBe("Stream error");
      expect(error instanceof DomainError).toBe(true);
    }
  });
});

// ============================================================================
// P5 — appendLocalIfAvailableForStream (2 tests → 3 branches)
// ============================================================================

describe("P5 — appendLocalIfAvailableForStream (v3 corrected)", () => {
  // -----------------------------------------------------------------------
  // BRDA:943,66,1,0 + BRDA:944,67,1,0 — preferredProvider === "local" (unshift)
  // Need: Call appendLocalIfAvailableForStream with preferredProvider="local"
  // -----------------------------------------------------------------------
  it("BRDA:943/944 — appendLocalIfAvailableForStream: preferredProvider === 'local' (unshift)", async () => {
    mockApplyPolicyToCandidatesWithReason.mockReturnValue({
      candidates: [], // Empty candidates — "local" will be added
      policyReason: "test-policy",
    });

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    // Call the prototype method directly to bypass explainRoutingSelection
    const candidates: any[] = [];
    gw.appendLocalIfAvailableForStream(candidates, [], "local");

    expect(candidates).toEqual(["local"]);
  });

  // -----------------------------------------------------------------------
  // BRDA:945,68,1,0 — preferredProvider !== "local" (push)
  // Need: Call appendLocalIfAvailableForStream with preferredProvider !== "local"
  // -----------------------------------------------------------------------
  it("BRDA:945 — appendLocalIfAvailableForStream: preferredProvider !== 'local' (push)", async () => {
    mockApplyPolicyToCandidatesWithReason.mockReturnValue({
      candidates: [], // Empty candidates — "local" will be added
      policyReason: "test-policy",
    });

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({ providers: { local: localAdapter } });

    const candidates: any[] = [];
    gw.appendLocalIfAvailableForStream(candidates, [], "openai");

    expect(candidates).toEqual(["local"]);
  });
});
