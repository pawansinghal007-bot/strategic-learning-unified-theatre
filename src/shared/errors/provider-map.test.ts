import {
  ProviderAuthError,
  ProviderBadResponseError,
  ProviderQuotaError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "./provider.error";
import { normalizeProviderError } from "./provider-map";

describe("normalizeProviderError", () => {
  const provider = "test-provider";

  describe("when error is ProviderAuthError", () => {
    it("returns ProviderAuthError for 401 errors", () => {
      const error = new Error("401 Unauthorized");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderAuthError);
      expect(result.message).toBe("test-provider: 401 Unauthorized");
    });

    it("returns ProviderAuthError for unauthorized errors", () => {
      const error = new Error("unauthorized access");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderAuthError);
    });

    it("returns ProviderAuthError for invalid api key errors", () => {
      const error = new Error("invalid api key");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderAuthError);
    });

    it("returns ProviderAuthError for auth-related errors", () => {
      const error = new Error("authentication failed");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderAuthError);
    });
  });

  describe("when error is ProviderQuotaError", () => {
    it("returns ProviderQuotaError for 429 errors", () => {
      const error = new Error("429 Too Many Requests");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderQuotaError);
    });

    it("returns ProviderQuotaError for quota exceeded errors", () => {
      const error = new Error("quota exceeded");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderQuotaError);
    });

    it("returns ProviderQuotaError for rate limit errors", () => {
      const error = new Error("rate limit exceeded");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderQuotaError);
    });

    it("returns ProviderQuotaError for credit errors", () => {
      const error = new Error("credit limit reached");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderQuotaError);
    });
  });

  describe("when error is ProviderTimeoutError", () => {
    it("returns ProviderTimeoutError for timeout errors", () => {
      const error = new Error("timeout");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderTimeoutError);
    });

    it("returns ProviderTimeoutError for timed out errors", () => {
      const error = new Error("request timed out");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderTimeoutError);
    });

    it("returns ProviderTimeoutError for abort errors", () => {
      const error = new Error("abort");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderTimeoutError);
    });
  });

  describe("when error is ProviderUnavailableError", () => {
    it("returns ProviderUnavailableError for 503 errors", () => {
      const error = new Error("503 Service Unavailable");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderUnavailableError);
    });

    it("returns ProviderUnavailableError for 502 errors", () => {
      const error = new Error("502 Bad Gateway");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderUnavailableError);
    });

    it("returns ProviderUnavailableError for 500 errors", () => {
      const error = new Error("500 Internal Server Error");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderUnavailableError);
    });

    it("returns ProviderUnavailableError for network errors", () => {
      const error = new Error("network error");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderUnavailableError);
    });

    it("returns ProviderUnavailableError for unavailable errors", () => {
      const error = new Error("service unavailable");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderUnavailableError);
    });
  });

  describe("when error does not match any pattern", () => {
    it("returns ProviderBadResponseError for unknown errors", () => {
      const error = new Error("some other error");
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderBadResponseError);
    });

    it("returns ProviderBadResponseError for non-Error objects", () => {
      const error = "some other error";
      const result = normalizeProviderError(provider, error);
      expect(result).toBeInstanceOf(ProviderBadResponseError);
    });
  });
});
