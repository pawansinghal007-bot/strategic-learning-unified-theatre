/**
 * tests/policies/provider-policy-coverage.test.ts
 *
 * Targets every uncovered line in src/policies/provider-policy.ts:
 *
 *   line 64   — sanitizePolicy: cloud mode with empty allowedProviders → restores defaults
 *   line 74   — sanitizePolicy: hybrid mode with empty allowedProviders → fills ALL_PROVIDERS
 *   line 128  — policyReducer SET_ROUTING_MODE cloud: manualProvider==="local" → null
 *   line 153  — policyReducer BLOCK_PROVIDER: manualProvider === blocked provider → null
 *   lines 162-170 — policyReducer APPLY_PRESET case
 *   lines 201-202 — selectCandidates: sensitive forceLocal → return ["local"]
 *   line 232  — selectPolicyExplanation: approvedProvidersOnly restriction message
 *   lines 246-247 — selectPolicyExplanation: manualProvider message
 *   line 289  — blockProvider: unknown provider throws
 *   line 297  — allowProvider: unknown provider throws
 *   line 306  — setManualProvider: unknown provider throws
 *   line 317  — setManualProvider: blocked provider throws
 *   lines 364-387 — applyPolicyToCandidatesForWorkspace +
 *                   applyPolicyToCandidatesWithReasonForWorkspace
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  policyReducer,
  selectCandidates,
  selectPolicyExplanation,
  initPolicy,
  getState,
  resetProviderPolicy,
  blockProvider,
  allowProvider,
  setManualProvider,
  setRoutingMode,
  applyPolicyPreset,
  applyPolicyToCandidates,
  applyPolicyToCandidatesForWorkspace,
  applyPolicyToCandidatesWithReasonForWorkspace,
  applyPolicyToCandidatesWithReason,
  type PolicyState,
} from "../../src/policies/provider-policy";
import {
  setWorkspacePolicyOverride,
  clearWorkspacePolicyOverride,
} from "../../src/policies/workspace-policy";

const ALL = ["groq", "gemini", "openai", "perplexity", "local"] as const;

// Reset policy module state before every test so tests are independent.
beforeEach(() => {
  resetProviderPolicy();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<PolicyState> = {}): PolicyState {
  return {
    routingMode: "cloud",
    allowedProviders: ["groq", "gemini", "openai", "perplexity", "local"],
    blockedProviders: [],
    manualProvider: null,
    activePreset: "default",
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// line 64 — sanitizePolicy: cloud mode + empty allowedProviders → restore defaults
// ---------------------------------------------------------------------------

describe("sanitizePolicy via policyReducer — line 64 (cloud + empty allowedProviders)", () => {
  it("restores default allowedProviders when cloud mode has empty allowed list", () => {
    // Use APPLY_PRESET to set a state where allowedProviders is empty
    // then switch to cloud — sanitizePolicy should fill the defaults.
    const state = makeState({
      routingMode: "cloud",
      allowedProviders: [], // deliberately empty to trigger line 64
    });
    // policyReducer will call sanitizePolicy on the result
    const next = policyReducer(state, {
      type: "SET_ROUTING_MODE",
      mode: "cloud",
    });
    // After sanitization allowedProviders must be non-empty
    expect(next.allowedProviders.length).toBeGreaterThan(0);
  });

  it("sanitizePolicy directly via RESET with cloud + empty allowed list", () => {
    const stateWithEmptyCloud: PolicyState = makeState({
      routingMode: "cloud",
      allowedProviders: [],
    });
    const next = policyReducer(makeState(), {
      type: "RESET",
      defaultState: stateWithEmptyCloud,
    });
    // RESET returns the exact defaultState; sanitizePolicy is called on the
    // result in the next saveProviderPolicy round — confirm the shape is valid
    // by then applying a no-op action.
    const sanitized = policyReducer(next, {
      type: "SET_ROUTING_MODE",
      mode: "cloud",
    });
    expect(sanitized.allowedProviders.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// line 74 — sanitizePolicy: hybrid + empty allowedProviders → fills ALL_PROVIDERS
// ---------------------------------------------------------------------------

describe("sanitizePolicy — line 74 (hybrid + empty allowedProviders)", () => {
  it("fills ALL_PROVIDERS when switching to hybrid with empty allowed list", () => {
    const state = makeState({ allowedProviders: [] });
    const next = policyReducer(state, {
      type: "SET_ROUTING_MODE",
      mode: "hybrid",
    });
    expect(next.routingMode).toBe("hybrid");
    // ALL_PROVIDERS = groq, gemini, openai, perplexity, local
    expect(next.allowedProviders).toContain("local");
    expect(next.allowedProviders.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// line 128 — policyReducer SET_ROUTING_MODE cloud: manualProvider "local" → null
// ---------------------------------------------------------------------------

describe("policyReducer SET_ROUTING_MODE cloud — line 128 (manualProvider=local → null)", () => {
  it("clears manualProvider when switching from hybrid/local-only to cloud", () => {
    // Set up: hybrid mode, manualProvider = "local"
    setRoutingMode("hybrid");
    setManualProvider("local");
    const before = getState();
    expect(before.manualProvider).toBe("local");

    // Switch to cloud — line 128 should null the manualProvider
    setRoutingMode("cloud");
    const after = getState();
    expect(after.routingMode).toBe("cloud");
    expect(after.manualProvider).toBeNull();
  });

  it("via policyReducer directly: switching to cloud nulls local manualProvider", () => {
    const state = makeState({
      routingMode: "hybrid",
      manualProvider: "local",
      allowedProviders: [...ALL],
    });
    const next = policyReducer(state, {
      type: "SET_ROUTING_MODE",
      mode: "cloud",
    });
    expect(next.manualProvider).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// line 153 — policyReducer BLOCK_PROVIDER: manualProvider === provider → null
// ---------------------------------------------------------------------------

describe("policyReducer BLOCK_PROVIDER — line 153 (manualProvider cleared)", () => {
  it("clears manualProvider when the manual provider is blocked", () => {
    setRoutingMode("hybrid");
    setManualProvider("gemini");
    const before = getState();
    expect(before.manualProvider).toBe("gemini");

    blockProvider("gemini");
    const after = getState();
    expect(after.manualProvider).toBeNull();
    expect(after.blockedProviders).toContain("gemini");
  });

  it("via policyReducer directly: blocking manual provider nulls it", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: [...ALL],
      manualProvider: "groq",
    });
    const next = policyReducer(state, {
      type: "BLOCK_PROVIDER",
      provider: "groq",
    });
    expect(next.manualProvider).toBeNull();
    expect(next.blockedProviders).toContain("groq");
  });

  it("does NOT clear manualProvider when a different provider is blocked", () => {
    setRoutingMode("hybrid");
    setManualProvider("openai");
    blockProvider("groq");
    expect(getState().manualProvider).toBe("openai");
  });
});

// ---------------------------------------------------------------------------
// lines 162-170 — policyReducer APPLY_PRESET case
// ---------------------------------------------------------------------------

describe("policyReducer APPLY_PRESET — lines 162-170", () => {
  it("applies a preset object and sets activePreset name", () => {
    const state = makeState();
    const preset = {
      name: "private",
      policy: {
        routingMode: "local-only",
        allowedProviders: ["local"],
        blockedProviders: [],
        manualProvider: "local",
      },
    };
    const next = policyReducer(state, { type: "APPLY_PRESET", preset });
    expect(next.routingMode).toBe("local-only");
    expect(next.allowedProviders).toEqual(["local"]);
    expect(next.activePreset).toBe("private");
    expect(next.manualProvider).toBe("local");
  });

  it("applies a preset with null manualProvider", () => {
    const state = makeState({ manualProvider: "groq" });
    const preset = {
      name: "enterprise",
      policy: {
        routingMode: "hybrid",
        allowedProviders: ["openai", "gemini", "local"],
        blockedProviders: ["groq", "perplexity"],
        manualProvider: null,
      },
    };
    const next = policyReducer(state, { type: "APPLY_PRESET", preset });
    expect(next.activePreset).toBe("enterprise");
    expect(next.manualProvider).toBeNull();
    expect(next.blockedProviders).toContain("groq");
  });

  it("applyPolicyPreset() convenience wrapper uses APPLY_PRESET internally", () => {
    applyPolicyPreset("research");
    const s = getState();
    expect(s.activePreset).toBe("research");
    expect(s.routingMode).toBe("cloud");
    expect(s.manualProvider).toBe("perplexity");
  });

  it("preset missing optional policy fields falls back to defaults via ??", () => {
    const state = makeState();
    const preset = {
      name: "minimal",
      policy: {
        // routingMode, allowedProviders, blockedProviders, manualProvider all missing
      },
    };
    // Should not throw — ?? guards handle missing fields
    expect(() =>
      policyReducer(state, { type: "APPLY_PRESET", preset }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// lines 201-202 — selectCandidates: forceLocal from sensitive task detection
// ---------------------------------------------------------------------------

describe("selectCandidates — line 201-202 (sensitive forceLocal)", () => {
  it("returns ['local'] when prompt contains PII keyword (SSN)", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: [...ALL],
    });
    const result = selectCandidates(state, [...ALL], "My SSN is 000-00-0000");
    expect(result).toEqual(["local"]);
  });

  it("returns ['local'] when prompt contains credential keyword (password)", () => {
    const state = makeState({
      routingMode: "cloud",
      allowedProviders: ["groq", "gemini", "openai", "perplexity"],
    });
    const result = selectCandidates(
      state,
      ["groq", "gemini", "openai", "perplexity"],
      "Please reset the password for this service",
    );
    expect(result).toEqual(["local"]);
  });

  it("returns ['local'] even in cloud mode for forceLocal request", () => {
    const state = makeState({
      routingMode: "cloud",
      allowedProviders: ["groq", "gemini", "openai", "perplexity"],
      blockedProviders: ["local"],
    });
    const result = selectCandidates(
      state,
      ["groq", "gemini", "openai"],
      "api key rotation for the private key",
    );
    // forceLocal overrides everything
    expect(result).toEqual(["local"]);
  });
});

// ---------------------------------------------------------------------------
// line 232 — selectPolicyExplanation: approvedProvidersOnly message
// line 246-247 — selectPolicyExplanation: manualProvider message
// ---------------------------------------------------------------------------

describe("selectPolicyExplanation — restricted providers + manual provider messages", () => {
  it("includes Restricted message for a finance-sensitive prompt (line 232)", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: [...ALL],
    });
    const explanation = selectPolicyExplanation(
      state,
      "Review this invoice for the balance sheet",
    );
    expect(explanation).toContain("Restricted:");
    expect(explanation).toContain("openai");
  });

  it("includes Manual message when manualProvider is set (lines 246-247)", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: [...ALL],
      manualProvider: "openai",
    });
    const explanation = selectPolicyExplanation(state);
    expect(explanation).toContain("Manual: openai");
  });

  it("includes both Restricted and Manual messages when both apply", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: [...ALL],
      manualProvider: "openai",
    });
    const explanation = selectPolicyExplanation(
      state,
      "check the balance sheet compliance",
    );
    expect(explanation).toContain("Restricted:");
    expect(explanation).toContain("Manual: openai");
  });

  it("includes Forced local message for a PII prompt", () => {
    const state = makeState({
      routingMode: "cloud",
      allowedProviders: [...ALL],
    });
    const explanation = selectPolicyExplanation(
      state,
      "Please process my aadhaar number",
    );
    expect(explanation).toContain("Forced local:");
  });

  it("does not include Restricted or Manual when neither applies", () => {
    const state = makeState();
    const explanation = selectPolicyExplanation(state, "explain quicksort");
    expect(explanation).not.toContain("Restricted:");
    expect(explanation).not.toContain("Manual:");
    expect(explanation).not.toContain("Forced local:");
  });
});

// ---------------------------------------------------------------------------
// line 289 — blockProvider: unknown provider throws
// line 297 — allowProvider: unknown provider throws
// ---------------------------------------------------------------------------

describe("blockProvider / allowProvider — unknown provider throws", () => {
  it("blockProvider throws for unknown provider name (line 289)", () => {
    expect(() => blockProvider("unknown-provider")).toThrow(
      "Unknown provider: unknown-provider",
    );
  });

  it("blockProvider throws for empty string", () => {
    expect(() => blockProvider("")).toThrow("Unknown provider: ");
  });

  it("allowProvider throws for unknown provider name (line 297)", () => {
    expect(() => allowProvider("mystery-llm")).toThrow(
      "Unknown provider: mystery-llm",
    );
  });

  it("allowProvider throws for a typo of a valid provider", () => {
    expect(() => allowProvider("Groq")).toThrow("Unknown provider: Groq");
  });
});

// ---------------------------------------------------------------------------
// line 306 — setManualProvider: unknown provider throws
// line 317 — setManualProvider: blocked provider throws
// ---------------------------------------------------------------------------

describe("setManualProvider — error paths", () => {
  it("throws for an unknown provider name (line 306)", () => {
    expect(() => setManualProvider("phantom")).toThrow(
      "Unknown provider: phantom",
    );
  });

  it("throws when trying to set a blocked provider as manual (line 317)", () => {
    setRoutingMode("hybrid");
    blockProvider("gemini");
    expect(() => setManualProvider("gemini")).toThrow(
      "Cannot set manual provider 'gemini': provider is blocked",
    );
  });

  it("accepts null and clears manualProvider", () => {
    setRoutingMode("hybrid");
    setManualProvider("openai");
    expect(getState().manualProvider).toBe("openai");

    setManualProvider(null);
    expect(getState().manualProvider).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// lines 364-387 — applyPolicyToCandidatesForWorkspace +
//                 applyPolicyToCandidatesWithReasonForWorkspace
// ---------------------------------------------------------------------------

describe("applyPolicyToCandidatesForWorkspace (lines 364-373)", () => {
  beforeEach(() => {
    // Ensure no stale workspace overrides from previous tests
    clearWorkspacePolicyOverride("ws-fw-1");
    clearWorkspacePolicyOverride("ws-fw-2");
    clearWorkspacePolicyOverride("ws-fw-local");
  });

  it("uses global policy when no workspace override exists", () => {
    const result = applyPolicyToCandidatesForWorkspace([...ALL], {
      workspaceId: "ws-fw-no-override",
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses workspace policy when override is set", () => {
    setWorkspacePolicyOverride("ws-fw-1", {
      routingMode: "local-only",
    });
    const result = applyPolicyToCandidatesForWorkspace([...ALL], {
      workspaceId: "ws-fw-1",
    });
    expect(result).toEqual(["local"]);
  });

  it("filters candidates by workspace-level blockedProviders", () => {
    setWorkspacePolicyOverride("ws-fw-2", {
      routingMode: "hybrid",
      allowedProviders: [...ALL],
      blockedProviders: ["groq", "perplexity"],
    });
    const result = applyPolicyToCandidatesForWorkspace([...ALL], {
      workspaceId: "ws-fw-2",
    });
    expect(result).not.toContain("groq");
    expect(result).not.toContain("perplexity");
  });

  it("passes a string request through to selectCandidates", () => {
    // String request → prompt extracted from the string itself
    const result = applyPolicyToCandidatesForWorkspace(
      [...ALL],
      "plain string request" as any,
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it("forceLocal overrides workspace policy for sensitive requests", () => {
    setWorkspacePolicyOverride("ws-fw-local", {
      routingMode: "cloud",
      allowedProviders: ["openai", "gemini"],
    });
    const result = applyPolicyToCandidatesForWorkspace([...ALL], {
      workspaceId: "ws-fw-local",
      prompt: "My SSN is 000-11-2222",
    });
    expect(result).toEqual(["local"]);
  });
});

describe("applyPolicyToCandidatesWithReasonForWorkspace (lines 374-387)", () => {
  beforeEach(() => {
    clearWorkspacePolicyOverride("ws-rw-1");
    clearWorkspacePolicyOverride("ws-rw-2");
  });

  it("returns candidates and policyReason with global source", () => {
    const result = applyPolicyToCandidatesWithReasonForWorkspace([...ALL], {
      workspaceId: "ws-rw-no-override",
    });
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(typeof result.policyReason).toBe("string");
    expect(result.policySource).toBe("global");
  });

  it("policyReason includes 'Workspace override' label when workspace source", () => {
    setWorkspacePolicyOverride("ws-rw-1", { routingMode: "hybrid" });
    const result = applyPolicyToCandidatesWithReasonForWorkspace([...ALL], {
      workspaceId: "ws-rw-1",
    });
    expect(result.policySource).toBe("workspace");
    expect(result.policyReason).toContain("Workspace override: ws-rw-1");
  });

  it("returns correct candidates from workspace-overridden policy", () => {
    setWorkspacePolicyOverride("ws-rw-2", {
      routingMode: "local-only",
    });
    const result = applyPolicyToCandidatesWithReasonForWorkspace([...ALL], {
      workspaceId: "ws-rw-2",
    });
    expect(result.candidates).toEqual(["local"]);
    expect(result.policySource).toBe("workspace");
  });

  it("policySource is global when no workspaceId is provided in request", () => {
    const result = applyPolicyToCandidatesWithReasonForWorkspace(
      [...ALL],
      { prompt: "explain sorting" }, // no workspaceId
    );
    expect(result.policySource).toBe("global");
    // policyReason must NOT contain 'Workspace override' since workspaceId is undefined
    expect(result.policyReason).not.toContain("Workspace override");
  });
});

// ---------------------------------------------------------------------------
// applyPolicyToCandidatesWithReason — supplemental coverage
// ---------------------------------------------------------------------------

describe("applyPolicyToCandidatesWithReason", () => {
  it("returns candidates array and policyReason string", () => {
    const result = applyPolicyToCandidatesWithReason([...ALL]);
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(typeof result.policyReason).toBe("string");
    expect(result.policyReason).toContain("Mode:");
  });

  it("accepts string request and extracts prompt", () => {
    const result = applyPolicyToCandidatesWithReason(
      [...ALL],
      "explain quicksort",
    );
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("accepts object request with prompt field", () => {
    const result = applyPolicyToCandidatesWithReason([...ALL], {
      prompt: "debug this code",
    });
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// initPolicy + getState
// ---------------------------------------------------------------------------

describe("initPolicy / getState", () => {
  it("initPolicy with explicit state sets that state", () => {
    const custom: PolicyState = makeState({
      routingMode: "local-only",
      allowedProviders: ["local"],
      manualProvider: "local",
      activePreset: "private",
    });
    const initialized = initPolicy(custom);
    expect(initialized.routingMode).toBe("local-only");
    expect(getState().routingMode).toBe("local-only");
  });

  it("initPolicy without argument loads from storage", () => {
    const s = initPolicy();
    expect(s).toBeDefined();
    expect(s.routingMode).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// selectCandidates — manualProvider pinning branch (line 246-247 indirect)
// ---------------------------------------------------------------------------

describe("selectCandidates — manualProvider pinning", () => {
  it("pins manualProvider to front of candidates list", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: [...ALL],
      manualProvider: "gemini",
    });
    const result = selectCandidates(state, [...ALL]);
    expect(result[0]).toBe("gemini");
  });

  it("does not pin when manualProvider is not in filtered candidates", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: ["openai", "local"],
      manualProvider: "groq", // groq not in allowedProviders → filtered out
    });
    const result = selectCandidates(state, [...ALL]);
    // groq is not allowed, so it cannot be pinned
    expect(result).not.toContain("groq");
    // manualProvider gets cleared by sanitizePolicy since it's not in allowed
  });
});
// ---------------------------------------------------------------------------
// BRDA:66,7,0,0 — sanitizePolicy: cloud mode + manualProvider="local" → null
// BRDA:73,10,0,0 — sanitizePolicy: manualProvider not in allowedProviders → null
// BRDA:222,37,1,0 — selectPolicyExplanation: activePreset falsy (false branch)
// ---------------------------------------------------------------------------

describe("sanitizePolicy — inconsistent state via RESET (lines 66, 73)", () => {
  it("clears manualProvider='local' when routingMode is cloud (line 66)", () => {
    // Construct inconsistent state: cloud mode with manualProvider="local"
    // The reducer prevents this, but sanitizePolicy handles corrupt loaded data
    const inconsistentState: PolicyState = {
      routingMode: "cloud",
      allowedProviders: [...ALL],
      blockedProviders: [],
      manualProvider: "local",
      activePreset: "default",
      updatedAt: Date.now(),
    };
    const afterReset = policyReducer(makeState(), {
      type: "RESET",
      defaultState: inconsistentState,
    });
    // RESET returns the raw state without sanitization; use ALLOW_PROVIDER
    // to trigger sanitizePolicy while preserving manualProvider="local"
    const afterSanitize = policyReducer(afterReset, {
      type: "ALLOW_PROVIDER",
      provider: "groq",
    });
    expect(afterSanitize.manualProvider).toBeNull();
  });

  it("clears manualProvider when not in allowedProviders (line 73)", () => {
    // Construct inconsistent state: manualProvider="groq" but groq not in allowed
    const inconsistentState: PolicyState = {
      routingMode: "hybrid",
      allowedProviders: ["gemini", "openai", "local"],
      blockedProviders: [],
      manualProvider: "groq",
      activePreset: "default",
      updatedAt: Date.now(),
    };
    const afterReset = policyReducer(makeState(), {
      type: "RESET",
      defaultState: inconsistentState,
    });
    // Use SET_MANUAL_PROVIDER with the same value to trigger sanitizePolicy
    // without changing manualProvider — sanitizePolicy sees groq not in allowed
    const afterSanitize = policyReducer(afterReset, {
      type: "SET_MANUAL_PROVIDER",
      provider: "groq",
    });
    expect(afterSanitize.manualProvider).toBeNull();
  });

  it("selectPolicyExplanation omits Preset when activePreset is empty (line 222)", () => {
    const state = makeState({ activePreset: "" });
    const explanation = selectPolicyExplanation(state, "explain sorting");
    expect(explanation).toContain("Mode:");
    expect(explanation).not.toContain("Preset:");
  });
});

// ---------------------------------------------------------------------------
// BRDA:137,21,1,0 — ALLOW_PROVIDER: provider already in allowedProviders (false branch)
// BRDA:149,22,1,0 — BLOCK_PROVIDER: provider already in blockedProviders (false branch)
// ---------------------------------------------------------------------------

describe("policyReducer — idempotency guards (lines 137, 149)", () => {
  it("allowing an already-allowed provider does not duplicate (line 137)", () => {
    const state = makeState({
      allowedProviders: ["groq", "gemini", "openai", "perplexity", "local"],
    });
    const afterFirst = policyReducer(state, {
      type: "ALLOW_PROVIDER",
      provider: "groq",
    });
    expect(afterFirst.allowedProviders).toContain("groq");
    const countAfterFirst = afterFirst.allowedProviders.filter(
      (p) => p === "groq",
    ).length;
    expect(countAfterFirst).toBe(1);

    const afterSecond = policyReducer(afterFirst, {
      type: "ALLOW_PROVIDER",
      provider: "groq",
    });
    const countAfterSecond = afterSecond.allowedProviders.filter(
      (p) => p === "groq",
    ).length;
    expect(countAfterSecond).toBe(1);
  });

  it("blocking an already-blocked provider does not duplicate (line 149)", () => {
    const state = makeState({
      blockedProviders: ["groq"],
      allowedProviders: ["gemini", "openai", "perplexity", "local"],
    });
    const afterFirst = policyReducer(state, {
      type: "BLOCK_PROVIDER",
      provider: "groq",
    });
    expect(afterFirst.blockedProviders).toContain("groq");
    const countAfterFirst = afterFirst.blockedProviders.filter(
      (p) => p === "groq",
    ).length;
    expect(countAfterFirst).toBe(1);

    const afterSecond = policyReducer(afterFirst, {
      type: "BLOCK_PROVIDER",
      provider: "groq",
    });
    const countAfterSecond = afterSecond.blockedProviders.filter(
      (p) => p === "groq",
    ).length;
    expect(countAfterSecond).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// BRDA:197,32,1,0 — selectCandidates: typeof request === "string" false branch (object request)
// BRDA:200,34,0,0 — selectCandidates: approvedProvidersOnly true branch
// BRDA:226,39,1,0 — selectPolicyExplanation: typeof request === "string" false branch (object request)
// ---------------------------------------------------------------------------

describe("selectCandidates — object request format (line 197)", () => {
  it("accepts an object request with prompt field instead of string", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: [...ALL],
    });
    const result = selectCandidates(state, [...ALL], {
      prompt: "explain sorting",
    });
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("selectCandidates — approvedProvidersOnly restriction (line 200)", () => {
  it("filters to approvedProvidersOnly when prompt triggers finance rule", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: [...ALL],
    });
    // "balance sheet" triggers the finance rule which sets approvedProvidersOnly to ["openai", "gemini", "local"]
    const result = selectCandidates(
      state,
      [...ALL],
      "Review this balance sheet for discrepancies",
    );
    expect(result).not.toContain("groq");
    expect(result).not.toContain("perplexity");
    // Should only contain openai, gemini, local (or subset)
    result.forEach((p) => {
      expect(["openai", "gemini", "local"]).toContain(p);
    });
  });

  it("filters to approvedProvidersOnly for legal/compliance content", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: [...ALL],
    });
    // "compliance" triggers the legal rule which sets approvedProvidersOnly to ["openai", "local"]
    const result = selectCandidates(
      state,
      [...ALL],
      "Review this compliance document for regulatory issues",
    );
    expect(result).not.toContain("groq");
    expect(result).not.toContain("perplexity");
    expect(result).not.toContain("gemini");
    result.forEach((p) => {
      expect(["openai", "local"]).toContain(p);
    });
  });
});

describe("selectPolicyExplanation — object request format (line 226)", () => {
  it("accepts an object request with prompt field instead of string", () => {
    const state = makeState({
      routingMode: "hybrid",
      allowedProviders: [...ALL],
    });
    const explanation = selectPolicyExplanation(state, {
      prompt: "explain sorting",
    });
    expect(explanation).toContain("Mode:");
  });

  it("detects sensitive task from object request format", () => {
    const state = makeState({
      routingMode: "cloud",
      allowedProviders: [...ALL],
    });
    const explanation = selectPolicyExplanation(state, {
      prompt: "My SSN is 000-00-0000",
    });
    expect(explanation).toContain("Forced local:");
  });
});

// ---------------------------------------------------------------------------
// BRDA:325,53,0,0 — applyPolicyToCandidates: typeof request === "string" true branch
// BRDA:380,56,0,0 — applyPolicyToCandidatesWithReasonForWorkspace: typeof request === "string" true branch
// ---------------------------------------------------------------------------

describe("applyPolicyToCandidates — string request format (line 325)", () => {
  it("accepts a plain string request instead of object", () => {
    const result = applyPolicyToCandidates([...ALL], "explain sorting");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.candidates).toBeDefined();
    expect(result.policyReason).toBeDefined();
  });

  it("detects sensitive task from string request", () => {
    const result = applyPolicyToCandidates([...ALL], "My SSN is 000-00-0000");
    expect(result).toEqual(["local"]);
  });
});

describe("applyPolicyToCandidatesWithReasonForWorkspace — string request (line 380)", () => {
  beforeEach(() => {
    clearWorkspacePolicyOverride("ws-string-req");
  });

  it("accepts a plain string request instead of object", () => {
    const result = applyPolicyToCandidatesWithReasonForWorkspace(
      [...ALL],
      "explain sorting",
    );
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.policySource).toBe("global");
  });

  it("detects sensitive task from string request with workspace", () => {
    const result = applyPolicyToCandidatesWithReasonForWorkspace(
      [...ALL],
      "My SSN is 000-00-0000",
    );
    expect(result.candidates).toEqual(["local"]);
  });
});
