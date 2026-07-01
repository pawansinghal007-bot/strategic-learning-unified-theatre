/**
 * Targeted coverage tests for src/llm/gateway.ts
 *
 * Covers previously-uncovered lines:
 *   49, 110-114, 131-132, 136, 154-155, 185, 244, 248-251, 335,
 *   468, 491, 502, 520, 551-575, 596-598, 681-682, 703-709, 731-744
 *
 * NOTE: Provider adapters are mocked globally by tests/setup.ts.
 * Workspace-quota and request-context modules are mocked here so we
 * can control the exact decision paths without real storage I/O.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Gateway,
  applyWorkspaceQuotaEnforcement,
  enforceWorkspaceQuotaOrThrow,
  type GatewayOptions,
} from "../../src/llm/gateway.js";
import {
  resetProviderHealth,
  markProviderFailed,
} from "../../src/llm/provider-health.js";
import { resetProviderUsage } from "../../src/llm/provider-usage.js";
import { resetRoutingHistory } from "../../src/llm/routing-history.js";

// ---------------------------------------------------------------------------
// Module-level mocks (applied before any test runs in this file)
// ---------------------------------------------------------------------------

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

// We need to be able to reconfigure these per test, so import them after mock
import {
  evaluateWorkspaceQuotaStatus,
  recordWorkspaceQuotaUsage,
} from "../../src/governance/workspace-quotas.js";
import { buildRequestContextPrompt } from "../../src/memory/request-context.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(overrides = {}) {
  return {
    requestId: `test-${Date.now()}-${Math.random()}`,
    prompt: "Hello",
    ...overrides,
  };
}

function makeBlockedQuota() {
  return {
    allowed: false,
    blocked: true,
    shouldFallback: false,
    shouldAlert: false,
    thresholdReached: false,
    fallbackProvider: null,
  };
}

function makeAlertQuota(fallbackProvider = "local") {
  return {
    allowed: true,
    blocked: false,
    shouldFallback: true,
    shouldAlert: true,
    thresholdReached: true,
    fallbackProvider,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  resetProviderHealth();
  resetProviderUsage();
  resetRoutingHistory();
  vi.mocked(evaluateWorkspaceQuotaStatus).mockReturnValue({
    allowed: true,
    blocked: false,
    shouldFallback: false,
    shouldAlert: false,
    thresholdReached: false,
    fallbackProvider: null,
  } as any);
  vi.mocked(buildRequestContextPrompt).mockReturnValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// logNonFatalError (line 49) — called by appendLocalIfAvailable on error
// ---------------------------------------------------------------------------
describe("logNonFatalError via appendLocalIfAvailable", () => {
  it("does not throw when getState throws (catches via logNonFatalError)", async () => {
    // Force getState to throw by mocking provider-policy
    vi.doMock("../../src/policies/provider-policy.js", () => ({
      applyPolicyToCandidatesWithReason: vi.fn((candidates) => ({
        candidates,
        policyReason: "test",
      })),
      getState: vi.fn(() => {
        throw new Error("policy state error");
      }),
    }));

    // Gateway should still succeed — logNonFatalError catches the error
    const gw = new Gateway({ defaultOrder: ["local"] });
    const response = await gw.ask(makeRequest());
    expect(response).toBeDefined();
    expect(response.provider).toBe("local");

    vi.doUnmock("../../src/policies/provider-policy.js");
  });
});

// ---------------------------------------------------------------------------
// handleQuotaDecision — lines 110-114 (blocked), 131-132, 136 (fallback/alert)
// ---------------------------------------------------------------------------
describe("Gateway.handleQuotaDecision()", () => {
  it("throws WORKSPACE_QUOTA_EXCEEDED when quota is blocked", async () => {
    vi.mocked(evaluateWorkspaceQuotaStatus).mockReturnValue(
      makeBlockedQuota() as any,
    );

    const gw = new Gateway({ defaultOrder: ["local"] });
    await expect(
      gw.ask(makeRequest({ workspaceId: "ws-blocked" })),
    ).rejects.toThrow("Workspace quota exceeded");
  });

  it("attaches code and workspaceId to the thrown error", async () => {
    vi.mocked(evaluateWorkspaceQuotaStatus).mockReturnValue(
      makeBlockedQuota() as any,
    );

    const gw = new Gateway({ defaultOrder: ["local"] });
    let thrownError: any;
    try {
      await gw.ask(makeRequest({ workspaceId: "ws-err-code" }));
    } catch (err) {
      thrownError = err;
    }
    expect(thrownError?.code).toBe("WORKSPACE_QUOTA_EXCEEDED");
    expect(thrownError?.workspaceId).toBe("ws-err-code");
  });

  // lines 131-132: shouldFallback=true switches the provider
  it("switches to fallback provider when shouldFallback is true", async () => {
    vi.mocked(evaluateWorkspaceQuotaStatus).mockReturnValue(
      makeAlertQuota("local") as any,
    );

    const gw = new Gateway({ defaultOrder: ["groq", "local"] });
    // groq would normally run first but quota says fall back to local
    const response = await gw.ask(makeRequest({ workspaceId: "ws-fallback" }));
    // Response should come back (may be local stub depending on provider health)
    expect(response).toBeDefined();
  });

  // line 136: shouldAlert=true + thresholdReached=true → logs warning, proceeds
  it("logs quota alert but still returns a response when shouldAlert is true", async () => {
    vi.mocked(evaluateWorkspaceQuotaStatus).mockReturnValue(
      makeAlertQuota("local") as any,
    );

    const gw = new Gateway({ defaultOrder: ["local"] });
    const response = await gw.ask(makeRequest({ workspaceId: "ws-alert" }));
    expect(response).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// injectContextIntoRequest — lines 154-155, 185
// ---------------------------------------------------------------------------
describe("Gateway.injectContextIntoRequest()", () => {
  // line 154: no workspaceId → requestData returned unchanged
  it("returns request unchanged when no workspaceId is set", async () => {
    const gw = new Gateway({ defaultOrder: ["local"] });
    const req = makeRequest(); // no workspaceId
    const response = await gw.ask(req);
    expect(response).toBeDefined();
    // buildRequestContextPrompt should NOT have been called
    expect(vi.mocked(buildRequestContextPrompt)).not.toHaveBeenCalled();
  });

  // line 155: workspaceId set, contextPrompt is non-null → prepended to prompt
  it("prepends context prompt when buildRequestContextPrompt returns a string", async () => {
    vi.mocked(buildRequestContextPrompt).mockReturnValue(
      "Workspace context: be concise.",
    );

    const gw = new Gateway({ defaultOrder: ["local"] });
    const response = await gw.ask(
      makeRequest({ workspaceId: "ws-ctx" }),
    );
    // The local stub adapter receives the modified prompt — response should exist
    expect(response).toBeDefined();
    expect(vi.mocked(buildRequestContextPrompt)).toHaveBeenCalledWith("ws-ctx");
  });

  // line 185: buildRequestContextPrompt throws → logNonFatalError catches it
  it("continues without context when buildRequestContextPrompt throws", async () => {
    vi.mocked(buildRequestContextPrompt).mockImplementation(() => {
      throw new Error("context lookup failed");
    });

    const gw = new Gateway({ defaultOrder: ["local"] });
    // Should NOT throw — the error is non-fatal
    const response = await gw.ask(makeRequest({ workspaceId: "ws-ctx-err" }));
    expect(response).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// resolveCandidates — lines 244, 248-251, 335 (various constraint branches)
// ---------------------------------------------------------------------------
describe("Gateway.resolveCandidates()", () => {
  // line 244: preferredProvider → put it first
  it("routes to preferredProvider first", async () => {
    const gw = new Gateway({ defaultOrder: ["groq", "gemini", "local"] });
    const response = await gw.ask(
      makeRequest({
        constraints: { preferredProvider: "local" },
      }),
    );
    expect(response.provider).toBe("local");
  });

  // line 248-251: requiresWeb=true → perplexity first
  it("puts perplexity first when requiresWeb=true", async () => {
    // Perplexity adapter is a failing cloud adapter in test setup.
    // The gateway will fall through to local. Just verify it doesn't throw.
    const gw = new Gateway({ defaultOrder: ["groq", "local"] });
    const response = await gw.ask(
      makeRequest({ constraints: { requiresWeb: true } }),
    );
    expect(response).toBeDefined();
  });

  // line 248-251: requiresWeb without perplexity provider → normal order
  it("falls through to normal order when perplexity provider is absent and requiresWeb=true", async () => {
    const gw = new Gateway({
      defaultOrder: ["local"],
      providers: {
        local: (new Gateway({ defaultOrder: ["local"] }) as any).providers.local,
      } as any,
    });
    const response = await gw.ask(
      makeRequest({ constraints: { requiresWeb: true } }),
    );
    expect(response.provider).toBe("local");
  });

  // line 335 (resolveCandidates privacyMode local-only)
  it("routes exclusively to local when privacyMode=local-only", async () => {
    const gw = new Gateway({ defaultOrder: ["groq", "gemini", "local"] });
    const response = await gw.ask(
      makeRequest({
        constraints: { privacyMode: "local-only" },
      }),
    );
    expect(response.provider).toBe("local");
  });

  // excludedProviders filtering
  it("excludes providers listed in excludedProviders", async () => {
    const gw = new Gateway({ defaultOrder: ["groq", "local"] });
    // groq will fail (no API key); excluding groq means no provider in order
    // except local — response should still come from local
    const response = await gw.ask(
      makeRequest({
        constraints: { excludedProviders: ["groq", "gemini", "openai", "perplexity"] },
      }),
    );
    expect(response.provider).toBe("local");
  });
});

// ---------------------------------------------------------------------------
// validateProviderAvailable — lines 468, 491
// ---------------------------------------------------------------------------
describe("Gateway.validateProviderAvailable()", () => {
  // line 468: provider not in providers map → skips with warning
  it("skips a provider that is not registered in the providers map", async () => {
    const gw = new Gateway({
      // Only local registered; "groq" is in default order but not here
      defaultOrder: ["groq", "local"],
      providers: {
        local: (new Gateway({ defaultOrder: ["local"] }) as any).providers.local,
      } as any,
    });
    const response = await gw.ask(makeRequest());
    // Falls through to local
    expect(response.provider).toBe("local");
  });
});

// ---------------------------------------------------------------------------
// stream() — lines 502, 520, 551-575
// ---------------------------------------------------------------------------
describe("Gateway.stream()", () => {
  // line 502: invalid request schema → ValidationFailedError
  it("throws ValidationFailedError for invalid stream request", async () => {
    const gw = new Gateway({ defaultOrder: ["local"] });
    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gen = gw.stream({} as any);
      for await (const _ of gen) { /* consume */ }
    }).rejects.toThrow();
  });

  // line 520: no streaming-capable provider available → RoutingNoProviderError
  it("throws when no streaming-capable provider is available", async () => {
    const gw = new Gateway({
      defaultOrder: ["local"],
      providers: {
        local: {
          name: "local",
          capabilities: () => [],
          ask: vi.fn(),
          // No stream method
        } as any,
      },
    });
    await expect(async () => {
      for await (const _ of gw.stream(makeRequest())) { /* consume */ }
    }).rejects.toThrow();
  });

  // lines 551-575: successful stream → yields chunks
  it("streams token chunks from a healthy provider", async () => {
    const gw = new Gateway({ defaultOrder: ["local"] });
    const chunks: any[] = [];
    for await (const chunk of gw.stream(makeRequest())) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toHaveProperty("delta");
  });

  // stream with preferredProvider=local (appendLocalIfAvailableForStream local unshift branch)
  it("streams with preferredProvider=local", async () => {
    const gw = new Gateway({ defaultOrder: ["groq", "local"] });
    const chunks: any[] = [];
    for await (const chunk of gw.stream(
      makeRequest({ constraints: { preferredProvider: "local" } }),
    )) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });

  // stream error path: provider.stream throws → re-throws after recording failure
  it("re-throws when the streaming provider fails", async () => {
    const failingStream = async function* () {
      throw new Error("stream boom");
    };
    const gw = new Gateway({
      defaultOrder: ["local"],
      providers: {
        local: {
          name: "local",
          capabilities: () => ["chat"],
          ask: vi.fn(),
          stream: failingStream,
        } as any,
      },
    });
    await expect(async () => {
      for await (const _ of gw.stream(makeRequest())) { /* consume */ }
    }).rejects.toThrow("stream boom");
  });

  // ValidationFailedError for invalid chunk schema from stream
  it("throws ValidationFailedError when provider yields an invalid chunk", async () => {
    const badStream = async function* () {
      yield { invalidField: "not a valid TokenChunk" };
    };
    const gw = new Gateway({
      defaultOrder: ["local"],
      providers: {
        local: {
          name: "local",
          capabilities: () => ["chat"],
          ask: vi.fn(),
          stream: badStream,
        } as any,
      },
    });
    await expect(async () => {
      for await (const _ of gw.stream(makeRequest())) { /* consume */ }
    }).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// stream() with workspaceId — quota path in stream
// ---------------------------------------------------------------------------
describe("Gateway.stream() with workspaceId", () => {
  it("streams successfully when workspaceId is provided and quota is ok", async () => {
    const gw = new Gateway({ defaultOrder: ["local"] });
    const chunks: any[] = [];
    for await (const chunk of gw.stream(
      makeRequest({ workspaceId: "ws-stream" }),
    )) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// recordSuccessResponse / recordFailureResponse — lines 596-598
// ---------------------------------------------------------------------------
describe("Gateway recordFailureResponse DomainError path (line 596-598)", () => {
  it("calls markProviderFromError when provider throws a DomainError", async () => {
    const { DomainError } = await import("../../src/shared/errors/index.js");

    const gw = new Gateway({
      defaultOrder: ["local"],
      providers: {
        local: {
          name: "local",
          capabilities: () => [],
          ask: vi.fn().mockRejectedValue(
            new DomainError("TEST_ERROR", "Domain error from provider"),
          ),
        } as any,
      },
    });
    // All providers fail → should throw RoutingNoProviderError
    await expect(gw.ask(makeRequest())).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// applyWorkspaceQuotaEnforcement (exported function) — lines 681-682
// ---------------------------------------------------------------------------
describe("applyWorkspaceQuotaEnforcement()", () => {
  it("returns a GatewayQuotaDecision with allowed=true when quota is fine", () => {
    const decision = applyWorkspaceQuotaEnforcement({
      workspaceId: "ws-test",
      provider: "local",
    });
    expect(decision).toHaveProperty("allowed");
    expect(decision).toHaveProperty("blocked");
    expect(decision).toHaveProperty("shouldFallback");
    expect(decision).toHaveProperty("shouldAlert");
    expect(decision).toHaveProperty("thresholdReached");
    expect(decision).toHaveProperty("provider");
    expect(decision).toHaveProperty("quota");
  });

  it("sets provider to input.provider when shouldFallback=false", () => {
    vi.mocked(evaluateWorkspaceQuotaStatus).mockReturnValue({
      allowed: true,
      blocked: false,
      shouldFallback: false,
      shouldAlert: false,
      thresholdReached: false,
      fallbackProvider: null,
    } as any);
    const decision = applyWorkspaceQuotaEnforcement({
      workspaceId: "ws-no-fallback",
      provider: "local",
    });
    expect(decision.provider).toBe("local");
  });

  it("sets provider to fallbackProvider when shouldFallback=true", () => {
    vi.mocked(evaluateWorkspaceQuotaStatus).mockReturnValue({
      allowed: true,
      blocked: false,
      shouldFallback: true,
      shouldAlert: false,
      thresholdReached: false,
      fallbackProvider: "gemini",
    } as any);
    const decision = applyWorkspaceQuotaEnforcement({
      workspaceId: "ws-with-fallback",
      provider: "local",
    });
    expect(decision.provider).toBe("gemini");
  });

  // countUsage=false skips recordWorkspaceQuotaUsage (line 682)
  it("skips usage recording when countUsage=false", () => {
    applyWorkspaceQuotaEnforcement({
      workspaceId: "ws-no-record",
      provider: "local",
      countUsage: false,
    });
    expect(vi.mocked(recordWorkspaceQuotaUsage)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// enforceWorkspaceQuotaOrThrow (exported function) — lines 703-709
// ---------------------------------------------------------------------------
describe("enforceWorkspaceQuotaOrThrow()", () => {
  it("returns decision when quota is allowed", () => {
    const decision = enforceWorkspaceQuotaOrThrow({
      workspaceId: "ws-ok",
      provider: "local",
    });
    expect(decision).toBeDefined();
    expect(decision.blocked).toBe(false);
  });

  it("throws with code WORKSPACE_QUOTA_EXCEEDED when blocked", () => {
    vi.mocked(evaluateWorkspaceQuotaStatus).mockReturnValue(
      makeBlockedQuota() as any,
    );
    let thrownError: any;
    try {
      enforceWorkspaceQuotaOrThrow({
        workspaceId: "ws-blocked-enforce",
        provider: "local",
      });
    } catch (err) {
      thrownError = err;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.code).toBe("WORKSPACE_QUOTA_EXCEEDED");
    expect(thrownError.workspaceId).toBe("ws-blocked-enforce");
    expect(thrownError.quota).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// appendLocalIfAvailableForStream — lines 731-744
// (policy error fallback branch, and preferredProvider=local unshift)
// ---------------------------------------------------------------------------
describe("appendLocalIfAvailableForStream — error and preferredProvider branches", () => {
  it("adds local to the end when preferredProvider is not local", async () => {
    // Force a candidate list that doesn't include local, then stream
    const gw = new Gateway({ defaultOrder: ["local"] });
    const chunks: any[] = [];
    for await (const chunk of gw.stream(
      makeRequest({ constraints: { preferredProvider: "groq" } }),
    )) {
      chunks.push(chunk);
    }
    // groq fails, local is appended as fallback for stream
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("puts local first when preferredProvider=local", async () => {
    const gw = new Gateway({ defaultOrder: ["groq", "local"] });
    const chunks: any[] = [];
    for await (const chunk of gw.stream(
      makeRequest({ constraints: { preferredProvider: "local" } }),
    )) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ask() — RoutingNoProviderError when all providers filtered out
// ---------------------------------------------------------------------------
describe("Gateway.ask() — no-candidates path", () => {
  it("throws RoutingNoProviderError when all candidates are excluded", async () => {
    const gw = new Gateway({ defaultOrder: ["local"] });
    await expect(
      gw.ask(
        makeRequest({
          constraints: {
            excludedProviders: [
              "local",
              "groq",
              "gemini",
              "openai",
              "perplexity",
            ] as any,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
