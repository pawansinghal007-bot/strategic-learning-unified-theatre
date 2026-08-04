import { describe, expect, it, vi } from "vitest";
import { CapabilityRegistry } from "../../src/agatsya/registry.ts";
import { Dispatcher } from "../../src/agatsya/dispatcher.ts";

describe("Dispatcher", () => {
  it("dispatches immediately for unambiguous file-context signals without calling the LLM", async () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: "java-expert",
      type: "language_expert",
      mechanism: "trained",
      role: "generative",
      version: "1.0.0",
      state: "Registered",
      capabilities: ["java@21", "spring-boot@3.x"],
      environment: ["java-21", "maven"],
      io_contract: {
        accepts: { kind: "SubtaskPacket" },
        returns: { kind: "SubtaskResponse" },
      },
      permissions: ["read", "write"],
    });
    registry.register({
      id: "typescript-expert",
      type: "language_expert",
      mechanism: "trained",
      role: "generative",
      version: "1.0.0",
      state: "Registered",
      capabilities: ["typescript@5.x"],
      environment: ["node-22"],
      io_contract: {
        accepts: { kind: "SubtaskPacket" },
        returns: { kind: "SubtaskResponse" },
      },
      permissions: ["read", "write"],
    });

    const llmClient = { complete: vi.fn() };
    const dispatcher = new Dispatcher({ registry, llmClient });

    const result = await dispatcher.route({
      fileContext: {
        path: "src/main/java/com/example/App.java",
        confidence: 0.95,
        language: "java",
      },
    });

    expect(result.status).toBe("dispatched");
    expect(llmClient.complete).not.toHaveBeenCalled();
    expect(result.packet.expert).toBe("java-expert");
    expect(result.packet.subtask_id).toBeTruthy();
  });

  it("dispatches TypeScript tasks from extension and language signals", async () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: "typescript-expert",
      type: "language_expert",
      mechanism: "trained",
      role: "generative",
      version: "1.0.0",
      state: "Registered",
      capabilities: ["typescript@5.x"],
      environment: ["node-22"],
      io_contract: {
        accepts: { kind: "SubtaskPacket" },
        returns: { kind: "SubtaskResponse" },
      },
      permissions: ["read", "write"],
    });

    const llmClient = { complete: vi.fn() };
    const dispatcher = new Dispatcher({ registry, llmClient });

    const tsxResult = await dispatcher.route({
      fileContext: {
        path: "src/app/App.tsx",
        confidence: 0.9,
      },
    });
    const languageResult = await dispatcher.route({
      fileContext: {
        path: "src/app/component",
        confidence: 0.9,
        language: "TS",
      },
    });

    expect(tsxResult.status).toBe("dispatched");
    expect(tsxResult.packet.expert).toBe("typescript-expert");
    expect(languageResult.status).toBe("dispatched");
    expect(languageResult.packet.expert).toBe("typescript-expert");
    expect(llmClient.complete).not.toHaveBeenCalled();
  });

  it("returns a needs-stage-2 status when the context is ambiguous", async () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: "java-expert",
      type: "language_expert",
      mechanism: "trained",
      role: "generative",
      version: "1.0.0",
      state: "Registered",
      capabilities: ["java@21"],
      environment: ["java-21"],
      io_contract: {
        accepts: { kind: "SubtaskPacket" },
        returns: { kind: "SubtaskResponse" },
      },
      permissions: ["read", "write"],
    });
    registry.register({
      id: "typescript-expert",
      type: "language_expert",
      mechanism: "trained",
      role: "generative",
      version: "1.0.0",
      state: "Registered",
      capabilities: ["typescript@5.x"],
      environment: ["node-22"],
      io_contract: {
        accepts: { kind: "SubtaskPacket" },
        returns: { kind: "SubtaskResponse" },
      },
      permissions: ["read", "write"],
    });

    const llmClient = { complete: vi.fn() };
    const dispatcher = new Dispatcher({ registry, llmClient });

    const result = await dispatcher.route({
      fileContext: {
        path: "src/notes.txt",
        confidence: 0.4,
        language: "unknown",
      },
    });

    expect(result.status).toBe("needs-stage-2");
    expect(result.packet).toBeUndefined();
    expect(llmClient.complete).not.toHaveBeenCalled();
  });

  it("uses safe defaults when route input or file-context fields are missing", async () => {
    const registry = new CapabilityRegistry();
    const llmClient = { complete: vi.fn() };
    const dispatcher = new Dispatcher({ registry, llmClient });

    await expect(dispatcher.route()).resolves.toEqual({
      status: "needs-stage-2",
      packet: undefined,
    });
    await expect(
      dispatcher.route({
        fileContext: {
          path: null,
          confidence: null,
          language: null,
        },
      }),
    ).resolves.toEqual({
      status: "needs-stage-2",
      packet: undefined,
    });
    expect(llmClient.complete).not.toHaveBeenCalled();
  });

  it("falls back to stage 2 when no registered capability matches a confident signal", async () => {
    const registry = new CapabilityRegistry();
    const llmClient = { complete: vi.fn() };
    const dispatcher = new Dispatcher({ registry, llmClient });

    const result = await dispatcher.route({
      fileContext: {
        path: "src/main/java/com/example/App.java",
        confidence: 0.95,
        language: "java",
      },
    });

    expect(result).toEqual({ status: "needs-stage-2", packet: undefined });
    expect(llmClient.complete).not.toHaveBeenCalled();
  });
});
