import { describe, expect, it, beforeEach, vi } from "vitest";
import { BaseProviderAdapter } from "../../src/llm/providers/base.js";

// Create a concrete implementation for testing the base class
class TestProviderAdapter extends BaseProviderAdapter {
  name = "test";

  capabilities() {
    return ["chat", "code_generation"];
  }

  async execute(req) {
    return {
      model: "test-model",
      outputText: `Test response to: ${req.prompt}`,
      finishReason: "stop",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        estimatedCostUsd: 0.001,
        latencyMs: 100,
      },
      routingReasons: [{ code: "test", message: "Test routing" }],
      raw: { test: true },
    };
  }
}

describe("BaseProviderAdapter", () => {
  let adapter;

  beforeEach(() => {
    adapter = new TestProviderAdapter();
  });

  describe("health()", () => {
    it("returns healthy status with provider name", async () => {
      const health = await adapter.health();
      expect(health).toEqual({
        provider: "test",
        available: true,
        status: "healthy",
        lastCheckedAt: expect.any(String),
        message: "test adapter loaded",
      });
      expect(health.lastCheckedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("stream()", () => {
    it("yields a single chunk with the response", async () => {
      const chunks = [];
      for await (const chunk of adapter.stream({
        requestId: "test-stream-1",
        prompt: "Hello",
      })) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        requestId: "test-stream-1",
        provider: "test",
        delta: expect.any(String),
        done: true,
      });
      expect(chunks[0].delta).toContain("Test response to: Hello");
    });
  });

  describe("ask()", () => {
    it("calls execute and returns formatted response", async () => {
      const response = await adapter.ask({
        requestId: "test-ask-1",
        prompt: "Test prompt",
      });
      expect(response).toEqual({
        requestId: "test-ask-1",
        provider: "test",
        model: "test-model",
        outputText: "Test response to: Test prompt",
        finishReason: "stop",
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          estimatedCostUsd: 0.001,
          latencyMs: 100,
        },
        routingReasons: [{ code: "test", message: "Test routing" }],
        raw: { test: true },
      });
    });

    it("handles missing model in execute result", async () => {
      class MinimalProvider extends BaseProviderAdapter {
        name = "minimal";
        capabilities() {
          return ["chat"];
        }
        async execute(req) {
          return {
            outputText: "Response",
          };
        }
      }
      const minimalAdapter = new MinimalProvider();
      const response = await minimalAdapter.ask({
        requestId: "test-minimal-1",
        prompt: "Test",
      });
      expect(response.model).toBe("minimal-unknown-model");
    });

    it("handles missing outputText in execute result", async () => {
      class MinimalProvider extends BaseProviderAdapter {
        name = "minimal2";
        capabilities() {
          return ["chat"];
        }
        async execute(req) {
          return {
            model: "test",
          };
        }
      }
      const minimalAdapter = new MinimalProvider();
      const response = await minimalAdapter.ask({
        requestId: "test-minimal2-1",
        prompt: "Test",
      });
      expect(response.outputText).toBe("");
    });

    it("handles missing finishReason in execute result", async () => {
      class MinimalProvider extends BaseProviderAdapter {
        name = "minimal3";
        capabilities() {
          return ["chat"];
        }
        async execute(req) {
          return {
            model: "test",
            outputText: "Response",
          };
        }
      }
      const minimalAdapter = new MinimalProvider();
      const response = await minimalAdapter.ask({
        requestId: "test-minimal3-1",
        prompt: "Test",
      });
      expect(response.finishReason).toBe("unknown");
    });

    it("handles errors from execute and normalizes them", async () => {
      class ErrorProvider extends BaseProviderAdapter {
        name = "error";
        capabilities() {
          return ["chat"];
        }
        async execute(req) {
          throw new Error("Execution failed");
        }
      }
      const errorAdapter = new ErrorProvider();
      await expect(
        errorAdapter.ask({
          requestId: "test-error-1",
          prompt: "Test",
        }),
      ).rejects.toThrow("Execution failed");
    });
  });

  describe("capabilities()", () => {
    it("returns the capabilities array", () => {
      const caps = adapter.capabilities();
      expect(caps).toEqual(["chat", "code_generation"]);
    });
  });
});
