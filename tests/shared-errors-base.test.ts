/**
 * tests/shared-errors-base.test.ts
 *
 * Coverage target: src/shared/errors/base.ts
 * Tests the DomainError base class
 */

import { describe, expect, it } from "vitest";
import { DomainError } from "../src/shared/errors/base";

describe("DomainError", () => {
  describe("when options is undefined", () => {
    it("creates error with default retryable=false and no details", () => {
      const error = new DomainError("UNKNOWN_ERROR", "Test error message");

      expect(error.code).toBe("UNKNOWN_ERROR");
      expect(error.message).toBe("Test error message");
      expect(error.retryable).toBe(false);
      expect(error.details).toBeUndefined();
      expect(error.name).toBe("DomainError");
    });
  });

  describe("when options is provided with retryable=true", () => {
    it("creates error with retryable=true and no details", () => {
      const error = new DomainError(
        "PROVIDER_TIMEOUT",
        "Request timed out",
        { retryable: true }
      );

      expect(error.code).toBe("PROVIDER_TIMEOUT");
      expect(error.message).toBe("Request timed out");
      expect(error.retryable).toBe(true);
      expect(error.details).toBeUndefined();
    });
  });

  describe("when options is provided with details", () => {
    it("creates error with retryable=false and details", () => {
      const details = { provider: "openai", model: "gpt-4" };
      const error = new DomainError(
        "PROVIDER_BAD_RESPONSE",
        "Invalid response from provider",
        { retryable: false, details }
      );

      expect(error.code).toBe("PROVIDER_BAD_RESPONSE");
      expect(error.message).toBe("Invalid response from provider");
      expect(error.retryable).toBe(false);
      expect(error.details).toEqual(details);
    });
  });

  describe("when options is provided with only details (no retryable)", () => {
    it("creates error with default retryable=false and details", () => {
      const details = { statusCode: 500 };
      const error = new DomainError(
        "PROVIDER_UNAVAILABLE",
        "Provider unavailable",
        { details }
      );

      expect(error.code).toBe("PROVIDER_UNAVAILABLE");
      expect(error.message).toBe("Provider unavailable");
      expect(error.retryable).toBe(false);
      expect(error.details).toEqual(details);
    });
  });
});
