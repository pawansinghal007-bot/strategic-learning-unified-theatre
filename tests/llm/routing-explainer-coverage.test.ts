/**
 * routing-explainer-coverage.test.ts
 *
 * Targets uncovered lines in src/llm/routing-explainer.ts:
 *   79   — getFallbackExplanation: context.fallbackFrom is set
 *   120  — getPrivacyModeExplanation: privacyMode !== "local-only" → returns undefined
 *   140  — getWebResearchExplanation: requiresWeb=true but provider !== "perplexity" → undefined
 *   143  — getPreferredProviderExplanation: preferredProvider !== provider → undefined
 *   146  — getPolicyModeExplanation: routingMode !== "local-only" → undefined
 *   149  — getManualProviderExplanation: manualProvider !== provider → undefined
 *   159  — getPolicyFilteringExplanation: policyApplied=true but blockedProviders.length=0 → undefined
 *   168  — getPolicyReasonExplanation: policyReason is falsy → undefined
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the two imports so we control what policy/sensitive-task return
vi.mock("../../src/policies/provider-policy.js", () => ({
  getProviderPolicy: vi.fn(() => ({
    routingMode: "auto",
    manualProvider: "",
    blockedProviders: [],
  })),
}));

vi.mock("../../src/policies/sensitive-task-rules.js", () => ({
  detectSensitiveTask: vi.fn(() => ({ forceLocal: false, reasons: [] })),
}));

import { explainRoutingSelection } from "../../src/llm/routing-explainer.js";
import { getProviderPolicy } from "../../src/policies/provider-policy.js";
import { detectSensitiveTask } from "../../src/policies/sensitive-task-rules.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetMocks(policyOverride = {}, sensitiveOverride = {}) {
  vi.mocked(getProviderPolicy).mockReturnValue({
    routingMode: "auto",
    manualProvider: "",
    blockedProviders: [],
    ...policyOverride,
  } as any);
  vi.mocked(detectSensitiveTask).mockReturnValue({
    forceLocal: false,
    reasons: [],
    ...sensitiveOverride,
  } as any);
}

beforeEach(() => resetMocks());
afterEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// getSensitiveTaskExplanation — forceLocal=true + provider="local"
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — sensitive task (forceLocal)", () => {
  it("returns sensitive-task explanation when forceLocal=true and provider=local", () => {
    vi.mocked(detectSensitiveTask).mockReturnValue({
      forceLocal: true,
      reasons: ["PII detected", "medical content"],
    } as any);

    const result = explainRoutingSelection({ intent: "coding" }, "local");
    expect(result).toContain("sensitive task rules");
    expect(result).toContain("PII detected");
    expect(result).toContain("medical content");
  });

  it("does NOT use sensitive-task explanation when forceLocal=true but provider is not local", () => {
    vi.mocked(detectSensitiveTask).mockReturnValue({
      forceLocal: true,
      reasons: ["classified"],
    } as any);

    // provider is "groq", not "local" → falls through to next explanation
    const result = explainRoutingSelection({}, "groq");
    expect(result).not.toContain("sensitive task rules");
  });
});

// ---------------------------------------------------------------------------
// getFallbackExplanation — line 79: context.fallbackFrom is set
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — fallback explanation (line 79)", () => {
  it("returns fallback explanation when fallbackFrom is set", () => {
    const result = explainRoutingSelection(
      { intent: "coding" },
      "local",
      { fallbackFrom: "groq" },
    );
    expect(result).toContain("fallback");
    expect(result).toContain("groq");
    expect(result).toContain("local");
  });

  it("includes the selected provider name in fallback explanation", () => {
    const result = explainRoutingSelection(
      {},
      "gemini",
      { fallbackFrom: "openai" },
    );
    expect(result).toContain("gemini");
    expect(result).toContain("openai");
  });
});

// ---------------------------------------------------------------------------
// getPrivacyModeExplanation — line 120: privacyMode present but not "local-only"
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — privacyMode (line 120)", () => {
  it("returns privacy-mode explanation when privacyMode=local-only", () => {
    const result = explainRoutingSelection(
      { constraints: { privacyMode: "local-only" } },
      "local",
    );
    expect(result).toContain("privacy mode");
    expect(result).toContain("local-only");
  });

  it("does NOT return privacy-mode explanation when privacyMode is undefined (line 120 → undefined)", () => {
    const result = explainRoutingSelection(
      { constraints: { privacyMode: undefined } },
      "local",
    );
    // Falls through — should return default or other explanation, not privacy mode
    expect(result).not.toContain("privacy mode requires local-only");
  });

  it("does NOT return privacy-mode explanation when privacyMode is 'cloud' (non local-only, line 120)", () => {
    const result = explainRoutingSelection(
      { constraints: { privacyMode: "cloud" } },
      "groq",
    );
    expect(result).not.toContain("privacy mode requires local-only");
  });
});

// ---------------------------------------------------------------------------
// getWebResearchExplanation — line 140: requiresWeb=true but provider≠perplexity → undefined
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — requiresWeb explanation (line 140)", () => {
  it("returns web-research explanation when requiresWeb=true and provider=perplexity", () => {
    const result = explainRoutingSelection(
      { constraints: { requiresWeb: true } },
      "perplexity",
    );
    expect(result).toContain("Perplexity");
    expect(result).toContain("web research");
  });

  it("does NOT return web-research explanation when requiresWeb=true but provider≠perplexity (line 140)", () => {
    // requiresWeb=true but provider is "groq" → getWebResearchExplanation returns undefined
    const result = explainRoutingSelection(
      { constraints: { requiresWeb: true } },
      "groq",
    );
    expect(result).not.toContain("web research");
  });

  it("does NOT return web-research explanation when requiresWeb is false", () => {
    const result = explainRoutingSelection(
      { constraints: { requiresWeb: false } },
      "perplexity",
    );
    expect(result).not.toContain("web research");
  });
});

// ---------------------------------------------------------------------------
// getPreferredProviderExplanation — line 143: preferredProvider≠provider → undefined
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — preferredProvider (line 143)", () => {
  it("returns preferred-provider explanation when preferredProvider matches provider", () => {
    const result = explainRoutingSelection(
      { constraints: { preferredProvider: "gemini" } },
      "gemini",
    );
    expect(result).toContain("explicitly preferred");
    expect(result).toContain("gemini");
  });

  it("does NOT return preferred-provider explanation when preferredProvider≠provider (line 143)", () => {
    // preferredProvider="gemini" but actual provider is "groq"
    const result = explainRoutingSelection(
      { constraints: { preferredProvider: "gemini" } },
      "groq",
    );
    expect(result).not.toContain("explicitly preferred");
  });

  it("does NOT return preferred-provider explanation when preferredProvider is undefined", () => {
    const result = explainRoutingSelection(
      { constraints: { preferredProvider: undefined } },
      "groq",
    );
    expect(result).not.toContain("explicitly preferred");
  });
});

// ---------------------------------------------------------------------------
// getPolicyModeExplanation — line 146: routingMode≠"local-only" → undefined
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — policyMode (line 146)", () => {
  it("returns policy-mode explanation when routingMode=local-only", () => {
    vi.mocked(getProviderPolicy).mockReturnValue({
      routingMode: "local-only",
      manualProvider: "",
      blockedProviders: [],
    } as any);

    const result = explainRoutingSelection({}, "local");
    expect(result).toContain("policy mode is local-only");
  });

  it("does NOT return policy-mode explanation when routingMode=auto (line 146)", () => {
    vi.mocked(getProviderPolicy).mockReturnValue({
      routingMode: "auto",
      manualProvider: "",
      blockedProviders: [],
    } as any);

    const result = explainRoutingSelection({}, "local");
    expect(result).not.toContain("policy mode is local-only");
  });

  it("does NOT return policy-mode explanation when routingMode=cloud", () => {
    vi.mocked(getProviderPolicy).mockReturnValue({
      routingMode: "cloud",
      manualProvider: "",
      blockedProviders: [],
    } as any);

    const result = explainRoutingSelection({}, "groq");
    expect(result).not.toContain("policy mode is local-only");
  });
});

// ---------------------------------------------------------------------------
// getManualProviderExplanation — line 149: manualProvider≠provider → undefined
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — manualProvider (line 149)", () => {
  it("returns manual-provider explanation when manualProvider matches provider", () => {
    vi.mocked(getProviderPolicy).mockReturnValue({
      routingMode: "manual",
      manualProvider: "openai",
      blockedProviders: [],
    } as any);

    const result = explainRoutingSelection({}, "openai");
    expect(result).toContain("manually pinned");
    expect(result).toContain("openai");
  });

  it("does NOT return manual-provider explanation when manualProvider≠provider (line 149)", () => {
    vi.mocked(getProviderPolicy).mockReturnValue({
      routingMode: "manual",
      manualProvider: "openai",
      blockedProviders: [],
    } as any);

    // provider is "groq", manualProvider is "openai" → returns undefined
    const result = explainRoutingSelection({}, "groq");
    expect(result).not.toContain("manually pinned");
  });

  it("does NOT return manual-provider explanation when manualProvider is empty string", () => {
    vi.mocked(getProviderPolicy).mockReturnValue({
      routingMode: "auto",
      manualProvider: "",
      blockedProviders: [],
    } as any);

    const result = explainRoutingSelection({}, "groq");
    expect(result).not.toContain("manually pinned");
  });
});

// ---------------------------------------------------------------------------
// getPolicyFilteringExplanation — line 159: policyApplied=true but blockedProviders=[] → undefined
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — policyFiltering (line 159)", () => {
  it("returns policy-filtering explanation when policyApplied=true and blockedProviders has entries", () => {
    vi.mocked(getProviderPolicy).mockReturnValue({
      routingMode: "auto",
      manualProvider: "",
      blockedProviders: ["groq", "openai"],
    } as any);

    const result = explainRoutingSelection(
      {},
      "local",
      { policyApplied: true },
    );
    expect(result).toContain("policy filtering");
    expect(result).toContain("groq");
    expect(result).toContain("openai");
  });

  it("does NOT return policy-filtering when policyApplied=true but blockedProviders=[] (line 159)", () => {
    vi.mocked(getProviderPolicy).mockReturnValue({
      routingMode: "auto",
      manualProvider: "",
      blockedProviders: [],
    } as any);

    const result = explainRoutingSelection(
      {},
      "local",
      { policyApplied: true },
    );
    expect(result).not.toContain("policy filtering");
  });

  it("does NOT return policy-filtering when policyApplied is false/undefined", () => {
    vi.mocked(getProviderPolicy).mockReturnValue({
      routingMode: "auto",
      manualProvider: "",
      blockedProviders: ["groq"],
    } as any);

    const result = explainRoutingSelection(
      {},
      "local",
      { policyApplied: false },
    );
    expect(result).not.toContain("policy filtering");
  });
});

// ---------------------------------------------------------------------------
// getPolicyReasonExplanation — line 168: policyReason is falsy → undefined
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — policyReason (line 168)", () => {
  it("returns policyReason explanation when policyReason is set", () => {
    const result = explainRoutingSelection(
      {},
      "groq",
      { policyReason: "Rate limit threshold reached." },
    );
    expect(result).toContain("Rate limit threshold reached.");
    expect(result).toContain("groq");
  });

  it("does NOT return policyReason explanation when policyReason is empty string (line 168)", () => {
    const result = explainRoutingSelection(
      {},
      "groq",
      { policyReason: "" },
    );
    // Empty policyReason is falsy → returns undefined from getPolicyReasonExplanation
    expect(result).not.toContain("Rate limit");
  });

  it("does NOT return policyReason explanation when policyReason is undefined (line 168)", () => {
    const result = explainRoutingSelection(
      {},
      "groq",
      { policyReason: undefined },
    );
    expect(result).not.toContain(". undefined");
  });
});

// ---------------------------------------------------------------------------
// getIntentBasedExplanation — various intent paths
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — intent-based explanations", () => {
  it("returns research explanation for intent=research + provider=perplexity", () => {
    const result = explainRoutingSelection({ intent: "research" }, "perplexity");
    expect(result).toContain("research");
    expect(result).toContain("Perplexity");
  });

  it("returns summarization explanation for intent=summarization + provider=gemini", () => {
    const result = explainRoutingSelection({ intent: "summarization" }, "gemini");
    expect(result).toContain("summarization");
    expect(result).toContain("Gemini");
  });

  it("returns coding explanation for intent=coding + provider=groq", () => {
    const result = explainRoutingSelection({ intent: "coding" }, "groq");
    expect(result).toContain("coding");
    expect(result).toContain("Groq");
  });

  it("returns architecture explanation for intent=architecture + provider=openai", () => {
    const result = explainRoutingSelection({ intent: "architecture" }, "openai");
    expect(result).toContain("architecture");
    expect(result).toContain("OpenAI");
  });
});

// ---------------------------------------------------------------------------
// getUnavailableProvidersExplanation — when unavailableProviders has entries
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — unavailableProviders explanation", () => {
  it("returns unavailable-providers explanation when higher priority providers were skipped", () => {
    const result = explainRoutingSelection(
      {},
      "local",
      { unavailableProviders: ["groq", "gemini"] },
    );
    expect(result).toContain("unavailable");
    expect(result).toContain("groq");
    expect(result).toContain("gemini");
  });
});

// ---------------------------------------------------------------------------
// getDefaultLocalExplanation — provider=local, no other reason matches
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — default local explanation", () => {
  it("returns default local explanation when provider=local and no other condition matches", () => {
    const result = explainRoutingSelection({}, "local");
    // Should fall through to getDefaultLocalExplanation
    expect(result).toContain("local");
  });
});

// ---------------------------------------------------------------------------
// Default routing priority — fallback return value
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — default routing priority", () => {
  it("returns 'Selected <provider> by default routing priority' when no explanation matches", () => {
    // No constraints, no context flags, provider is not "local", intent doesn't match
    const result = explainRoutingSelection({}, "groq");
    // With no matching conditions, falls to the final default
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a non-empty string for any provider", () => {
    for (const provider of ["groq", "gemini", "openai", "perplexity", "local"]) {
      const result = explainRoutingSelection({}, provider);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// No context argument (default = {}) — line 192 default parameter
// ---------------------------------------------------------------------------
describe("explainRoutingSelection — omitted context argument", () => {
  it("works when context argument is omitted entirely", () => {
    const result = explainRoutingSelection({ intent: "coding" }, "groq");
    expect(typeof result).toBe("string");
  });
});
