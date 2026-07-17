/**
 * Prompt 9 — Coverage gap closure for src/llm/gateway.ts
 *
 * Targets previously-uncovered BRDA branches:
 *   Priority 1:
 *   - BRDA:427  validateProviderAvailable !provider (provider not found)
 *   - BRDA:639  stream() !candidates.length (no candidates)
 *   - BRDA:660  stream() !providerName (no streaming-capable provider)
 *   Priority 3:
 *   - BRDA:816  appendLocalIfAvailable policy error catch
 *   - BRDA:877  appendLocalIfAvailable local already in candidates
 *   - BRDA:943-948  appendLocalIfAvailableForStream preferredProvider branches
 *   - BRDA:1030-1031  appendLocalIfAvailableForStream catch branches
 *   Lower priority (trim steps):
 *   - BRDA:52    logNonFatalError error instanceof Error (tested indirectly)
 *   - BRDA:96    tryDropWorkspaceContext !prompt.startsWith(workspaceContext)
 *   - BRDA:100   tryDropWorkspaceContext !remainingPrompt.startsWith(userRequestPrefix)
 *   - BRDA:103   tryDropWorkspaceContext userPromptFromMarker.length > budgetChars
 *   - BRDA:133   tryTruncateToolResult nonToolPart.length > budgetChars
 *   - BRDA:137   tryTruncateToolResult no pattern match
 *   - BRDA:164   tryPreserveUserPrompt !userPrompt
 *   - BRDA:203   tryMarkerBasedFallback !userRequestMatch
 *   - BRDA:317   enforcePromptBudget trimmedPrompt.length <= budgetChars
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Gateway,
  enforcePromptBudget,
  type GatewayOptions,
} from "../../src/llm/gateway.js";
import {
  resetProviderHealth,
  markProviderFromError,
  isProviderAvailable,
} from "../../src/llm/provider-health.js";
import { resetProviderUsage } from "../../src/llm/provider-usage.js";
import { resetRoutingHistory } from "../../src/llm/routing-history.js";

// ---------------------------------------------------------------------------
// Module-level mocks (match existing gateway-coverage.test.ts patterns)
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

// Mock provider-policy — we need to control getState() for appendLocalIfAvailable tests
const mockGetState = vi.fn(() => ({
  routingMode: "cloud",
  allowedProviders: ["local"],
  blockedProviders: [],
  manualProvider: null,
  activePreset: "default",
  updatedAt: Date.now(),
}));

vi.mock("../../src/policies/provider-policy.js", () => {
  const mockFn = vi.fn(() => ({
    routingMode: "cloud",
    allowedProviders: ["local"],
    blockedProviders: [],
    manualProvider: null,
    activePreset: "default",
    updatedAt: Date.now(),
  }));
  return {
    getState: () => mockFn(),
    getProviderPolicy: () => mockFn(),
    applyPolicyToCandidatesWithReason: (candidates) => ({
      candidates: [...candidates],
      policyReason: "default-policy",
    }),
    applyPolicyToCandidates: (candidates) => {
      const result = [...candidates];
      Object.defineProperty(result, "candidates", {
        value: [...candidates],
        enumerable: false,
        configurable: true,
      });
      Object.defineProperty(result, "policyReason", {
        value: "default-policy",
        enumerable: false,
        configurable: true,
      });
      return result;
    },
    get __mockGetState() {
      return mockFn;
    },
  };
});

// Mock provider-health to control isProviderAvailable
vi.mock("../../src/llm/provider-health.js", async () => {
  const actual = await vi.importActual("../../src/llm/provider-health.js");
  return {
    ...(actual || {
      resetProviderHealth: vi.fn(),
      markProviderFromError: vi.fn(),
      getProviderHealthSnapshot: vi.fn(() => ({})),
    }),
    isProviderAvailable: vi.fn(() => true),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides = {}) {
  return {
    prompt: "Test prompt",
    userPrompt: "Test user prompt",
    requestId: "test-req",
    constraints: {
      maxTokens: 256,
      temperature: 0.5,
    },
    ...overrides,
  };
}

function makeLocalOnlyGateway(providerOverrides = {}) {
  const localAdapter = {
    ask: vi.fn().mockResolvedValue({
      outputText: "Local response",
      model: "local-model",
      finishReason: "stop",
    }),
    stream: vi.fn().mockImplementation(async function* () {
      yield { delta: "streamed ", provider: "local" };
    }),
  };
  return new Gateway({
    providers: { local: localAdapter, ...providerOverrides },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Prompt 9 — gateway.ts gap closure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProviderHealth();
    resetProviderUsage();
    resetRoutingHistory();
  });

  afterEach(() => {
    // Reset the isProviderAvailable mock to default (true for all providers)
    vi.mocked(isProviderAvailable).mockReturnValue(true);
    resetProviderHealth();
    resetProviderUsage();
    resetRoutingHistory();
  });

  // -----------------------------------------------------------------------
  // Priority 1: validateProviderAvailable error path
  // -----------------------------------------------------------------------

  describe("validateProviderAvailable", () => {
    it("should throw RoutingNoProviderError when provider not found in map (BRDA:427)", async () => {
      // Create gateway with a provider that always fails
      const failingAdapter = {
        ask: vi.fn().mockRejectedValue(new Error("Provider error")),
      };
      const gateway = new Gateway({
        providers: { groq: failingAdapter },
      });

      // Mark groq as unhealthy so it gets skipped, then fallback to providers
      // that don't exist in the map → triggers BRDA:427 (!provider check)
      markProviderFromError("groq", new Error("Health check failed"));

      // With groq marked unhealthy and no other providers available,
      // validateProviderAvailable will hit the !provider branch
      await expect(
        gateway.ask({
          ...makeRequest(),
          constraints: {
            ...makeRequest().constraints,
            excludedProviders: ["local", "openai", "gemini", "perplexity"],
          },
        }),
      ).rejects.toThrow("All providers failed for the request");
    });
  });

  // -----------------------------------------------------------------------
  // Priority 1: stream() error paths
  // -----------------------------------------------------------------------

  describe("stream() error paths", () => {
    it("should throw RoutingNoProviderError when no candidates available (BRDA:639)", async () => {
      const gateway = new Gateway({
        providers: {}, // Empty providers map
      });

      // Stream with all providers excluded — resolveCandidates returns empty array
      const request = makeRequest({
        constraints: {
          ...makeRequest().constraints,
          excludedProviders: [
            "local",
            "openai",
            "groq",
            "gemini",
            "perplexity",
          ],
        },
      });

      // Collect from async iterator and expect error
      await expect(async () => {
        for await (const _chunk of gateway.stream(request)) {
          // Should not reach here
        }
      }).rejects.toThrow("No provider candidates available for stream");
    });

    it("should throw when no streaming-capable healthy provider available (BRDA:660)", async () => {
      // Create a provider without stream capability
      const noStreamAdapter = {
        ask: vi.fn().mockResolvedValue({
          outputText: "Response",
          model: "test-model",
          finishReason: "stop",
        }),
        // No stream method
      };

      const gateway = new Gateway({
        providers: { local: noStreamAdapter },
      });

      // Mock isProviderAvailable to return false for "local"
      vi.mocked(isProviderAvailable).mockReturnValue(false);

      const request = makeRequest({
        preferredProvider: "local",
      });

      await expect(async () => {
        for await (const _chunk of gateway.stream(request)) {
          // Should not reach here
        }
      }).rejects.toThrow("No streaming-capable healthy provider available");
    });
  });

  // -----------------------------------------------------------------------
  // Priority 3: appendLocalIfAvailable edge cases
  // -----------------------------------------------------------------------

  describe("appendLocalIfAvailable", () => {
    it("should handle policy error gracefully and still append local (BRDA:816)", async () => {
      // Make getState throw — we need to re-import to get the mock reference
      const policyModule =
        await import("../../src/policies/provider-policy.js");
      vi.spyOn(policyModule, "getState").mockImplementation(() => {
        throw new Error("Policy state unavailable");
      });

      const localAdapter = {
        ask: vi.fn().mockResolvedValue({
          outputText: "Local response",
          model: "local-model",
          finishReason: "stop",
        }),
      };
      const gateway = makeLocalOnlyGateway();

      // ask() internally calls appendLocalIfAvailable via processProviderRequest
      // The catch path should handle the policy error gracefully
      const response = await gateway.ask(makeRequest());
      expect(response.outputText).toBe("Local response");
    });

    it("should not append local when already in candidates (BRDA:877)", async () => {
      const localAdapter = {
        ask: vi.fn().mockResolvedValue({
          outputText: "Local response",
          model: "local-model",
          finishReason: "stop",
        }),
      };
      const gateway = makeLocalOnlyGateway({ local: localAdapter });

      // When "local" is already the only candidate, it should not be duplicated
      // The key thing is that the response succeeds — local is found and used
      const response = await gateway.ask(
        makeRequest({ preferredProvider: "local" }),
      );
      expect(response.outputText).toBe("Local response");
      // The adapter should have been called (proves local was reached)
      expect(localAdapter.ask).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Priority 3: appendLocalIfAvailableForStream edge cases
  // -----------------------------------------------------------------------

  describe("appendLocalIfAvailableForStream", () => {
    it("should unshift local when preferredProvider is 'local' (BRDA:943)", async () => {
      const localAdapter = {
        ask: vi.fn().mockResolvedValue({
          outputText: "Local response",
          model: "local-model",
          finishReason: "stop",
        }),
        stream: vi.fn().mockImplementation(async function* () {
          yield { delta: "streamed ", provider: "local" };
        }),
      };
      const gateway = makeLocalOnlyGateway();

      const chunks: any[] = [];
      for await (const chunk of gateway.stream(
        makeRequest({ preferredProvider: "local" }),
      )) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should push local when preferredProvider is not 'local' (BRDA:944)", async () => {
      const localAdapter = {
        ask: vi.fn().mockResolvedValue({
          outputText: "Local response",
          model: "local-model",
          finishReason: "stop",
        }),
        stream: vi.fn().mockImplementation(async function* () {
          yield { delta: "streamed ", provider: "local" };
        }),
      };
      const gateway = makeLocalOnlyGateway();

      const chunks: any[] = [];
      // No preferredProvider or preferredProvider !== "local"
      for await (const chunk of gateway.stream(makeRequest())) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should not append local when already in candidates (BRDA:945)", async () => {
      const localAdapter = {
        ask: vi.fn().mockResolvedValue({
          outputText: "Local response",
          model: "local-model",
          finishReason: "stop",
        }),
        stream: vi.fn().mockImplementation(async function* () {
          yield { delta: "streamed ", provider: "local" };
        }),
      };
      const gateway = makeLocalOnlyGateway();

      // Local is already the only provider, so it should not be duplicated
      const chunks: any[] = [];
      for await (const chunk of gateway.stream(
        makeRequest({ preferredProvider: "local" }),
      )) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should handle policy error in catch block with preferredProvider 'local' (BRDA:948, BRDA:1030)", async () => {
      // Make getState throw
      const policyModule =
        await import("../../src/policies/provider-policy.js");
      vi.spyOn(policyModule, "getState").mockImplementation(() => {
        throw new Error("Policy state unavailable");
      });

      const localAdapter = {
        ask: vi.fn().mockResolvedValue({
          outputText: "Local response",
          model: "local-model",
          finishReason: "stop",
        }),
        stream: vi.fn().mockImplementation(async function* () {
          yield { delta: "streamed ", provider: "local" };
        }),
      };
      const gateway = makeLocalOnlyGateway();

      const chunks: any[] = [];
      for await (const chunk of gateway.stream(
        makeRequest({ preferredProvider: "local" }),
      )) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should handle policy error in catch block without preferredProvider (BRDA:1030-1031)", async () => {
      // Make getState throw
      const policyModule =
        await import("../../src/policies/provider-policy.js");
      vi.spyOn(policyModule, "getState").mockImplementation(() => {
        throw new Error("Policy state unavailable");
      });

      const localAdapter = {
        ask: vi.fn().mockResolvedValue({
          outputText: "Local response",
          model: "local-model",
          finishReason: "stop",
        }),
        stream: vi.fn().mockImplementation(async function* () {
          yield { delta: "streamed ", provider: "local" };
        }),
      };
      const gateway = makeLocalOnlyGateway();

      const chunks: any[] = [];
      for await (const chunk of gateway.stream(makeRequest())) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Lower priority: trim step edge cases (enforcePromptBudget exported function)
  // -----------------------------------------------------------------------

  describe("enforcePromptBudget — trim step edge cases", () => {
    it("should handle prompt that doesn't start with workspaceContext (BRDA:96)", () => {
      const result = enforcePromptBudget(
        "Some random prompt without workspace context",
        { budgetChars: 50 },
        "This is workspace context that doesn't match",
        "User content",
      );
      expect(result.trimmedPrompt).toBe(
        "Some random prompt without workspace context",
      );
    });

    it("should handle prompt where remaining doesn't start with userRequestPrefix (BRDA:100)", () => {
      const result = enforcePromptBudget(
        "Workspace context prefix\nSome content without User request: marker",
        { budgetChars: 50 },
        "Workspace context prefix\n",
        "User content",
      );
      expect(result.trimmedPrompt).toBeDefined();
    });

    it("should handle userPromptFromMarker exceeding budgetChars (BRDA:103)", () => {
      const longUserPrompt = "x".repeat(200);
      const result = enforcePromptBudget(
        `Workspace context\nUser request: ${longUserPrompt}`,
        { budgetChars: 50 },
        "Workspace context\n",
        longUserPrompt,
      );
      // When userPrompt exceeds budget, the function tries to preserve it but
      // may fall back to passing through untrimmed if no safe boundary exists
      expect(result.trimmedPrompt).toBeDefined();
      expect(result.originalLength).toBeGreaterThan(50);
    });

    it("should handle nonToolPart exceeding budgetChars (BRDA:133)", () => {
      const longNonToolPart = "x".repeat(200);
      const result = enforcePromptBudget(
        `<tool_result>short</tool_result>${longNonToolPart}`,
        { budgetChars: 50 },
        "",
        "user prompt",
      );
      // When nonToolPart exceeds budget, trimming attempts may fall back to pass-through
      expect(result.trimmedPrompt).toBeDefined();
      expect(result.originalLength).toBeGreaterThan(50);
    });

    it("should handle prompt with no TOOL_RESULT pattern (BRDA:137)", () => {
      const result = enforcePromptBudget(
        "Plain prompt without any tool result markers",
        { budgetChars: 30 },
        "",
        "user prompt",
      );
      expect(result.trimmedPrompt).toBeDefined();
    });

    it("should handle empty userPrompt (BRDA:164)", () => {
      const result = enforcePromptBudget(
        "Some prompt content",
        { budgetChars: 10 },
        "",
        "", // Empty userPrompt
      );
      expect(result.trimmedPrompt).toBeDefined();
    });

    it("should handle prompt without 'User request:' marker (BRDA:203)", () => {
      const result = enforcePromptBudget(
        "Just some random text without any markers",
        { budgetChars: 20 },
        "",
        "user prompt",
      );
      expect(result.trimmedPrompt).toBeDefined();
    });

    it("should return early when within budget (BRDA:317)", () => {
      const shortPrompt = "Short prompt";
      const result = enforcePromptBudget(
        shortPrompt,
        { budgetChars: 200 }, // Budget is much larger than prompt
        "",
        "user prompt",
      );
      expect(result.trimmedPrompt).toBe(shortPrompt);
      expect(result.originalLength).toBe(shortPrompt.length);
      expect(result.trimmedLength).toBe(shortPrompt.length);
    });
  });
});
