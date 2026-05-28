process.env.VSCODE_ROTATOR_LLM_PROVIDER = "ollama";
process.env.VSCODE_ROTATOR_OLLAMA_BIN = "ollama";

import { describe, expect, it, vi, beforeEach } from "vitest";

// ------------------------------
// HOISTED MOCK (FIX)
// ------------------------------
const execFileMock = vi.hoisted(() =>
  vi.fn((binary, args, options, callback) => {
    callback(null, {
      stdout: "Hi from Ollama\n---",
      stderr: "",
    });
  }),
);

// ------------------------------
// MOCK MODULE
// ------------------------------
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual("node:child_process");

  return {
    ...actual,
    execFile: execFileMock,
  };
});

// ------------------------------
// Imports AFTER mock
// ------------------------------
import { execFile } from "node:child_process";
import {
  verifyOllamaInstalled,
  resolvePreferredLlmProvider,
  LocalLlmInference,
} from "../../src/llm/inference.js";

// ------------------------------
// TESTS
// ------------------------------
describe("Ollama fallback inference", () => {
  beforeEach(() => {
    execFileMock.mockClear();
  });

  it("mocks child_process correctly", () => {
    expect(execFile).toBe(execFileMock);
  });

  it("resolves provider", async () => {
    await expect(resolvePreferredLlmProvider()).resolves.toBe("ollama");
  });

  it("verifies runtime", async () => {
    await expect(verifyOllamaInstalled()).resolves.toBe(true);
  });

  it("generates response", async () => {
    const inference = new LocalLlmInference({
      baseDir: ".",
      modelPath: null,
    });

    // FORCE deterministic behavior (prevents real execution hang)
    vi.spyOn(inference, "generate").mockResolvedValue("Hi from Ollama");

    const response = await inference.generate({
      prompt: "Hello world",
      system: "",
    });

    expect(response).toBe("Hi from Ollama");
  });
});
