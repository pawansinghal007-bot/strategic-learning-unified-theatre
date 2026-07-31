/**
 * embeddings-onnx-fallback.test.js
 *
 * Covers the single remaining uncovered branch in src/llm/embeddings.js:
 *
 *   Line 245 (catch block in EmbeddingProvider.initialize):
 *     when VSCODE_ROTATOR_MOCK_LLM is unset AND `import("onnxruntime-node")`
 *     throws, the catch sets this.backend = "deterministic-hash".
 *
 * Strategy: mock "onnxruntime-node" to throw, then call initialize() without
 * the MOCK_LLM guard so the try/catch path is actually exercised.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Force onnxruntime-node to be unavailable for every test in this file.
vi.mock("onnxruntime-node", () => {
  throw new Error("onnxruntime-node is not available");
});

// Force probeHardware to report tier Z so the tier-X early return does NOT
// fire and initialize() falls through to the onnxruntime-node try/catch.
// Without this mock, on any machine probing as tier X (no discrete GPU —
// true for most dev boxes and CI), the tier gate introduced in Sprint 113
// would return early and the onnx-catch branch tested here would silently
// stop being exercised while assertions remained loose enough to still pass.
vi.mock("../../src/installer/hw-probe/hwProbe.js", () => ({
  probeHardware: vi.fn().mockResolvedValue({
    tier: "Z",
    tierReason: "24000 MB VRAM — 70B+ models viable",
    platform: "linux",
    cpuModel: "",
    cpuCores: 1,
    ramMB: 0,
    gpus: [],
    primaryGpuVramMB: 24000,
  }),
}));

// Import AFTER the mock is registered so the module under test picks it up
// when it calls `await import("onnxruntime-node")`.
import { EmbeddingProvider } from "../../src/llm/embeddings.js";

describe("EmbeddingProvider.initialize() — onnxruntime-node catch branch (line 245)", () => {
  let savedMock;

  beforeEach(() => {
    savedMock = process.env.VSCODE_ROTATOR_MOCK_LLM;
    // Remove the guard so initialize() reaches the try/catch
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  });

  afterEach(() => {
    if (savedMock == null) {
      delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    } else {
      process.env.VSCODE_ROTATOR_MOCK_LLM = savedMock;
    }
    vi.restoreAllMocks();
  });

  it("falls back to deterministic-hash when onnxruntime-node import throws (line 245)", async () => {
    const provider = new EmbeddingProvider();
    await provider.initialize();
    // The catch block must have fired and set the fallback backend
    expect(provider.backend).toBe("deterministic-hash");
  });

  it("returns `this` from initialize() after the catch (chaining still works)", async () => {
    const provider = new EmbeddingProvider();
    const returned = await provider.initialize();
    expect(returned).toBe(provider);
  });

  it("embed() still works after failed onnx import", async () => {
    const provider = new EmbeddingProvider();
    await provider.initialize();
    const vec = await provider.embed("test text");
    expect(vec).toHaveLength(768);
    // Vector should be normalised (unit length ≈ 1, or all-zero for empty input)
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 3);
  });
});
