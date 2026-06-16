import { loadDashboardSurface } from "./dashboard-loader.js";
import {
  markProviderFromError,
  isProviderAvailable,
  getProviderHealthSnapshot,
  resetProviderHealth,
} from "../src/llm/provider-health.js";
import {
  ProviderAuthError,
  ProviderQuotaError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "../src/shared/errors/index.js";
import { Gateway } from "../src/llm/gateway.js";

describe("Sprint 21 smoke tests — provider health", () => {
  beforeEach(() => {
    resetProviderHealth();
  });

  it("isProviderAvailable returns true for unknown provider", () => {
    expect(isProviderAvailable("groq")).toBe(true);
  });

  it("markProviderFromError marks auth_error for ProviderAuthError", () => {
    markProviderFromError("openai", new ProviderAuthError("bad key"));
    expect(isProviderAvailable("openai")).toBe(false);
  });

  it("markProviderFromError marks exhausted for ProviderQuotaError", () => {
    markProviderFromError("groq", new ProviderQuotaError("quota exceeded"));
    expect(isProviderAvailable("groq")).toBe(false);
  });

  it("markProviderFromError marks temporarily_down for ProviderTimeoutError", () => {
    markProviderFromError("gemini", new ProviderTimeoutError("timed out"));
    expect(isProviderAvailable("gemini")).toBe(false);
  });

  it("markProviderFromError marks temporarily_down for ProviderUnavailableError", () => {
    markProviderFromError("perplexity", new ProviderUnavailableError("503"));
    expect(isProviderAvailable("perplexity")).toBe(false);
  });

  it("non-DomainError does not affect health state", () => {
    markProviderFromError("local", new Error("plain error"));
    expect(isProviderAvailable("local")).toBe(true);
  });

  it("getProviderHealthSnapshot returns all marked providers", () => {
    markProviderFromError("groq", new ProviderQuotaError("quota"));
    markProviderFromError("openai", new ProviderAuthError("auth"));
    const snapshot = getProviderHealthSnapshot();
    expect(snapshot.length).toBe(2);
  });

  it("resetProviderHealth clears all health state", () => {
    markProviderFromError("groq", new ProviderQuotaError("quota"));
    resetProviderHealth();
    expect(isProviderAvailable("groq")).toBe(true);
  });

  it("resetProviderHealth clears single provider", () => {
    markProviderFromError("groq", new ProviderQuotaError("quota"));
    markProviderFromError("openai", new ProviderAuthError("auth"));
    resetProviderHealth("groq");
    expect(isProviderAvailable("groq")).toBe(true);
    expect(isProviderAvailable("openai")).toBe(false);
  });
});

describe("Sprint 21 smoke tests — gateway health-aware fallback", () => {
  beforeEach(() => {
    resetProviderHealth();
  });

  it("gateway.ask() falls back to local when cloud providers are marked unhealthy", async () => {
    markProviderFromError("groq", new ProviderQuotaError("quota"));
    markProviderFromError("gemini", new ProviderQuotaError("quota"));
    markProviderFromError("openai", new ProviderQuotaError("quota"));
    markProviderFromError("perplexity", new ProviderQuotaError("quota"));

    const gateway = new Gateway();
    const response = await gateway.ask({
      requestId: "smoke-21-fallback",
      prompt: "fallback to local",
    });
    expect(response.provider).toBe("local");
  });

  it("gateway.ask() routes normally when all providers healthy", async () => {
    const gateway = new Gateway({
      defaultOrder: ["local"],
    });
    const response = await gateway.ask({
      requestId: "smoke-21-healthy",
      prompt: "healthy route",
    });
    expect(response.provider).toBe("local");
  });
});
