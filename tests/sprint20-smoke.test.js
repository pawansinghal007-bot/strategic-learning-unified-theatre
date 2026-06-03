import { Gateway } from "../src/llm/gateway.js";
import { LocalProviderAdapter } from "../src/llm/providers/local.js";
import { BaseProviderAdapter } from "../src/llm/providers/base.js";
import { normalizeProviderError } from "../src/shared/errors/provider-map.js";
import {
  RoutingNoProviderError,
  ValidationFailedError,
} from "../src/shared/errors/index.js";

describe("Sprint 20 smoke tests", () => {
  let gateway;

  beforeEach(() => {
    gateway = new Gateway();
  });

  it("gateway.ask() falls back to local when cloud providers lack API keys", async () => {
    const response = await gateway.ask({
      requestId: "smoke-20-1",
      prompt: "fallback test",
      constraints: {
        excludedProviders: ["groq", "gemini", "openai", "perplexity"],
      },
    });
    expect(response.provider).toBe("local");
    expect(response.outputText).toContain("fallback test");
  });

  it("gateway.ask() routes to local when privacyMode is local-only", async () => {
    const response = await gateway.ask({
      requestId: "smoke-20-2",
      prompt: "private test",
      constraints: { privacyMode: "local-only" },
    });
    expect(response.provider).toBe("local");
  });

  it("gateway.ask() throws RoutingNoProviderError when all candidates excluded", async () => {
    await expect(
      gateway.ask({
        requestId: "smoke-20-3",
        prompt: "no provider",
        constraints: {
          excludedProviders: [
            "groq",
            "gemini",
            "openai",
            "perplexity",
            "local",
          ],
        },
      }),
    ).rejects.toThrow(RoutingNoProviderError);
  });

  it("gateway.ask() throws ValidationFailedError on empty prompt", async () => {
    await expect(
      gateway.ask({ requestId: "smoke-20-4", prompt: "" }),
    ).rejects.toThrow(ValidationFailedError);
  });

  it("gateway.stream() yields chunks from local provider", async () => {
    const chunks = [];
    for await (const chunk of gateway.stream({
      requestId: "smoke-20-5",
      prompt: "stream test",
      constraints: { preferredProvider: "local" },
    })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].provider).toBe("local");
    expect(chunks[0].delta).toContain("stream test");
  });

  it("LocalProviderAdapter extends BaseProviderAdapter", () => {
    const adapter = new LocalProviderAdapter();
    expect(adapter).toBeInstanceOf(BaseProviderAdapter);
  });

  it("normalizeProviderError maps 401 to ProviderAuthError", () => {
    const err = normalizeProviderError("openai", new Error("401 unauthorized"));
    expect(err.constructor.name).toBe("ProviderAuthError");
  });

  it("normalizeProviderError maps 429 to ProviderQuotaError", () => {
    const err = normalizeProviderError(
      "groq",
      new Error("429 rate limit exceeded"),
    );
    expect(err.constructor.name).toBe("ProviderQuotaError");
  });

  it("normalizeProviderError maps timeout to ProviderTimeoutError", () => {
    const err = normalizeProviderError(
      "gemini",
      new Error("request timed out"),
    );
    expect(err.constructor.name).toBe("ProviderTimeoutError");
  });

  it("normalizeProviderError maps 503 to ProviderUnavailableError", () => {
    const err = normalizeProviderError(
      "perplexity",
      new Error("503 service unavailable"),
    );
    expect(err.constructor.name).toBe("ProviderUnavailableError");
  });
});
