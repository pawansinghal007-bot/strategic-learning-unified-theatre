import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const getRoutingHistory = vi.fn();
const resetRoutingHistory = vi.fn();

vi.mock("../../src/llm/routing-history", () => ({
  getRoutingHistory: (...a) => getRoutingHistory(...a),
  resetRoutingHistory: (...a) => resetRoutingHistory(...a),
}));

import { registerLlmRouting } from "../../src/cli/llm-routing";

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut() {}, writeErr() {} });
  registerLlmRouting(program);
  return program;
}

describe("registerLlmRouting", () => {
  let logSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("llm:routing", () => {
    it("uses the default limit of 20 when --limit is omitted", async () => {
      getRoutingHistory.mockReturnValue([]);
      await makeProgram().parseAsync(["node", "cli", "llm:routing"]);
      expect(getRoutingHistory).toHaveBeenCalledWith(20);
    });

    it("uses a custom --limit value", async () => {
      getRoutingHistory.mockReturnValue([]);
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:routing",
        "--limit",
        "5",
      ]);
      expect(getRoutingHistory).toHaveBeenCalledWith(5);
    });

    it("prints a message and returns early when there are no rows", async () => {
      getRoutingHistory.mockReturnValue([]);
      await makeProgram().parseAsync(["node", "cli", "llm:routing"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("No routing decisions recorded.");
    });

    it("renders a successful row without optional fields", async () => {
      getRoutingHistory.mockReturnValue([
        {
          provider: "groq",
          success: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          reason: "default_selection",
          fallbackFrom: null,
          latencyMs: null,
          errorMessage: null,
        },
      ]);

      await makeProgram().parseAsync(["node", "cli", "llm:routing"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("SUCCESS");
      expect(output).toContain("reason: default_selection");
      expect(output).not.toContain("fallbackFrom:");
      expect(output).not.toContain("latencyMs:");
      expect(output).not.toContain("error:");
    });

    it("renders a failed row with all optional fields present", async () => {
      getRoutingHistory.mockReturnValue([
        {
          provider: "openai",
          success: false,
          createdAt: "2026-01-02T00:00:00.000Z",
          reason: "auth_error",
          fallbackFrom: "groq",
          latencyMs: 120,
          errorMessage: "401 unauthorized",
        },
      ]);

      await makeProgram().parseAsync(["node", "cli", "llm:routing"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("FAILED");
      expect(output).toContain("fallbackFrom: groq");
      expect(output).toContain("latencyMs: 120");
      expect(output).toContain("error: 401 unauthorized");
    });

    it("renders latencyMs of 0 (a falsy-but-present value, not null)", async () => {
      getRoutingHistory.mockReturnValue([
        {
          provider: "local",
          success: true,
          createdAt: "2026-01-03T00:00:00.000Z",
          reason: "fastest",
          fallbackFrom: null,
          latencyMs: 0,
          errorMessage: null,
        },
      ]);

      await makeProgram().parseAsync(["node", "cli", "llm:routing"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("latencyMs: 0");
    });
  });

  it("llm:routing:reset clears history", async () => {
    await makeProgram().parseAsync(["node", "cli", "llm:routing:reset"]);

    expect(resetRoutingHistory).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("✅ Reset routing history");
  });
});
