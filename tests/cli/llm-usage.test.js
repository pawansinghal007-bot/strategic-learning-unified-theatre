import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const getProviderUsage = vi.fn();
const resetProviderUsage = vi.fn();

vi.mock("../../src/llm/provider-usage", () => ({
  getProviderUsage: (...a) => getProviderUsage(...a),
  resetProviderUsage: (...a) => resetProviderUsage(...a),
}));

import { registerLlmUsage } from "../../src/cli/llm-usage";

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut() {}, writeErr() {} });
  registerLlmUsage(program);
  return program;
}

describe("registerLlmUsage", () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  describe("llm:usage", () => {
    it("omits the reset label when resetAt is null", async () => {
      getProviderUsage.mockReturnValue([
        {
          provider: "groq",
          requestCount: 3,
          successCount: 3,
          failureCount: 0,
          totalTokens: 90,
          estimatedCostUsd: 0,
          resetAt: null,
        },
      ]);

      await makeProgram().parseAsync(["node", "cli", "llm:usage"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("groq");
      expect(output).not.toContain("resets");
    });

    it("includes a formatted reset label when resetAt is set", async () => {
      getProviderUsage.mockReturnValue([
        {
          provider: "openai",
          requestCount: 10,
          successCount: 8,
          failureCount: 2,
          totalTokens: 5000,
          estimatedCostUsd: 1.23456,
          resetAt: "2026-01-01T00:00:00.000Z",
        },
      ]);

      await makeProgram().parseAsync(["node", "cli", "llm:usage"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("resets 2026-01-01T00:00:00.000Z");
      expect(output).toContain("cost=$1.2346");
    });

    it("handles an empty provider list", async () => {
      getProviderUsage.mockReturnValue([]);
      await expect(
        makeProgram().parseAsync(["node", "cli", "llm:usage"]),
      ).resolves.not.toThrow();
    });
  });

  describe("llm:usage:reset", () => {
    it("errors on an unknown provider", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:usage:reset",
        "bogus",
      ]);

      expect(errorSpy).toHaveBeenCalledWith("Unknown provider: bogus");
      expect(process.exitCode).toBe(1);
      expect(resetProviderUsage).not.toHaveBeenCalled();
    });

    it("resets a specific provider's usage", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:usage:reset",
        "perplexity",
      ]);

      expect(resetProviderUsage).toHaveBeenCalledWith("perplexity");
      expect(logSpy).toHaveBeenCalledWith("✅ Reset usage for perplexity");
    });

    it("resets all providers' usage when none is specified", async () => {
      await makeProgram().parseAsync(["node", "cli", "llm:usage:reset"]);

      expect(resetProviderUsage).toHaveBeenCalledWith(undefined);
      expect(logSpy).toHaveBeenCalledWith("✅ Reset usage for all providers");
    });
  });
});
