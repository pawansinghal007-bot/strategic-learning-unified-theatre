import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const getProviderStatus = vi.fn();
const resetAllProviderTelemetry = vi.fn();
const resetProviderStatus = vi.fn();

vi.mock("../../src/llm/status", () => ({
  getProviderStatus: (...args) => getProviderStatus(...args),
  resetAllProviderTelemetry: (...args) => resetAllProviderTelemetry(...args),
  resetProviderStatus: (...args) => resetProviderStatus(...args),
}));

import { registerLlmHealth } from "../../src/cli/llm-health";

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut() {}, writeErr() {} });
  registerLlmHealth(program);
  return program;
}

describe("registerLlmHealth", () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  describe("llm:health", () => {
    it("renders a key-icon row when the provider has no key", async () => {
      getProviderStatus.mockReturnValue([
        {
          name: "groq",
          hasKey: false,
          available: false,
          state: "no_key",
          recoversInMinutes: null,
          reason: undefined,
          requestCount: 0,
          successCount: 0,
          failureCount: 0,
          totalTokens: 0,
        },
      ]);

      await makeProgram().parseAsync(["node", "cli", "llm:health"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("🔑");
      expect(output).toContain("groq");
      expect(output).not.toContain("recovers in");
      expect(output).not.toContain("—");
    });

    it("renders a check icon, recovery ETA, and reason for an available keyed provider", async () => {
      getProviderStatus.mockReturnValue([
        {
          name: "gemini",
          hasKey: true,
          available: true,
          state: "healthy",
          recoversInMinutes: null,
          reason: undefined,
          requestCount: 5,
          successCount: 5,
          failureCount: 0,
          totalTokens: 100,
        },
      ]);

      await makeProgram().parseAsync(["node", "cli", "llm:health"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("✅");
      expect(output).toContain("req=5 ok=5 fail=0 tokens=100");
    });

    it("renders a cross icon, recovery ETA, and reason for an unavailable keyed provider", async () => {
      getProviderStatus.mockReturnValue([
        {
          name: "openai",
          hasKey: true,
          available: false,
          state: "rate_limited",
          recoversInMinutes: 5,
          reason: "429 from provider",
          requestCount: 2,
          successCount: 1,
          failureCount: 1,
          totalTokens: 50,
        },
      ]);

      await makeProgram().parseAsync(["node", "cli", "llm:health"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("❌");
      expect(output).toContain("(recovers in 5m)");
      expect(output).toContain("— 429 from provider");
    });

    it("handles an empty provider list without throwing", async () => {
      getProviderStatus.mockReturnValue([]);
      await expect(
        makeProgram().parseAsync(["node", "cli", "llm:health"]),
      ).resolves.not.toThrow();
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe("llm:health:reset", () => {
    it("errors on an unknown provider", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:health:reset",
        "bogus",
      ]);

      expect(errorSpy).toHaveBeenCalledWith("Unknown provider: bogus");
      expect(process.exitCode).toBe(1);
      expect(resetProviderStatus).not.toHaveBeenCalled();
    });

    it("resets only health by default for a specific provider", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:health:reset",
        "groq",
      ]);

      expect(resetProviderStatus).toHaveBeenCalledWith("groq");
      expect(resetAllProviderTelemetry).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith("✅ Reset health for groq");
    });

    it("resets health for all providers when none is specified", async () => {
      await makeProgram().parseAsync(["node", "cli", "llm:health:reset"]);

      expect(resetProviderStatus).toHaveBeenCalledWith(undefined);
      expect(logSpy).toHaveBeenCalledWith("✅ Reset health for all providers");
    });

    it("resets both health and usage when --all-telemetry is passed", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:health:reset",
        "local",
        "--all-telemetry",
      ]);

      expect(resetAllProviderTelemetry).toHaveBeenCalledWith("local");
      expect(resetProviderStatus).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        "✅ Reset health and usage for local",
      );
    });

    it("resets all-telemetry for all providers when none is specified", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:health:reset",
        "--all-telemetry",
      ]);

      expect(resetAllProviderTelemetry).toHaveBeenCalledWith(undefined);
      expect(logSpy).toHaveBeenCalledWith(
        "✅ Reset health and usage for all providers",
      );
    });
  });
});
