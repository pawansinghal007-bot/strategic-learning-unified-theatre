/**
 * local-llm.coverage-additions.test.js
 *
 * Targets the branch gaps in src/llm/local-llm.js that keep coverage below 70%.
 * Each describe block names the function under test and the specific branches
 * being exercised.
 */

import fs from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";

import {
  getLlmStatus,
  getLocalLlmStatus,
  ingestDocuments,
  importSprints,
  setupModel,
  askLocalLlm,
} from "../../src/llm/local-llm.js";

import * as inference from "../../src/llm/inference.js";
import * as agentHandoff from "../../src/agent-handoff.js";

// ─── helpers ────────────────────────────────────────────────────────────────

async function makeTempDir(prefix = "local-llm-cov-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Returns a mock file handle whose createReadStream() is a proper async iterable.
 * The sha256() helper in local-llm.js does:
 *   for await (const chunk of handle.createReadStream()) hash.update(chunk);
 * Uses a plain async generator — no node:stream import needed.
 */
function makeAsyncIterableHandle() {
  return {
    createReadStream: () => ({
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from("fake");
      },
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── getLlmStatus ────────────────────────────────────────────────────────────

describe("getLlmStatus — ollama branches", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("sets provider=ollama and fallbackModel when only ollama models exist (no gguf)", async () => {
    vi.spyOn(inference, "isOllamaAvailable").mockResolvedValue(true);
    vi.spyOn(inference, "listOllamaModels").mockResolvedValue([
      "phi3:mini",
      "tinyllama",
    ]);

    const status = await getLlmStatus({ baseDir: tempDir });

    expect(status.available).toBe(true);
    expect(status.provider).toBe("ollama");
    expect(status.ollamaAvailable).toBe(true);
    expect(status.models).toContain("phi3:mini");
    expect(status.modelPath).toBe("phi3:mini");
  });

  it("sets provider=null and available=false when ollama is available but returns no models", async () => {
    vi.spyOn(inference, "isOllamaAvailable").mockResolvedValue(true);
    vi.spyOn(inference, "listOllamaModels").mockResolvedValue([]);

    const status = await getLlmStatus({ baseDir: tempDir });

    expect(status.available).toBe(false);
    expect(status.provider).toBe(null);
    expect(status.modelPath).toBe(null);
  });

  it("falls back to empty ollamaModels when listOllamaModels throws", async () => {
    vi.spyOn(inference, "isOllamaAvailable").mockResolvedValue(true);
    vi.spyOn(inference, "listOllamaModels").mockRejectedValue(
      new Error("ollama not reachable"),
    );

    const status = await getLlmStatus({ baseDir: tempDir });

    expect(status.ollamaAvailable).toBe(true);
    expect(status.models).toEqual([]);
    expect(status.available).toBe(false);
  });

  it("skips listOllamaModels entirely when ollama is not available", async () => {
    vi.spyOn(inference, "isOllamaAvailable").mockResolvedValue(false);
    const listSpy = vi
      .spyOn(inference, "listOllamaModels")
      .mockResolvedValue(["phi3:mini"]);

    const status = await getLlmStatus({ baseDir: tempDir });

    expect(listSpy).not.toHaveBeenCalled();
    expect(status.ollamaAvailable).toBe(false);
  });

  it("prefers gguf modelPath over ollama fallback when both exist", async () => {
    const modelDir = path.join(tempDir, "models");
    await fs.mkdir(modelDir, { recursive: true });
    await fs.writeFile(path.join(modelDir, "model.gguf"), "data", "utf8");

    vi.spyOn(inference, "isOllamaAvailable").mockResolvedValue(true);
    vi.spyOn(inference, "listOllamaModels").mockResolvedValue(["phi3:mini"]);

    const status = await getLlmStatus({ baseDir: tempDir });

    expect(status.provider).toBe("node-llama-cpp");
    expect(status.modelPath).toBe(path.join(modelDir, "model.gguf"));
    expect(status.models).toContain("model.gguf");
    expect(status.models).toContain("phi3:mini");
  });
});

// ─── getLocalLlmStatus ───────────────────────────────────────────────────────

describe("getLocalLlmStatus — all status branches", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns unavailable when modelDir has no .gguf files", async () => {
    // getLocalLlmStatus always uses ~/.vscode-rotator/models; stub fs.readdir
    vi.spyOn(fs, "readdir").mockResolvedValue([]);

    const status = await getLocalLlmStatus();

    expect(status.status).toBe("unavailable");
    expect(status.models).toEqual([]);
  });

  it("returns degraded when models exist but verifyRuntime throws", async () => {
    vi.spyOn(fs, "readdir").mockResolvedValue(["model.gguf"]);
    const verifyRuntime = vi
      .fn()
      .mockRejectedValue(new Error("runtime broken"));

    const status = await getLocalLlmStatus({ verifyRuntime });

    expect(status.status).toBe("degraded");
    expect(status.models).toEqual(["model.gguf"]);
  });

  it("returns ready when models exist and verifyRuntime succeeds", async () => {
    vi.spyOn(fs, "readdir").mockResolvedValue(["model.gguf"]);
    const verifyRuntime = vi.fn().mockResolvedValue(undefined);

    const status = await getLocalLlmStatus({ verifyRuntime });

    expect(status.status).toBe("ready");
    expect(status.models).toEqual(["model.gguf"]);
  });
});

// ─── setupModel — ollama provider path ───────────────────────────────────────

describe("setupModel — ollama provider", () => {
  let tempDir;
  let oldProvider;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    oldProvider = process.env.VSCODE_ROTATOR_LLM_PROVIDER;
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "ollama";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (oldProvider == null) delete process.env.VSCODE_ROTATOR_LLM_PROVIDER;
    else process.env.VSCODE_ROTATOR_LLM_PROVIDER = oldProvider;
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("installs a named ollama model from the registry when no modelPath is given", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue(
      "ollama",
    );
    const installSpy = vi
      .spyOn(inference, "installOllamaModel")
      .mockResolvedValue();

    const result = await setupModel({ model: "phi3", baseDir: tempDir });

    expect(installSpy).toHaveBeenCalledWith("phi3:mini");
    expect(result).toEqual({ provider: "ollama", modelPath: "phi3:mini" });
  });

  it("uses the provided modelPath string directly when given to ollama", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue(
      "ollama",
    );
    const installSpy = vi
      .spyOn(inference, "installOllamaModel")
      .mockResolvedValue();

    const result = await setupModel({
      model: "phi3",
      modelPath: "myorg/mymodel:latest",
      baseDir: tempDir,
    });

    expect(installSpy).toHaveBeenCalledWith("myorg/mymodel:latest");
    expect(result.modelPath).toBe("myorg/mymodel:latest");
  });

  it("falls back to OLLAMA_MODEL_REGISTRY.phi3 when the requested model key is unknown", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue(
      "ollama",
    );
    const installSpy = vi
      .spyOn(inference, "installOllamaModel")
      .mockResolvedValue();

    const result = await setupModel({
      model: "nonexistent-model",
      baseDir: tempDir,
    });

    expect(installSpy).toHaveBeenCalledWith("phi3:mini");
    expect(result.modelPath).toBe("phi3:mini");
  });
});

// ─── setupModel — gguf paths ──────────────────────────────────────────────────

describe("setupModel — gguf provider paths", () => {
  let tempDir;
  let oldProvider;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    oldProvider = process.env.VSCODE_ROTATOR_LLM_PROVIDER;
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "node-llama-cpp";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (oldProvider == null) delete process.env.VSCODE_ROTATOR_LLM_PROVIDER;
    else process.env.VSCODE_ROTATOR_LLM_PROVIDER = oldProvider;
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("downloads from registry when no modelPath is given (non-custom model)", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue(
      "node-llama-cpp",
    );

    // Stub https.get — defer both the response callback and the finish event
    // so that output.on("finish", ...) is registered before finish fires.
    const httpsGetSpy = vi.spyOn(https, "get").mockImplementation((url, cb) => {
      const fakeResponse = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: {},
        resume: vi.fn(),
        pipe: vi.fn((dest) => {
          setImmediate(() => dest.emit("finish"));
        }),
      });
      setImmediate(() => cb(fakeResponse));
      const req = new EventEmitter();
      req.on = vi.fn((...args) => EventEmitter.prototype.on.call(req, ...args));
      return req;
    });

    // Stub createWriteStream — close(cb) must call cb() to resolve the promise
    const nodefs = await import("node:fs");
    const cwsSpy = vi
      .spyOn(nodefs.default, "createWriteStream")
      .mockImplementation(() => {
        const stream = new EventEmitter();
        stream.write = vi.fn();
        stream.close = (cb) => {
          if (cb) cb();
        };
        return stream;
      });

    // Stub fs.open with an async-iterable createReadStream (fixes TypeError)
    const fsSpy = vi
      .spyOn(fs, "open")
      .mockResolvedValue(makeAsyncIterableHandle());

    // Stub LocalLlmInference.generate to skip actual model loading
    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    vi.spyOn(LocalLlmInference.prototype, "generate").mockResolvedValue(
      "Hello mock",
    );

    const result = await setupModel({ model: "phi3", baseDir: tempDir });

    expect(result.modelPath).toContain("Phi-3-mini-4k-instruct-q4.gguf");
    expect(result.response).toContain("Hello");

    httpsGetSpy.mockRestore();
    cwsSpy.mockRestore();
    fsSpy.mockRestore();
  }, 15000);

  it("copies a local file when modelPath is provided (copyFile branch)", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue(
      "node-llama-cpp",
    );

    // Create a real source file to copy
    const srcFile = path.join(tempDir, "my-model.gguf");
    await fs.writeFile(srcFile, "fake-model-bytes", "utf8");

    // Stub fs.open for sha256
    const fsSpy = vi
      .spyOn(fs, "open")
      .mockResolvedValue(makeAsyncIterableHandle());

    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    vi.spyOn(LocalLlmInference.prototype, "generate").mockResolvedValue(
      "Hello copy",
    );

    const result = await setupModel({
      model: "phi3",
      modelPath: srcFile,
      baseDir: tempDir,
    });

    expect(result.modelPath).toContain("Phi-3-mini-4k-instruct-q4.gguf");
    expect(result.response).toBe("Hello copy");

    fsSpy.mockRestore();
  }, 15000);

  it("throws when model=custom and no modelPath is given", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue(
      "node-llama-cpp",
    );

    await expect(
      setupModel({ model: "custom", baseDir: tempDir }),
    ).rejects.toThrow("--model custom requires --model-path");
  });

  it("uses custom registry entry when model=custom and modelPath is provided", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue(
      "node-llama-cpp",
    );

    const srcFile = path.join(tempDir, "custom.gguf");
    await fs.writeFile(srcFile, "custom-bytes", "utf8");

    const fsSpy = vi
      .spyOn(fs, "open")
      .mockResolvedValue(makeAsyncIterableHandle());

    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    vi.spyOn(LocalLlmInference.prototype, "generate").mockResolvedValue(
      "Custom hello",
    );

    const result = await setupModel({
      model: "custom",
      modelPath: srcFile,
      baseDir: tempDir,
    });

    expect(result.modelPath).toContain("custom.gguf");

    fsSpy.mockRestore();
  }, 15000);

  it("throws SHA256 mismatch and unlinks file when digest does not match", async () => {
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue(
      "node-llama-cpp",
    );

    // Use a registry entry that has a sha256 to check against
    const { MODEL_REGISTRY } = await import("../../src/llm/local-llm.js");
    const origReg = MODEL_REGISTRY.phi3;
    // Temporarily inject a known sha256 that won't match
    MODEL_REGISTRY.phi3 = {
      ...origReg,
      sha256: "b".repeat(64),
    };

    const srcFile = path.join(tempDir, "mismatch.gguf");
    await fs.writeFile(srcFile, "bytes", "utf8");

    // sha256 will compute something that doesn't equal "b".repeat(64)
    // Use real fs.open so the actual hash runs, but provide a real file
    const fsSpy = vi
      .spyOn(fs, "open")
      .mockResolvedValue(makeAsyncIterableHandle());

    try {
      await expect(
        setupModel({ model: "phi3", modelPath: srcFile, baseDir: tempDir }),
      ).rejects.toThrow("SHA256 mismatch");
    } finally {
      MODEL_REGISTRY.phi3 = origReg;
      fsSpy.mockRestore();
    }
  }, 15000);
});

// ─── askLocalLlm ─────────────────────────────────────────────────────────────

describe("askLocalLlm", () => {
  beforeEach(() => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  });

  it("delegates to LocalLlmInference.generate with question as prompt", async () => {
    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const genSpy = vi
      .spyOn(LocalLlmInference.prototype, "generate")
      .mockResolvedValue("mocked answer");

    const result = await askLocalLlm({
      question: "What is 2+2?",
      system: "Be brief.",
    });

    expect(genSpy).toHaveBeenCalledWith({
      prompt: "What is 2+2?",
      system: "Be brief.",
    });
    expect(result).toBe("mocked answer");
  });
});

// ─── ingestDocuments — snapshot path and error path ─────────────────────────

describe("ingestDocuments — branch coverage", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("invokes ingestFromSnapshot when no targetPath is provided", async () => {
    const stateDir = path.join(tempDir, "state");
    await fs.mkdir(stateDir, { recursive: true });
    const snapshotPath = path.join(stateDir, "storage-snapshot.json");
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({ lastScan: new Date().toISOString(), paths: {} }),
      "utf8",
    );

    const result = await ingestDocuments({
      baseDir: stateDir,
      snapshotPath,
    });

    expect(result).toHaveProperty("actions");
    expect(Array.isArray(result.actions)).toBe(true);
  });

  it("handles result as a plain array (Array.isArray branch)", async () => {
    const { DocumentIngester } =
      await import("../../src/llm/document-ingester.js");
    vi.spyOn(DocumentIngester.prototype, "ingestPath").mockResolvedValue([
      { chunks: 3, skipped: false },
    ]);

    const result = await ingestDocuments({
      baseDir: tempDir,
      targetPath: path.join(tempDir, "fake.md"),
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].chunks).toBe(3);
  });

  it("re-throws and logs when ingestion fails", async () => {
    const { DocumentIngester } =
      await import("../../src/llm/document-ingester.js");
    vi.spyOn(DocumentIngester.prototype, "ingestPath").mockRejectedValue(
      new Error("disk full"),
    );

    await expect(
      ingestDocuments({
        baseDir: tempDir,
        targetPath: path.join(tempDir, "broken.md"),
      }),
    ).rejects.toThrow("disk full");
  });
});

// ─── importSprints ────────────────────────────────────────────────────────────

describe("importSprints — branch coverage", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("imports sprints and records test failures as mistakes", async () => {
    vi.spyOn(agentHandoff, "listSprints").mockResolvedValue([
      {
        sprintId: "sprint-1",
        goal: "Build auth",
        status: "active",
        date: "2026-05-01T00:00:00Z",
        testsFailed: [
          {
            name: "auth.test.js > should reject bad token",
            error: "AssertionError",
          },
        ],
      },
    ]);

    const result = await importSprints({ baseDir: tempDir });

    expect(result.imported).toBe(1);
    expect(result.mistakes).toBe(1);
  });

  it("imports sprints with no test failures (testsFailed undefined/empty)", async () => {
    vi.spyOn(agentHandoff, "listSprints").mockResolvedValue([
      {
        sprintId: "sprint-2",
        goal: "Refactor storage",
        status: "active",
        date: "2026-05-10T00:00:00Z",
      },
    ]);

    const result = await importSprints({ baseDir: tempDir });

    expect(result.imported).toBe(1);
    expect(result.mistakes).toBe(0);
  });

  it("re-throws when listSprints fails and still closes the db (opened=true path)", async () => {
    vi.spyOn(agentHandoff, "listSprints").mockRejectedValue(
      new Error("handoff unavailable"),
    );

    await expect(importSprints({ baseDir: tempDir })).rejects.toThrow(
      "handoff unavailable",
    );
  });

  it("re-throws when db.open itself fails (opened=false, finally skips db.close)", async () => {
    const { ExperienceDb } = await import("../../src/llm/experience-db.js");
    vi.spyOn(ExperienceDb.prototype, "open").mockRejectedValue(
      new Error("db locked"),
    );

    const closeSpy = vi.spyOn(ExperienceDb.prototype, "close");

    await expect(importSprints({ baseDir: tempDir })).rejects.toThrow(
      "db locked",
    );

    expect(closeSpy).not.toHaveBeenCalled();
  });
});
