import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Gateway } from "../../src/llm/gateway.js";
import { resetProviderHealth } from "../../src/llm/provider-health.js";
import { resetProviderUsage } from "../../src/llm/provider-usage.js";
import { resetRoutingHistory } from "../../src/llm/routing-history.js";

// ---------------------------------------------------------------------------
// Module-level mocks (copied and adapted from gateway-mistake-context.test.ts)
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

// NEW mock — ExperienceDb returns empty rubric rules for isolation
vi.mock("../../src/llm/experience-db.js", () => {
  const ExperienceDb = vi.fn(function () {
    return {
      listRubricRules: vi.fn().mockResolvedValue([]),
    };
  });
  return { ExperienceDb };
});

// Mock the qdrant client (note .js path used in tests)
vi.mock("../../src/llm/qdrant-client.js", () => ({
  queryTopK: vi.fn(),
}));

import { buildRequestContextPrompt } from "../../src/memory/request-context.js";
import { ExperienceDb } from "../../src/llm/experience-db.js";
import { queryTopK } from "../../src/llm/qdrant-client.js";

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

let originalRagEnv: string | undefined = undefined;

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

  originalRagEnv = process.env.GATEWAY_RAG_ENABLED;
});

afterEach(() => {
  vi.clearAllMocks();
  resetProviderHealth();
  resetProviderUsage();
  resetRoutingHistory();
  if (originalRagEnv === undefined) {
    delete process.env.GATEWAY_RAG_ENABLED;
  } else {
    process.env.GATEWAY_RAG_ENABLED = originalRagEnv;
  }
});

describe("Gateway RAG context injection", () => {
  it("injects RAG chunks when enabled", async () => {
    process.env.GATEWAY_RAG_ENABLED = "true";
    vi.mocked(queryTopK).mockResolvedValue([
      { text: "relevant chunk A", score: 0.9 },
      { text: "relevant chunk B", score: 0.7 },
    ]);

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({
      providers: { local: localAdapter },
      defaultOrder: ["local"],
    });

    await gw.ask(makeRequest({ workspaceId: "ws-rag", prompt: "Explain X" }));

    const sentPrompt = localAdapter.ask.mock.calls[0][0].prompt;
    expect(sentPrompt).toContain("relevant chunk A");
    expect(sentPrompt).toContain("relevant chunk B");
  });

  it("does not call queryTopK when flag unset", async () => {
    delete process.env.GATEWAY_RAG_ENABLED;
    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({
      providers: { local: localAdapter },
      defaultOrder: ["local"],
    });

    await gw.ask(
      makeRequest({ workspaceId: "ws-no-flag", prompt: "Explain X" }),
    );

    expect(vi.mocked(queryTopK)).not.toHaveBeenCalled();
    const sentPrompt = localAdapter.ask.mock.calls[0][0].prompt;
    expect(sentPrompt).not.toContain("Relevant context:");
  });

  it("does not append empty Relevant context block when queryTopK returns []", async () => {
    process.env.GATEWAY_RAG_ENABLED = "true";
    vi.mocked(queryTopK).mockResolvedValue([]);

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({
      providers: { local: localAdapter },
      defaultOrder: ["local"],
    });

    await gw.ask(makeRequest({ workspaceId: "ws-empty", prompt: "Explain X" }));

    const sentPrompt = localAdapter.ask.mock.calls[0][0].prompt;
    expect(sentPrompt).not.toContain("Relevant context:");
  });

  it("handles queryTopK rejection non-fatally", async () => {
    process.env.GATEWAY_RAG_ENABLED = "true";
    vi.mocked(queryTopK).mockRejectedValue(new Error("qdrant down"));

    const localAdapter = makeLocalAdapter();
    const gw = new Gateway({
      providers: { local: localAdapter },
      defaultOrder: ["local"],
    });

    const res = await gw.ask(
      makeRequest({ workspaceId: "ws-error", prompt: "Explain X" }),
    );
    // ask should still resolve successfully
    expect(res.outputText).toBe("Local response");

    const sentPrompt = localAdapter.ask.mock.calls[0][0].prompt;
    expect(sentPrompt).not.toContain("Relevant context:");
  });
});
