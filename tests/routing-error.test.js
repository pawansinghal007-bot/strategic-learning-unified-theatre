import { RoutingNoProviderError, RoutingPolicyBlockedError } from "../src/shared/errors/routing.error.js";

describe("Routing Errors", () => {
  describe("RoutingNoProviderError", () => {
    it("creates error with default message", () => {
      const err = new RoutingNoProviderError();

      expect(err.code).toBe("ROUTING_NO_PROVIDER");
      expect(err.message).toBe("No eligible provider found");
      expect(err.retryable).toBe(false);
      expect(err.details).toBeUndefined();
    });

    it("creates error with custom message", () => {
      const err = new RoutingNoProviderError("Custom message");

      expect(err.message).toBe("Custom message");
    });

    it("creates error with details", () => {
      const err = new RoutingNoProviderError("Custom message", { key: "value" });

      expect(err.details).toEqual({ key: "value" });
    });
  });

  describe("RoutingPolicyBlockedError", () => {
    it("creates error with default message", () => {
      const err = new RoutingPolicyBlockedError();

      expect(err.code).toBe("ROUTING_POLICY_BLOCKED");
      expect(err.message).toBe("Routing blocked by policy");
      expect(err.retryable).toBe(false);
      expect(err.details).toBeUndefined();
    });

    it("creates error with custom message", () => {
      const err = new RoutingPolicyBlockedError("Custom blocked message");

      expect(err.message).toBe("Custom blocked message");
    });

    it("creates error with details", () => {
      const err = new RoutingPolicyBlockedError("Custom message", { policy: "block-all" });

      expect(err.details).toEqual({ policy: "block-all" });
    });
  });
});
