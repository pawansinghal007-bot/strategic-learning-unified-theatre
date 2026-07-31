/**
 * Sprint 114 — Persistent Active Local Model
 *
 * Tests for getActiveModel / setActiveModel state and the provider-aware
 * modelPath resolution in askLocalLlm when no explicit modelPath is passed.
 *
 * Run in isolation: npx vitest run tests/llm/local-llm-switch.test.js
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { describe, it, expect, vi, afterEach } from "vitest";

// ── Hoisted spies — must be declared via vi.hoisted so they exist at the
//    time vi.mock factory runs (vi.mock is hoisted to top of file by Vitest). ──

const { ctorSpy, resolveProviderMock } = vi.hoisted(() => ({
  ctorSpy: vi.fn(),
  resolveProviderMock: vi.fn(),
}));

// Full module mock for inference.js — spread real exports, override
// LocalLlmInference (to capture constructor args) and
// resolvePreferredLlmProvider (to control provider resolution in tests 3 & 4).
vi.mock("../../src/llm/inference.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolvePreferredLlmProvider: resolveProviderMock,
    LocalLlmInference: class {
      constructor(args) {
        ctorSpy(args);
      }
      generate() {
        return Promise.resolve("mocked");
      }
    },
  };
});

// Import module under test AFTER vi.mock is hoisted.
import {
  getActiveModel,
  setActiveModel,
  askLocalLlm,
  MODEL_REGISTRY,
  OLLAMA_MODEL_REGISTRY,
} from "../../src/llm/local-llm.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Sprint 114 — getActiveModel / setActiveModel / askLocalLlm registry resolution", () => {
  afterEach(async () => {
    // Reset module-level _activeModel state so tests don't bleed into each other.
    setActiveModel("phi3");
    vi.clearAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;

    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  // ── Test 1: default active model is 'phi3' ──────────────────────────────────

  it("getActiveModel returns 'phi3' before any setActiveModel call", () => {
    expect(getActiveModel()).toBe("phi3");
  });

  // ── Test 2: setActiveModel persists the new value ───────────────────────────

  it("setActiveModel changes the value returned by getActiveModel", () => {
    setActiveModel("tinyllama");
    expect(getActiveModel()).toBe("tinyllama");
  });

  // ── Test 3: ollama branch resolves from OLLAMA_MODEL_REGISTRY ───────────────

  it("askLocalLlm with no modelPath uses OLLAMA_MODEL_REGISTRY when provider is ollama", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    resolveProviderMock.mockResolvedValue("ollama");
    setActiveModel("tinyllama");

    await askLocalLlm({ question: "hi" });

    const lastCall = ctorSpy.mock.calls.at(-1)[0];
    expect(lastCall.modelPath).toBe(OLLAMA_MODEL_REGISTRY.tinyllama);
    // OLLAMA_MODEL_REGISTRY.tinyllama === 'tinyllama' (plain string)
    expect(lastCall.modelPath).toBe("tinyllama");
  });

  // ── Test 4: node-llama-cpp branch resolves file path via modelDir ────────────

  it("askLocalLlm with no modelPath builds path.join(baseDir, 'models', registry.name) when provider is node-llama-cpp", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-switch-"));

    resolveProviderMock.mockResolvedValue("node-llama-cpp");
    setActiveModel("tinyllama");

    await askLocalLlm({ question: "hi", baseDir: tmpDir });

    const lastCall = ctorSpy.mock.calls.at(-1)[0];
    const expectedPath = path.join(
      tmpDir,
      "models",
      MODEL_REGISTRY.tinyllama.name, // 'tinyllama-1.1b-q3_k_s.gguf'
    );
    expect(lastCall.modelPath).toBe(expectedPath);
  });

  // ── Test 5: explicit modelPath override bypasses all registry resolution ─────

  it("askLocalLlm with explicit modelPath passes it straight through without registry lookup", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    // Even if provider resolves differently, explicit path must win.
    resolveProviderMock.mockResolvedValue("node-llama-cpp");
    setActiveModel("tinyllama");

    const explicitPath = "/explicit/path.gguf";
    await askLocalLlm({ question: "hi", modelPath: explicitPath });

    const lastCall = ctorSpy.mock.calls.at(-1)[0];
    expect(lastCall.modelPath).toBe(explicitPath);

    // resolvePreferredLlmProvider must NOT have been called — the explicit
    // modelPath short-circuits before the registry lookup.
    expect(resolveProviderMock).not.toHaveBeenCalled();
  });
});
