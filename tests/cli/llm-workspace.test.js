import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const getWorkspacePolicyOverride = vi.fn();
const setWorkspacePolicyOverride = vi.fn();
const clearWorkspacePolicyOverride = vi.fn();
const listWorkspacePolicyOverrides = vi.fn();
const getWorkspaceContext = vi.fn();
const saveWorkspaceContext = vi.fn();
const clearWorkspaceContext = vi.fn();

vi.mock("../../src/policies/workspace-policy", () => ({
  getWorkspacePolicyOverride: (...a) => getWorkspacePolicyOverride(...a),
  setWorkspacePolicyOverride: (...a) => setWorkspacePolicyOverride(...a),
  clearWorkspacePolicyOverride: (...a) => clearWorkspacePolicyOverride(...a),
  listWorkspacePolicyOverrides: (...a) => listWorkspacePolicyOverrides(...a),
}));
vi.mock("../../src/memory/request-context", () => ({
  getWorkspaceContext: (...a) => getWorkspaceContext(...a),
  saveWorkspaceContext: (...a) => saveWorkspaceContext(...a),
  clearWorkspaceContext: (...a) => clearWorkspaceContext(...a),
}));

import { registerLlmWorkspace } from "../../src/cli/llm-workspace";

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut() {}, writeErr() {} });
  registerLlmWorkspace(program);
  return program;
}

describe("registerLlmWorkspace", () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  describe("llm:workspace policy:get <workspaceId>", () => {
    it("prints 'No override found' when there is none", async () => {
      getWorkspacePolicyOverride.mockReturnValue(null);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:get",
        "ws-1",
      ]);

      expect(logSpy).toHaveBeenCalledWith(
        "No override found for workspace: ws-1",
      );
    });

    it("prints the override details when found", async () => {
      getWorkspacePolicyOverride.mockReturnValue({
        workspaceId: "ws-1",
        policy: { routingMode: "local-only" },
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:get",
        "ws-1",
      ]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("workspaceId  ws-1");
      expect(output).toContain("local-only");
    });
  });

  describe("llm:workspace policy:set <workspaceId>", () => {
    it("errors when neither --mode nor --provider is given", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:set",
        "ws-1",
      ]);

      expect(errorSpy).toHaveBeenCalledWith(
        "Provide at least --mode or --provider",
      );
      expect(process.exitCode).toBe(1);
      expect(setWorkspacePolicyOverride).not.toHaveBeenCalled();
    });

    it("errors on an invalid --mode", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:set",
        "ws-1",
        "--mode",
        "bogus",
      ]);

      expect(errorSpy).toHaveBeenCalledWith("Unknown routing mode: bogus");
      expect(process.exitCode).toBe(1);
      expect(setWorkspacePolicyOverride).not.toHaveBeenCalled();
    });

    it("errors on an invalid --provider", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:set",
        "ws-1",
        "--provider",
        "bogus",
      ]);

      expect(errorSpy).toHaveBeenCalledWith("Unknown provider: bogus");
      expect(process.exitCode).toBe(1);
      expect(setWorkspacePolicyOverride).not.toHaveBeenCalled();
    });

    it("sets a valid --mode only", async () => {
      setWorkspacePolicyOverride.mockReturnValue({
        workspaceId: "ws-1",
        policy: { routingMode: "hybrid" },
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:set",
        "ws-1",
        "--mode",
        "hybrid",
      ]);

      expect(setWorkspacePolicyOverride).toHaveBeenCalledWith("ws-1", {
        routingMode: "hybrid",
      });
      expect(logSpy).toHaveBeenCalledWith("✅ Workspace override set for ws-1");
    });

    it("sets a valid --provider only", async () => {
      setWorkspacePolicyOverride.mockReturnValue({
        workspaceId: "ws-1",
        policy: { manualProvider: "groq" },
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:set",
        "ws-1",
        "--provider",
        "groq",
      ]);

      expect(setWorkspacePolicyOverride).toHaveBeenCalledWith("ws-1", {
        manualProvider: "groq",
      });
    });

    it("sets both --mode and --provider together", async () => {
      setWorkspacePolicyOverride.mockReturnValue({
        workspaceId: "ws-1",
        policy: { routingMode: "cloud", manualProvider: "openai" },
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:set",
        "ws-1",
        "--mode",
        "cloud",
        "--provider",
        "openai",
      ]);

      expect(setWorkspacePolicyOverride).toHaveBeenCalledWith("ws-1", {
        routingMode: "cloud",
        manualProvider: "openai",
      });
    });
  });

  describe("llm:workspace policy:clear <workspaceId>", () => {
    it("prints 'No override found' when nothing was cleared", async () => {
      clearWorkspacePolicyOverride.mockReturnValue(false);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:clear",
        "ws-1",
      ]);

      expect(logSpy).toHaveBeenCalledWith(
        "No override found for workspace: ws-1",
      );
    });

    it("confirms clearing when an override existed", async () => {
      clearWorkspacePolicyOverride.mockReturnValue(true);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:clear",
        "ws-1",
      ]);

      expect(logSpy).toHaveBeenCalledWith(
        "✅ Workspace override cleared for ws-1",
      );
    });
  });

  describe("llm:workspace policy:list", () => {
    it("prints 'No workspace overrides found' when the list is empty", async () => {
      listWorkspacePolicyOverrides.mockReturnValue([]);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:list",
      ]);

      expect(logSpy).toHaveBeenCalledWith("No workspace overrides found.");
    });

    it("lists every override when present", async () => {
      listWorkspacePolicyOverrides.mockReturnValue([
        { workspaceId: "ws-1", policy: { routingMode: "hybrid" } },
        { workspaceId: "ws-2", policy: { manualProvider: "groq" } },
      ]);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "policy:list",
      ]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("ws-1");
      expect(output).toContain("ws-2");
    });
  });

  describe("llm:workspace context:get <workspaceId>", () => {
    it("prints 'No context found' when there is none", async () => {
      getWorkspaceContext.mockReturnValue(null);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "context:get",
        "ws-1",
      ]);

      expect(logSpy).toHaveBeenCalledWith(
        "No context found for workspace: ws-1",
      );
    });

    it("prints context details, falling back to 'none' for empty tags/lastIntent", async () => {
      getWorkspaceContext.mockReturnValue({
        workspaceId: "ws-1",
        summary: "Working on auth",
        tags: [],
        lastIntent: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "context:get",
        "ws-1",
      ]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("summary      Working on auth");
      expect(output).toContain("tags         none");
      expect(output).toContain("lastIntent   none");
    });

    it("prints concrete tags and lastIntent when present", async () => {
      getWorkspaceContext.mockReturnValue({
        workspaceId: "ws-1",
        summary: "Working on auth",
        tags: ["auth", "security"],
        lastIntent: "debug",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "context:get",
        "ws-1",
      ]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("tags         auth, security");
      expect(output).toContain("lastIntent   debug");
    });
  });

  describe("llm:workspace context:set <workspaceId>", () => {
    it("errors when --summary is missing", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "context:set",
        "ws-1",
      ]);

      expect(errorSpy).toHaveBeenCalledWith("--summary is required");
      expect(process.exitCode).toBe(1);
      expect(saveWorkspaceContext).not.toHaveBeenCalled();
    });

    it("defaults tags to [] when --tags is omitted", async () => {
      saveWorkspaceContext.mockReturnValue({ workspaceId: "ws-1" });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "context:set",
        "ws-1",
        "--summary",
        "Working on auth",
      ]);

      expect(saveWorkspaceContext).toHaveBeenCalledWith("ws-1", {
        summary: "Working on auth",
        tags: [],
        lastIntent: undefined,
      });
    });

    it("splits and trims comma-separated --tags", async () => {
      saveWorkspaceContext.mockReturnValue({ workspaceId: "ws-1" });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "context:set",
        "ws-1",
        "--summary",
        "Working on auth",
        "--tags",
        "auth, security ,  urgent",
        "--intent",
        "debug",
      ]);

      expect(saveWorkspaceContext).toHaveBeenCalledWith("ws-1", {
        summary: "Working on auth",
        tags: ["auth", "security", "urgent"],
        lastIntent: "debug",
      });
      expect(logSpy).toHaveBeenCalledWith("✅ Context saved for ws-1");
    });
  });

  describe("llm:workspace context:clear <workspaceId>", () => {
    it("prints 'No context found' when nothing was cleared", async () => {
      clearWorkspaceContext.mockReturnValue(false);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "context:clear",
        "ws-1",
      ]);

      expect(logSpy).toHaveBeenCalledWith(
        "No context found for workspace: ws-1",
      );
    });

    it("confirms clearing when context existed", async () => {
      clearWorkspaceContext.mockReturnValue(true);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm:workspace",
        "context:clear",
        "ws-1",
      ]);

      expect(logSpy).toHaveBeenCalledWith("✅ Context cleared for ws-1");
    });
  });
});
