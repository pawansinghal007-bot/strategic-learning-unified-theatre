/**
 * tests/shared-errors-barrel.test.js
 *
 * Coverage target: src/shared/errors/index.ts (currently 0%)
 * Tests barrel export of shared error modules
 */

import { describe, expect, it } from "vitest";

describe("Shared errors barrel export", () => {
  it("exports DomainError", async () => {
    const { DomainError } = await import("../src/shared/errors/index.ts");
    expect(DomainError).toBeDefined();
    expect(typeof DomainError).toBe("function");
  });

  it("exports RoutingNoProviderError", async () => {
    const { RoutingNoProviderError } =
      await import("../src/shared/errors/index.ts");
    expect(RoutingNoProviderError).toBeDefined();
    expect(typeof RoutingNoProviderError).toBe("function");
  });

  it("exports ValidationFailedError", async () => {
    const { ValidationFailedError } =
      await import("../src/shared/errors/index.ts");
    expect(ValidationFailedError).toBeDefined();
    expect(typeof ValidationFailedError).toBe("function");
  });

  it("exports MemoryNotFoundError", async () => {
    const { MemoryNotFoundError } =
      await import("../src/shared/errors/index.ts");
    expect(MemoryNotFoundError).toBeDefined();
    expect(typeof MemoryNotFoundError).toBe("function");
  });

  it("exports MemorySerializationError", async () => {
    const { MemorySerializationError } =
      await import("../src/shared/errors/index.ts");
    expect(MemorySerializationError).toBeDefined();
    expect(typeof MemorySerializationError).toBe("function");
  });

  it("exports ProviderQuotaError", async () => {
    const { ProviderQuotaError } =
      await import("../src/shared/errors/index.ts");
    expect(ProviderQuotaError).toBeDefined();
    expect(typeof ProviderQuotaError).toBe("function");
  });

  it("exports ProviderAuthError", async () => {
    const { ProviderAuthError } = await import("../src/shared/errors/index.ts");
    expect(ProviderAuthError).toBeDefined();
    expect(typeof ProviderAuthError).toBe("function");
  });

  it("exports ProviderTimeoutError", async () => {
    const { ProviderTimeoutError } =
      await import("../src/shared/errors/index.ts");
    expect(ProviderTimeoutError).toBeDefined();
    expect(typeof ProviderTimeoutError).toBe("function");
  });

  it("exports ProviderUnavailableError", async () => {
    const { ProviderUnavailableError } =
      await import("../src/shared/errors/index.ts");
    expect(ProviderUnavailableError).toBeDefined();
    expect(typeof ProviderUnavailableError).toBe("function");
  });

  it("exports ProviderBadResponseError", async () => {
    const { ProviderBadResponseError } =
      await import("../src/shared/errors/index.ts");
    expect(ProviderBadResponseError).toBeDefined();
    expect(typeof ProviderBadResponseError).toBe("function");
  });

  it("exports normalizeProviderError function", async () => {
    const { normalizeProviderError } =
      await import("../src/shared/errors/index.ts");
    expect(normalizeProviderError).toBeDefined();
    expect(typeof normalizeProviderError).toBe("function");
  });
});
