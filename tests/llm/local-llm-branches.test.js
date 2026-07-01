/**
 * local-llm-branches.test.js
 *
 * Targets remaining branch gaps in src/llm/local-llm.js:
 *   Lines 71-73  — download(): HTTP redirect (30x) → recursive call
 *   Lines 76-77  — download(): response.statusCode !== 200 → reject
 *   Line  169    — getLocalLlmStatus: modelDir readdir throws (catch → [])
 *   Line  235    — setupModel: SHA256 check skipped when registry.sha256 is null
 *
 * Note: These tests run in the "node" environment (set via vitest.config.ts
 * environmentMatchPatterns for local-llm tests).
 */

import fs from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  getLlmStatus,
  getLocalLlmStatus,
  setupModel,
  MODEL_REGISTRY,
} from "../../src/llm/local-llm.js";
import * as inference from "../../src/llm/inference.js";

// ── helpers ────────────────────────────────────────────────────────────────

async function makeTempDir(prefix = "llm-branch-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeAsyncIterableHandle() {
  return {
    createReadStream: () => ({
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from("fake-model-bytes");
      },
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// ── download: HTTP redirect (lines 71-73) ─────────────────────────────────

describe("download — HTTP redirect branch (lines 71-73)", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "node-llama-cpp";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    delete process.env.VSCODE_ROTATOR_LLM_PROVIDER;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("follows HTTP 301 redirect to new location", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue("node-llama-cpp");

    let callCount = 0;
    const httpsGetSpy = vi.spyOn(https, "get").mockImplementation((url, cb) => {
      callCount++;
      const req = new EventEmitter();

      if (callCount === 1) {
        // First call: return a 301 redirect
        const fakeRedirect = Object.assign(new EventEmitter(), {
          statusCode: 301,
          headers: { location: "https://redirected.example.com/model.gguf" },
          resume: vi.fn(),
          pipe: vi.fn(),
        });
        setImmediate(() => cb(fakeRedirect));
      } else {
        // Second call (redirected URL): return 200 success
        const fakeResponse = Object.assign(new EventEmitter(), {
          statusCode: 200,
          headers: {},
          resume: vi.fn(),
          pipe: vi.fn((dest) => {
            setImmediate(() => dest.emit("finish"));
          }),
        });
        setImmediate(() => cb(fakeResponse));
      }
      return req;
    });

    const nodefs = await import("node:fs");
    vi.spyOn(nodefs.default, "createWriteStream").mockImplementation(() => {
      const stream = new EventEmitter();
      stream.write = vi.fn();
      stream.close = (cb) => { if (cb) cb(); };
      return stream;
    });

    vi.spyOn(fs, "open").mockResolvedValue(makeAsyncIterableHandle());

    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    vi.spyOn(LocalLlmInference.prototype, "generate").mockResolvedValue("Hello redirect");

    const result = await setupModel({ model: "phi3", baseDir: tempDir });

    expect(callCount).toBe(2); // redirect + final request
    expect(result.modelPath).toContain(".gguf");
  }, 15000);

  it("follows HTTP 302 redirect", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue("node-llama-cpp");

    let callCount = 0;
    vi.spyOn(https, "get").mockImplementation((url, cb) => {
      callCount++;
      const req = new EventEmitter();
      if (callCount === 1) {
        const redirect = Object.assign(new EventEmitter(), {
          statusCode: 302,
          headers: { location: "https://final.example.com/model.gguf" },
          resume: vi.fn(),
          pipe: vi.fn(),
        });
        setImmediate(() => cb(redirect));
      } else {
        const ok = Object.assign(new EventEmitter(), {
          statusCode: 200,
          headers: {},
          resume: vi.fn(),
          pipe: vi.fn((dest) => setImmediate(() => dest.emit("finish"))),
        });
        setImmediate(() => cb(ok));
      }
      return req;
    });

    const nodefs = await import("node:fs");
    vi.spyOn(nodefs.default, "createWriteStream").mockImplementation(() => {
      const stream = new EventEmitter();
      stream.write = vi.fn();
      stream.close = (cb) => { if (cb) cb(); };
      return stream;
    });

    vi.spyOn(fs, "open").mockResolvedValue(makeAsyncIterableHandle());
    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    vi.spyOn(LocalLlmInference.prototype, "generate").mockResolvedValue("ok");

    const result = await setupModel({ model: "phi3", baseDir: tempDir });
    expect(callCount).toBe(2);
    expect(result.response).toBe("ok");
  }, 15000);
});

// ── download: non-200 status → reject (lines 76-77) ───────────────────────

describe("download — non-200 status code rejection (lines 76-77)", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "node-llama-cpp";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    delete process.env.VSCODE_ROTATOR_LLM_PROVIDER;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("rejects when server returns HTTP 404", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue("node-llama-cpp");

    vi.spyOn(https, "get").mockImplementation((url, cb) => {
      const req = new EventEmitter();
      const fakeResponse = Object.assign(new EventEmitter(), {
        statusCode: 404,
        headers: {},
        resume: vi.fn(),
        pipe: vi.fn(),
      });
      setImmediate(() => cb(fakeResponse));
      return req;
    });

    const nodefs = await import("node:fs");
    vi.spyOn(nodefs.default, "createWriteStream").mockImplementation(() => {
      const stream = new EventEmitter();
      stream.write = vi.fn();
      stream.close = vi.fn();
      return stream;
    });

    await expect(
      setupModel({ model: "phi3", baseDir: tempDir }),
    ).rejects.toThrow("Download failed with HTTP 404");
  }, 15000);

  it("rejects when server returns HTTP 500", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue("node-llama-cpp");

    vi.spyOn(https, "get").mockImplementation((url, cb) => {
      const req = new EventEmitter();
      const fakeResponse = Object.assign(new EventEmitter(), {
        statusCode: 500,
        headers: {},
        resume: vi.fn(),
        pipe: vi.fn(),
      });
      setImmediate(() => cb(fakeResponse));
      return req;
    });

    const nodefs = await import("node:fs");
    vi.spyOn(nodefs.default, "createWriteStream").mockImplementation(() => {
      const stream = new EventEmitter();
      stream.close = vi.fn();
      return stream;
    });

    await expect(
      setupModel({ model: "phi3", baseDir: tempDir }),
    ).rejects.toThrow("Download failed with HTTP 500");
  }, 15000);
});

// ── getLocalLlmStatus: readdir throws → catch returns [] (line 169) ────────

describe("getLocalLlmStatus — readdir catch branch (line 169)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  });

  it("returns unavailable when fs.readdir throws (e.g. ENOENT)", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    vi.spyOn(fs, "readdir").mockRejectedValue(
      Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }),
    );

    const status = await getLocalLlmStatus();
    expect(status.status).toBe("unavailable");
    expect(status.models).toEqual([]);
  });

  it("returns unavailable when modelDir has no .gguf files (filter catches them)", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    vi.spyOn(fs, "readdir").mockResolvedValue(["model.bin", "config.json"]);

    const status = await getLocalLlmStatus();
    expect(status.status).toBe("unavailable");
  });
});

// ── getLlmStatus — readdir catch + empty fallback (line ~89-92) ────────────

describe("getLlmStatus — readdir error caught", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  });

  it("sets ggufModels to [] when readdir throws", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    vi.spyOn(inference, "isOllamaAvailable").mockResolvedValue(false);
    vi.spyOn(fs, "readdir").mockRejectedValue(new Error("ENOENT"));

    const status = await getLlmStatus({ baseDir: "/nonexistent/path" });
    expect(status.available).toBe(false);
    expect(status.models).toEqual([]);
  });
});

// ── setupModel: sha256 null → skip SHA256 check (line 235) ─────────────────

describe("setupModel — sha256 null skips hash check (line 235)", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "node-llama-cpp";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    delete process.env.VSCODE_ROTATOR_LLM_PROVIDER;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("skips SHA256 verification when registry.sha256 is null (line 235)", async () => {
    // phi3 registry has sha256: null by default — confirm it's null
    expect(MODEL_REGISTRY.phi3.sha256).toBeNull();

    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue("node-llama-cpp");

    // Provide a real source file to copy
    const srcFile = path.join(tempDir, "src-model.gguf");
    await fs.writeFile(srcFile, "fake-model-bytes", "utf8");

    vi.spyOn(fs, "open").mockResolvedValue(makeAsyncIterableHandle());

    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    vi.spyOn(LocalLlmInference.prototype, "generate").mockResolvedValue("SHA256 skipped");

    // sha256 is null → no mismatch check → should succeed without throwing
    const result = await setupModel({
      model: "phi3",
      modelPath: srcFile,
      baseDir: tempDir,
    });

    expect(result.sha256).toBeDefined(); // digest still computed
    expect(result.response).toBe("SHA256 skipped");
    // No error thrown → sha256 null check was skipped
  }, 15000);

  it("tinyllama registry also has sha256: null", async () => {
    expect(MODEL_REGISTRY.tinyllama.sha256).toBeNull();

    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue("node-llama-cpp");

    const srcFile = path.join(tempDir, "tiny.gguf");
    await fs.writeFile(srcFile, "tiny-model", "utf8");

    vi.spyOn(fs, "open").mockResolvedValue(makeAsyncIterableHandle());
    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    vi.spyOn(LocalLlmInference.prototype, "generate").mockResolvedValue("tiny ok");

    const result = await setupModel({
      model: "tinyllama",
      modelPath: srcFile,
      baseDir: tempDir,
    });

    expect(result.response).toBe("tiny ok");
  }, 15000);
});
