import { Gateway } from "../src/llm/gateway";
import { LocalProviderAdapter } from "../src/llm/providers/local";
import { logger } from "../src/shared/logging/logger";
import {
  RoutingNoProviderError,
  ValidationFailedError,
} from "../src/shared/errors";

describe("Sprint 19 smoke tests", () => {
  let gateway: Gateway;

  beforeEach(() => {
    gateway = new Gateway();
  });

  it("gateway.ask() returns a valid response for a minimal request", async () => {
    const response = await gateway.ask({
      requestId: "smoke-1",
      prompt: "hello world",
    });
    expect(response.requestId).toBe("smoke-1");
    expect(response.provider).toBe("local");
    expect(response.outputText).toContain("hello world");
    expect(response.model).toBe("local-dev-stub");
  });

  it("gateway.ask() throws ValidationFailedError on empty prompt", async () => {
    await expect(
      gateway.ask({ requestId: "smoke-2", prompt: "" }),
    ).rejects.toThrow(ValidationFailedError);
  });

  it("gateway.ask() routes to local when privacyMode is local-only", async () => {
    const response = await gateway.ask({
      requestId: "smoke-3",
      prompt: "private request",
      constraints: { privacyMode: "local-only" },
    });
    expect(response.provider).toBe("local");
  });

  it("gateway.ask() throws RoutingNoProviderError when all candidates excluded", async () => {
    const g = new Gateway({ defaultOrder: ["local"] });
    await expect(
      g.ask({
        requestId: "smoke-4",
        prompt: "test",
        constraints: { excludedProviders: ["local"] },
      }),
    ).rejects.toThrow(RoutingNoProviderError);
  });

  it("LocalProviderAdapter.health() returns healthy status", async () => {
    const adapter = new LocalProviderAdapter();
    const health = await adapter.health();
    expect(health.available).toBe(true);
    expect(health.status).toBe("healthy");
  });

  it("LocalProviderAdapter.capabilities() includes chat and offline", () => {
    const adapter = new LocalProviderAdapter();
    const caps = adapter.capabilities();
    expect(caps).toContain("chat");
    expect(caps).toContain("offline");
  });

  it("logger emits without throwing", () => {
    expect(() => logger.info("test", { key: "value" })).not.toThrow();
    expect(() => logger.warn("test warn")).not.toThrow();
    expect(() => logger.error("test error")).not.toThrow();
  });
});
