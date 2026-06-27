import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const getProviderPolicy = vi.fn();
const applyPolicyPreset = vi.fn();
const setRoutingMode = vi.fn();
const allowProvider = vi.fn();
const blockProvider = vi.fn();
const setManualProvider = vi.fn();
const resetProviderPolicy = vi.fn();
const isPolicyPresetName = vi.fn();
const listPolicyPresets = vi.fn();

vi.mock("../../src/policies/provider-policy", () => ({
  getProviderPolicy: (...a) => getProviderPolicy(...a),
  applyPolicyPreset: (...a) => applyPolicyPreset(...a),
  setRoutingMode: (...a) => setRoutingMode(...a),
  allowProvider: (...a) => allowProvider(...a),
  blockProvider: (...a) => blockProvider(...a),
  setManualProvider: (...a) => setManualProvider(...a),
  resetProviderPolicy: (...a) => resetProviderPolicy(...a),
}));
vi.mock("../../src/policies/policy-presets", () => ({
  isPolicyPresetName: (...a) => isPolicyPresetName(...a),
  listPolicyPresets: (...a) => listPolicyPresets(...a),
}));

import { registerLlmPolicy } from "../../src/cli/llm-policy";

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut() {}, writeErr() {} });
  registerLlmPolicy(program);
  return program;
}

describe("registerLlmPolicy", () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  describe("llm:policy", () => {
    it("prints the policy, falling back to 'none' for absent preset/manualProvider", async () => {
      getProviderPolicy.mockReturnValue({
        activePreset: null,
        routingMode: "hybrid",
        manualProvider: null,
        allowedProviders: ["groq", "local"],
        blockedProviders: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      await makeProgram().parseAsync(["node", "cli", "llm:policy"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("preset          none");
      expect(output).toContain("manualProvider  none");
      expect(output).toContain("blocked         none");
      expect(output).toContain("allowed         groq, local");
    });

    it("prints concrete preset/manualProvider/blocked values when present", async () => {
      getProviderPolicy.mockReturnValue({
        activePreset: "balanced",
        routingMode: "cloud",
        manualProvider: "openai",
        allowedProviders: ["openai"],
        blockedProviders: ["local"],
        updatedAt: "2026-02-01T00:00:00.000Z",
      });

      await makeProgram().parseAsync(["node", "cli", "llm:policy"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("preset          balanced");
      expect(output).toContain("manualProvider  openai");
      expect(output).toContain("blocked         local");
    });
  });

  it("llm:policy:presets lists every preset", async () => {
    listPolicyPresets.mockReturnValue([
      { name: "balanced", description: "A balanced mix" },
      { name: "cheap", description: "Cheapest viable option" },
    ]);

    await makeProgram().parseAsync(["node", "cli", "llm:policy:presets"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("balanced");
    expect(output).toContain("A balanced mix");
    expect(output).toContain("cheap");
  });

  describe("llm:policy:preset <name>", () => {
    it("errors on an unknown preset name", async () => {
      isPolicyPresetName.mockReturnValue(false);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:policy:preset",
        "nonsense",
      ]);

      expect(errorSpy).toHaveBeenCalledWith("Unknown policy preset: nonsense");
      expect(process.exitCode).toBe(1);
      expect(applyPolicyPreset).not.toHaveBeenCalled();
    });

    it("applies a valid preset", async () => {
      isPolicyPresetName.mockReturnValue(true);
      applyPolicyPreset.mockReturnValue({ activePreset: "balanced" });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:policy:preset",
        "balanced",
      ]);

      expect(applyPolicyPreset).toHaveBeenCalledWith("balanced");
      expect(logSpy).toHaveBeenCalledWith("✅ Applied preset balanced");
    });
  });

  describe("llm:policy:mode <mode>", () => {
    it("errors on an unknown mode", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:policy:mode",
        "bogus",
      ]);

      expect(errorSpy).toHaveBeenCalledWith("Unknown routing mode: bogus");
      expect(process.exitCode).toBe(1);
      expect(setRoutingMode).not.toHaveBeenCalled();
    });

    it("sets a valid mode", async () => {
      setRoutingMode.mockReturnValue({ routingMode: "local-only" });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:policy:mode",
        "local-only",
      ]);

      expect(setRoutingMode).toHaveBeenCalledWith("local-only");
      expect(logSpy).toHaveBeenCalledWith("✅ Routing mode set to local-only");
    });
  });

  describe("llm:policy:allow <provider>", () => {
    it("errors on an unknown provider", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:policy:allow",
        "bogus",
      ]);

      expect(errorSpy).toHaveBeenCalledWith("Unknown provider: bogus");
      expect(process.exitCode).toBe(1);
      expect(allowProvider).not.toHaveBeenCalled();
    });

    it("allows a valid provider", async () => {
      allowProvider.mockReturnValue({ allowedProviders: ["groq", "local"] });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:policy:allow",
        "local",
      ]);

      expect(allowProvider).toHaveBeenCalledWith("local");
      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("✅ Allowed local");
      expect(output).toContain("Allowed providers: groq, local");
    });
  });

  describe("llm:policy:block <provider>", () => {
    it("errors on an unknown provider", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:policy:block",
        "bogus",
      ]);

      expect(errorSpy).toHaveBeenCalledWith("Unknown provider: bogus");
      expect(process.exitCode).toBe(1);
      expect(blockProvider).not.toHaveBeenCalled();
    });

    it("blocks a valid provider", async () => {
      blockProvider.mockReturnValue({ blockedProviders: ["perplexity"] });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:policy:block",
        "perplexity",
      ]);

      expect(blockProvider).toHaveBeenCalledWith("perplexity");
      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("✅ Blocked perplexity");
      expect(output).toContain("Blocked providers: perplexity");
    });
  });

  describe("llm:policy:pin [provider]", () => {
    it("errors on an unknown provider", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:policy:pin",
        "bogus",
      ]);

      expect(errorSpy).toHaveBeenCalledWith("Unknown provider: bogus");
      expect(process.exitCode).toBe(1);
      expect(setManualProvider).not.toHaveBeenCalled();
    });

    it("pins a valid provider", async () => {
      setManualProvider.mockReturnValue({ manualProvider: "groq" });

      await makeProgram().parseAsync(["node", "cli", "llm:policy:pin", "groq"]);

      expect(setManualProvider).toHaveBeenCalledWith("groq");
      expect(logSpy).toHaveBeenCalledWith("✅ Manual provider set to groq");
    });

    it("clears the pin when no provider argument is given", async () => {
      setManualProvider.mockReturnValue({ manualProvider: null });

      await makeProgram().parseAsync(["node", "cli", "llm:policy:pin"]);

      expect(setManualProvider).toHaveBeenCalledWith(null);
      expect(logSpy).toHaveBeenCalledWith("✅ Manual provider set to none");
    });
  });

  it("llm:policy:reset resets policy and reports the new mode", async () => {
    resetProviderPolicy.mockReturnValue({ routingMode: "hybrid" });

    await makeProgram().parseAsync(["node", "cli", "llm:policy:reset"]);

    expect(resetProviderPolicy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("✅ Provider policy reset to hybrid");
  });
});
