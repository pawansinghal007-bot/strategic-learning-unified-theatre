import {
  providerRequestSchema,
  providerResponseSchema,
  providerHealthSchema,
  tokenChunkSchema,
} from "../src/shared/schemas/provider.schema.js";
import {
  DomainError,
  ProviderQuotaError,
  RoutingNoProviderError,
  MemoryNotFoundError,
  ValidationFailedError,
} from "../src/shared/errors/index.js";
import { describe, it, expect } from "vitest";

describe("Sprint 18 smoke tests", () => {
  it("providerRequestSchema validates a minimal request", () => {
    const result = providerRequestSchema.safeParse({
      requestId: "r1",
      prompt: "hello",
    });
    expect(result.success).toBe(true);
  });

  it("providerRequestSchema rejects empty prompt", () => {
    const result = providerRequestSchema.safeParse({
      requestId: "r1",
      prompt: "",
    });
    expect(result.success).toBe(false);
  });

  it("providerResponseSchema validates a minimal response", () => {
    const result = providerResponseSchema.safeParse({
      requestId: "r1",
      provider: "openai",
      model: "gpt-4",
      outputText: "hello",
    });
    expect(result.success).toBe(true);
  });

  it("providerHealthSchema validates a health check", () => {
    const result = providerHealthSchema.safeParse({
      provider: "openai",
      available: true,
      status: "healthy",
    });
    expect(result.success).toBe(true);
  });

  it("tokenChunkSchema validates a token chunk", () => {
    const result = tokenChunkSchema.safeParse({
      requestId: "r1",
      provider: "openai",
      delta: "hello",
    });
    expect(result.success).toBe(true);
  });

  it("DomainError subclasses carry correct codes", () => {
    expect(new ProviderQuotaError().code).toBe("PROVIDER_QUOTA_EXCEEDED");
    expect(new RoutingNoProviderError().code).toBe("ROUTING_NO_PROVIDER");
    expect(new MemoryNotFoundError().code).toBe("MEMORY_NOT_FOUND");
    expect(new ValidationFailedError().code).toBe("VALIDATION_FAILED");
  });

  it("retryable flag is set correctly", () => {
    expect(new ProviderQuotaError().retryable).toBe(true);
    expect(new RoutingNoProviderError().retryable).toBe(false);
  });

  it("DomainError details are preserved", () => {
    const details = { provider: "openai", status: "rate_limited" };
    const err = new ProviderQuotaError("custom message", details);
    expect(err.details).toEqual(details);
    expect(err.message).toBe("custom message");
  });
});
