import { getProviderStatus, resetProviderStatus } from "../src/llm/status.js";
import { loadDashboardSurface } from './dashboard-loader.js';
import {
  markProviderFromError,
  resetProviderHealth,
} from "../src/llm/provider-health.js";
import {
  ProviderQuotaError,
  ProviderAuthError,
  ProviderTimeoutError,
} from "../src/shared/errors/index.js";

describe("Sprint 22 smoke tests — provider status", () => {
  beforeEach(() => {
    resetProviderHealth();
  });

  it("getProviderStatus returns a row for each known provider", () => {
    const rows = getProviderStatus();
    expect(rows.length).toBe(5);
    const names = rows.map((r) => r.name);
    expect(names).toContain("groq");
    expect(names).toContain("gemini");
    expect(names).toContain("openai");
    expect(names).toContain("perplexity");
    expect(names).toContain("local");
  });

  it("local provider always has hasKey true", () => {
    const rows = getProviderStatus();
    const local = rows.find((r) => r.name === "local");
    expect(local.hasKey).toBe(true);
  });

  it("state is unknown for healthy provider with no error history", () => {
    const rows = getProviderStatus();
    const groq = rows.find((r) => r.name === "groq");
    expect(groq.state).toBe("unknown");
  });

  it("state reflects exhausted after ProviderQuotaError", () => {
    markProviderFromError("groq", new ProviderQuotaError("quota exceeded"));
    const rows = getProviderStatus();
    const groq = rows.find((r) => r.name === "groq");
    expect(groq.state).toBe("exhausted");
    expect(groq.available).toBe(false);
  });

  it("state reflects auth_error after ProviderAuthError", () => {
    markProviderFromError("openai", new ProviderAuthError("bad key"));
    const rows = getProviderStatus();
    const openai = rows.find((r) => r.name === "openai");
    expect(openai.state).toBe("auth_error");
    expect(openai.available).toBe(false);
  });

  it("state reflects temporarily_down after ProviderTimeoutError", () => {
    markProviderFromError("gemini", new ProviderTimeoutError("timed out"));
    const rows = getProviderStatus();
    const gemini = rows.find((r) => r.name === "gemini");
    expect(gemini.state).toBe("temporarily_down");
    expect(gemini.available).toBe(false);
  });

  it("resetProviderStatus clears all health state", () => {
    markProviderFromError("groq", new ProviderQuotaError("quota"));
    markProviderFromError("openai", new ProviderAuthError("auth"));
    resetProviderStatus();
    const rows = getProviderStatus();
    const groq = rows.find((r) => r.name === "groq");
    expect(groq.state).toBe("unknown");
  });

  it("resetProviderStatus clears single provider only", () => {
    markProviderFromError("groq", new ProviderQuotaError("quota"));
    markProviderFromError("openai", new ProviderAuthError("auth"));
    resetProviderStatus("groq");
    const rows = getProviderStatus();
    const groq = rows.find((r) => r.name === "groq");
    const openai = rows.find((r) => r.name === "openai");
    expect(groq.state).toBe("unknown");
    expect(openai.state).toBe("auth_error");
  });

  it("recoversInMinutes is null for auth_error state", () => {
    markProviderFromError("openai", new ProviderAuthError("bad key"));
    const rows = getProviderStatus();
    const openai = rows.find((r) => r.name === "openai");
    expect(openai.recoversInMinutes).toBeNull();
  });

  it("recoversInMinutes is a positive number for temporarily_down state", () => {
    markProviderFromError("gemini", new ProviderTimeoutError("timeout"));
    const rows = getProviderStatus();
    const gemini = rows.find((r) => r.name === "gemini");
    expect(gemini.recoversInMinutes).toBeGreaterThan(0);
  });
});
