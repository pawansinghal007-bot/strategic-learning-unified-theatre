/**
 * tests/llm/embeddings-idempotency.test.js
 *
 * Regression test for the Sprint 113 idempotency gap in
 * EmbeddingProvider.initialize().
 *
 * Before the fix, every call to initialize() unconditionally ran
 * probeHardware(), which shells out to nvidia-smi / lspci / system_profiler /
 * powershell. Because DocumentIngester, MistakeTracker, and PromptGenerator
 * all call this.initialize() at the top of every operation method, a single
 * user action (addMistake, buildContext, ingestFile) spawned a subprocess it
 * had never spawned before Sprint 113 — a silent per-call regression.
 *
 * The fix adds a this._initialized flag. These tests lock in that guarantee:
 *
 *   1. probeHardware is called exactly ONCE no matter how many times
 *      initialize() is called on the same instance.
 *   2. The backend value set on the first call is preserved unchanged.
 *   3. The return value is always `this` (chaining contract holds).
 *   4. The MOCK_LLM fast-path is also idempotent (probeHardware never called).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must be hoisted before the module under test is imported.
vi.mock("../../src/installer/hw-probe/hwProbe.js", () => ({
  probeHardware: vi.fn(),
}));

vi.mock("onnxruntime-node", () => ({
  default: {},
  InferenceSession: {},
}));

import { EmbeddingProvider } from "../../src/llm/embeddings.js";
import { probeHardware } from "../../src/installer/hw-probe/hwProbe.js";

const tierXProfile = {
  tier: "X",
  tierReason: "no GPU",
  platform: "linux",
  cpuModel: "",
  cpuCores: 1,
  ramMB: 0,
  gpus: [],
  primaryGpuVramMB: 0,
};

const tierZProfile = {
  tier: "Z",
  tierReason: "24000 MB VRAM — 70B+ models viable",
  platform: "linux",
  cpuModel: "",
  cpuCores: 1,
  ramMB: 0,
  gpus: [],
  primaryGpuVramMB: 24000,
};

let savedMockLlm;

beforeEach(() => {
  savedMockLlm = process.env.VSCODE_ROTATOR_MOCK_LLM;
  delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  // clearAllMocks resets call counts/history but preserves mockResolvedValue
  // implementations. Set a safe default here so any future test that forgets
  // to call mockResolvedValue() gets a defined profile rather than undefined
  // (which would cause profile.tier to throw at the call site in initialize()).
  vi.clearAllMocks();
  probeHardware.mockResolvedValue(tierXProfile);
});

afterEach(() => {
  if (savedMockLlm == null) {
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  } else {
    process.env.VSCODE_ROTATOR_MOCK_LLM = savedMockLlm;
  }
  vi.restoreAllMocks();
});

describe("EmbeddingProvider.initialize() — idempotency guard", () => {
  it("calls probeHardware exactly once even when initialize() is called multiple times (tier X)", async () => {
    probeHardware.mockResolvedValue(tierXProfile);

    const provider = new EmbeddingProvider();

    // Simulate what DocumentIngester / MistakeTracker / PromptGenerator do:
    // call initialize() at the top of every operation.
    await provider.initialize();
    await provider.initialize();
    await provider.initialize();

    // Core regression assertion — this is what was broken before the fix.
    expect(probeHardware).toHaveBeenCalledTimes(1);

    // Backend must still be correct after repeated calls.
    expect(provider.backend).toBe("deterministic-hash");
  });

  it("calls probeHardware exactly once even when initialize() is called multiple times (tier Z)", async () => {
    probeHardware.mockResolvedValue(tierZProfile);

    const provider = new EmbeddingProvider();

    await provider.initialize();
    await provider.initialize();
    await provider.initialize();

    expect(probeHardware).toHaveBeenCalledTimes(1);
    expect(provider.backend).toBe("onnxruntime-node");
  });

  it("preserves the backend set by the first call on subsequent calls", async () => {
    probeHardware.mockResolvedValue(tierZProfile);

    const provider = new EmbeddingProvider();
    await provider.initialize();
    const backendAfterFirst = provider.backend;

    // Change what probeHardware would return — should not matter because
    // the guard prevents it from being called again.
    probeHardware.mockResolvedValue(tierXProfile);
    await provider.initialize();

    expect(provider.backend).toBe(backendAfterFirst);
    expect(probeHardware).toHaveBeenCalledTimes(1); // still only once
  });

  it("always returns `this` (chaining contract) on every call", async () => {
    probeHardware.mockResolvedValue(tierXProfile);

    const provider = new EmbeddingProvider();
    const r1 = await provider.initialize();
    const r2 = await provider.initialize();

    expect(r1).toBe(provider);
    expect(r2).toBe(provider);
  });

  it("MOCK_LLM fast-path: probeHardware is never called, even across multiple initialize() calls", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";

    const provider = new EmbeddingProvider();
    await provider.initialize();
    await provider.initialize();
    await provider.initialize();

    expect(probeHardware).not.toHaveBeenCalled();
    expect(provider.backend).toBe("deterministic-hash");
  });
});
