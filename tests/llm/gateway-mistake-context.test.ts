/**
 * Tests that active rubric rules from ExperienceDb are injected into
 * the outgoing prompt via injectContextIntoRequest.
 *
 * Sprint 106 — Closes: V4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Gateway } from "../../src/llm/gateway.js";
import { resetProviderHealth } from "../../src/llm/provider-health.js";
import { resetProviderUsage } from "../../src/llm/provider-usage.js";
import { resetRoutingHistory } from "../../src/llm/routing-history.js";

// ---------------------------------------------------------------------------
// Module-level mocks (copied verbatim from gateway-branch-coverage.test.ts)
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

// NEW mock — ExperienceDb (Sprint 106)
vi.mock("../../src/llm/experience-db.js", () => {
  const ExperienceDb = vi.fn(function () {
    return {
      listRubricRules: vi
        .fn()
        .mockResolvedValue([
          { rule: "Avoid repeating X mistake: Y. Apply this fix: Z." },
        ]),
    };
  });
  return { ExperienceDb };
});

import { buildRequestContextPrompt } from "../../src/memory/request-context.js";
import { ExperienceDb } from "../../src/llm/experience-db.js";

// ---------------------------------------------------------------------------
// Helpers (copied verbatim from gateway-branch-coverage.test.ts)
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
  vi.mocked(buildRequestContextPrompt).mockReturnValue(null);
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
// Rubric context injection
// ============================================================================

describe("Rubric context injection", () => {
  it("appends active rubric rules to the outgoing prompt", async () => {
    vi.mocked(buildRequestContextPrompt).mockReturnValue(null); // isolate rubric behavior

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({
      providers: { local: localAdapter },
      defaultOrder: ["local"],
    });

    await gw.ask(
      makeRequest({ workspaceId: "ws-rubric", prompt: "Fix the bug" }),
    );

    const sentPrompt = localAdapter.ask.mock.calls[0][0].prompt;
    expect(sentPrompt).toContain(
      "Avoid repeating X mistake: Y. Apply this fix: Z.",
    );
  });
});
