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
