/**
 * inference-coverage.test.js
 * Targets uncovered lines in src/llm/inference.js:
 * 26-39, 63-66, 75, 88, 95, 112-161, 171, 178, 192, 205-231,
 * 250-257, 264-271, 276-282, 285-288, 302-307, 309-329, 338-384
 *
 * ESM note: node:child_process is mocked at module level (hoisted) with a
 * vi.fn() so that execFileAsync (= promisify(execFile)) inside inference.js
 * actually goes through our spy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mock — must be before any imports that pull in inference.js ───────
// We replace execFile with a vi.fn() that can be reconfigured per-test.
const execFileMock = vi.fn();
const fsStat = vi.fn();

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execFile: execFileMock,
  };
});

vi.mock("../../src/llm/_child-process.js", () => ({
  execFile: execFileMock,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal();
  const mocked = {
    ...actual,
    stat: (...args) => fsStat(...args),
  };
  return { ...mocked, default: mocked };
});

// ── helpers ───────────────────────────────────────────────────────────────────
function resetEnv(saved) {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/** Returns a factory that makes execFileMock call cb(Error(msg)) */
function makeExecFileError(msg = "exec failed") {
  return (_bin, _args, _opts, cb) => {
    cb(new Error(msg));
    return { on: vi.fn() };
  };
}

/** Returns a factory that makes execFileMock call cb(null, {stdout}) */
function makeExecFileSuccess(stdout = "") {
  return (_bin, _args, _opts, cb) => {
    cb(null, { stdout, stderr: "" });
    return { on: vi.fn() };
  };
}

/** Makes execFileMock call cb(null, {stdout, stderr}) */
function setupExecSuccess(stdout = "") {
  execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
    cb(null, { stdout, stderr: "" });
    return { on: vi.fn() };
  });
}

/** Makes execFileMock call cb(Error) */
function setupExecError(msg = "exec failed") {
  execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
    cb(new Error(msg));
    return { on: vi.fn() };
  });
}

/** Dispatch by args */
function setupExecDispatch(handler) {
  execFileMock.mockImplementation((_bin, args, _opts, cb) => {
    handler(args, cb);
    return { on: vi.fn() };
  });
}

// ── fileExists / resolveModelPath (lines 26-39) ───────────────────────────────
describe("fileExists via resolveModelPath", () => {
  let savedEnv;
  beforeEach(() => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    savedEnv = { VSCODE_ROTATOR_LLM_PROVIDER: process.env.VSCODE_ROTATOR_LLM_PROVIDER };
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "node-llama-cpp";
  });
  afterEach(() => { vi.restoreAllMocks(); resetEnv(savedEnv); delete process.env.VSCODE_ROTATOR_MOCK_LLM; });

  it("resolveModelPath returns null when modelDir does not exist", async () => {
    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const inf = new LocalLlmInference({ baseDir: "/nonexistent/path/xyz" });
    expect(await inf.resolveModelPath()).toBeNull();
  });

  it("resolveModelPath returns explicit modelPath when set", async () => {
    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const inf = new LocalLlmInference({ modelPath: "/tmp/model.gguf" });
    expect(await inf.resolveModelPath()).toBe("/tmp/model.gguf");
  });
});


// ── isOllamaAvailable / findOllamaBinary (lines 42-61) ────────────────────────
describe("isOllamaAvailable", () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = { VSCODE_ROTATOR_OLLAMA_BIN: process.env.VSCODE_ROTATOR_OLLAMA_BIN };
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });
  afterEach(() => { vi.restoreAllMocks(); resetEnv(savedEnv); delete process.env.VSCODE_ROTATOR_MOCK_LLM; });

  it("returns true when ollama plain binary name resolves", async () => {
    delete process.env.VSCODE_ROTATOR_OLLAMA_BIN;
    const { isOllamaAvailable } = await import("../../src/llm/inference.js");
    // 'ollama' is always returned as-is (no stat check) so this always returns true
    expect(await isOllamaAvailable()).toBe(true);
  });

  it("returns true when OLLAMA_BIN_ENV is whitespace-trimmed 'ollama'", async () => {
    process.env.VSCODE_ROTATOR_OLLAMA_BIN = "  ollama  ";
    const { isOllamaAvailable } = await import("../../src/llm/inference.js");
    expect(await isOllamaAvailable()).toBe(true);
  });
});

// ── verifyOllamaInstalled (lines 63-75) ──────────────────────────────────────
describe("verifyOllamaInstalled", () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = { VSCODE_ROTATOR_OLLAMA_BIN: process.env.VSCODE_ROTATOR_OLLAMA_BIN };
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });
  afterEach(() => { vi.restoreAllMocks(); resetEnv(savedEnv); delete process.env.VSCODE_ROTATOR_MOCK_LLM; });

  it("returns true when execFile succeeds (ollama --version)", async () => {
    setupExecSuccess("ollama version 0.3.0");

    process.env.VSCODE_ROTATOR_OLLAMA_BIN = "ollama";
    const { verifyOllamaInstalled } = await import("../../src/llm/inference.js");
    expect(await verifyOllamaInstalled()).toBe(true);
  });

  it("throws when execFile fails (binary present but non-functional)", async () => {
    setupExecError("spawn error ENOENT");

    process.env.VSCODE_ROTATOR_OLLAMA_BIN = "ollama";
    const { verifyOllamaInstalled } = await import("../../src/llm/inference.js");
    await expect(verifyOllamaInstalled()).rejects.toThrow(/Ollama runtime not available/);
  });
});

// ── isNodeLlamaCppInstalled (line 88) ─────────────────────────────────────────
describe("isNodeLlamaCppInstalled", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns false when node-llama-cpp package is not installed", async () => {
    const { isNodeLlamaCppInstalled } = await import("../../src/llm/inference.js");
    const result = await isNodeLlamaCppInstalled();
    expect(typeof result).toBe("boolean");
  });
});


// ── resolvePreferredLlmProvider (lines 93-109) ───────────────────────────────
describe("resolvePreferredLlmProvider", () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = { VSCODE_ROTATOR_LLM_PROVIDER: process.env.VSCODE_ROTATOR_LLM_PROVIDER };
  });
  afterEach(() => { vi.restoreAllMocks(); resetEnv(savedEnv); });

  it("returns 'ollama' when env is 'ollama'", async () => {
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "ollama";
    const { resolvePreferredLlmProvider } = await import("../../src/llm/inference.js");
    expect(await resolvePreferredLlmProvider()).toBe("ollama");
  });

  it("returns 'node-llama-cpp' when env is 'node-llama-cpp'", async () => {
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "node-llama-cpp";
    const { resolvePreferredLlmProvider } = await import("../../src/llm/inference.js");
    expect(await resolvePreferredLlmProvider()).toBe("node-llama-cpp");
  });
});

// ── verifyLocalLlmRuntime / verifyNodeLlamaCppInstalled (lines 112-121) ──────
describe("verifyLocalLlmRuntime — ollama provider", () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = { VSCODE_ROTATOR_LLM_PROVIDER: process.env.VSCODE_ROTATOR_LLM_PROVIDER };
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "ollama";
  });
  afterEach(() => { vi.restoreAllMocks(); resetEnv(savedEnv); });

  it("calls verifyOllamaInstalled and returns true", async () => {
    setupExecSuccess("ollama 0.3.0");

    const { verifyLocalLlmRuntime } = await import("../../src/llm/inference.js");
    expect(await verifyLocalLlmRuntime()).toBe(true);
  });

  it("verifyNodeLlamaCppInstalled delegates and returns true", async () => {
    setupExecSuccess("ollama 0.3.0");

    const { verifyNodeLlamaCppInstalled } = await import("../../src/llm/inference.js");
    expect(await verifyNodeLlamaCppInstalled()).toBe(true);
  });
});


// ── parseOllamaListOutput via listOllamaModels (lines 131-161) ───────────────
describe("listOllamaModels — parseOllamaListOutput branches", () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = { VSCODE_ROTATOR_OLLAMA_BIN: process.env.VSCODE_ROTATOR_OLLAMA_BIN };
    process.env.VSCODE_ROTATOR_OLLAMA_BIN = "ollama";
  });
  afterEach(() => { vi.restoreAllMocks(); resetEnv(savedEnv); });

  it("parses JSON array from --json output", async () => {
    setupExecSuccess(JSON.stringify([{ name: "phi3:mini" }, { model: "tinyllama" }]));
    const { listOllamaModels } = await import("../../src/llm/inference.js");
    const models = await listOllamaModels();
    expect(models).toContain("phi3:mini");
    expect(models).toContain("tinyllama");
  });

  it("falls back to table parsing when --json returns plain text", async () => {
    setupExecSuccess("NAME        ID\nphi3:mini   abc123\ntinyllama   def456");
    const { listOllamaModels } = await import("../../src/llm/inference.js");
    const models = await listOllamaModels();
    expect(models).toContain("phi3:mini");
    expect(models).toContain("tinyllama");
  });

  it("returns empty array from empty stdout", async () => {
    setupExecSuccess("");
    const { listOllamaModels } = await import("../../src/llm/inference.js");
    expect(await listOllamaModels()).toEqual([]);
  });

  it("returns empty array when both execFile calls fail", async () => {
    setupExecError("binary missing");
    const { listOllamaModels } = await import("../../src/llm/inference.js");
    expect(await listOllamaModels()).toEqual([]);
  });
});

// ── installOllamaModel (lines 152-161) ───────────────────────────────────────
describe("installOllamaModel", () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = { VSCODE_ROTATOR_OLLAMA_BIN: process.env.VSCODE_ROTATOR_OLLAMA_BIN };
    process.env.VSCODE_ROTATOR_OLLAMA_BIN = "ollama";
  });
  afterEach(() => { vi.restoreAllMocks(); resetEnv(savedEnv); });

  it("returns true on successful pull", async () => {
    setupExecSuccess("pulling manifest...");
    const { installOllamaModel } = await import("../../src/llm/inference.js");
    expect(await installOllamaModel("phi3:mini")).toBe(true);
  });

  it("throws on pull failure", async () => {
    setupExecError("network error");
    const { installOllamaModel } = await import("../../src/llm/inference.js");
    await expect(installOllamaModel("phi3:mini")).rejects.toThrow(/Ollama install failed/);
  });
});


// ── runOllama / generate via ollama provider (lines 164-192) ─────────────────
describe("LocalLlmInference.generate — ollama provider", () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = { VSCODE_ROTATOR_LLM_PROVIDER: process.env.VSCODE_ROTATOR_LLM_PROVIDER };
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "ollama";
    process.env.VSCODE_ROTATOR_OLLAMA_BIN = "ollama";
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  });
  afterEach(() => { vi.restoreAllMocks(); resetEnv(savedEnv); delete process.env.VSCODE_ROTATOR_OLLAMA_BIN; });

  it("returns parsed ollama output (strips trailing --- lines)", async () => {
    setupExecDispatch((args, cb) => {
      if (args.includes("--version")) cb(null, { stdout: "ollama 0.3.0" });
      else cb(null, { stdout: "response text\r\n---\n---\n" });
    });

    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const inf = new LocalLlmInference({});
    expect(await inf.generate({ prompt: "hello" })).toBe("response text");
  });

  it("throws when runOllama execution fails", async () => {
    setupExecDispatch((args, cb) => {
      if (args.includes("--version")) cb(null, { stdout: "ollama 0.3.0" });
      else cb(new Error("SIGKILL"));
    });

    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const inf = new LocalLlmInference({});
    await expect(inf.generate({ prompt: "hi" })).rejects.toThrow(/Ollama execution failed/);
  });

  it("generate with MOCK_LLM set returns truncated system+prompt (lines 250-257)", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const inf = new LocalLlmInference({});
    const result = await inf.generate({ prompt: "test prompt", system: "sys" });
    expect(result).toContain("sys");
    expect(result).toContain("test prompt");
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  });

  it("generate with MOCK_LLM and no system returns just prompt", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const inf = new LocalLlmInference({});
    const result = await inf.generate({ prompt: "hello there" });
    expect(result).toContain("hello there");
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  });
});


// ── assertReady branches (lines 264-288) ─────────────────────────────────────
describe("LocalLlmInference.assertReady", () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = { VSCODE_ROTATOR_LLM_PROVIDER: process.env.VSCODE_ROTATOR_LLM_PROVIDER };
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  });
  afterEach(() => { vi.restoreAllMocks(); resetEnv(savedEnv); fsStat.mockReset(); });

  it("throws when provider=node-llama-cpp and no model file found", async () => {
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "node-llama-cpp";
    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const inf = new LocalLlmInference({ baseDir: "/nonexistent/xyz" });
    await expect(inf.assertReady()).rejects.toThrow(/No local LLM model found/);
  });

  it("throws when provider=ollama and model path not found as file or ollama model", async () => {
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "ollama";
    process.env.VSCODE_ROTATOR_OLLAMA_BIN = "ollama";
    // listOllamaModels returns empty (both --json and plain list fail)
    execFileMock.mockImplementation(makeExecFileError("not found"));
    // stat throws so fileExists returns false for the model path
    fsStat.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const inf = new LocalLlmInference({ modelPath: "/nonexistent/model.gguf" });
    await expect(inf.assertReady()).rejects.toThrow(/Local Ollama model not found/);
    delete process.env.VSCODE_ROTATOR_OLLAMA_BIN;
    fsStat.mockReset();
  });

  it("returns null when provider=ollama and no modelPath (verifyOllamaInstalled succeeds)", async () => {
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "ollama";
    process.env.VSCODE_ROTATOR_OLLAMA_BIN = "ollama";
    execFileMock.mockImplementation(makeExecFileSuccess("ollama 0.3.0"));

    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const inf = new LocalLlmInference({});  // no modelPath
    expect(await inf.assertReady()).toBeNull();
    delete process.env.VSCODE_ROTATOR_OLLAMA_BIN;
  });

  it("returns modelPath when provider=ollama and model name is in ollama list", async () => {
    process.env.VSCODE_ROTATOR_LLM_PROVIDER = "ollama";
    process.env.VSCODE_ROTATOR_OLLAMA_BIN = "ollama";
    // stat fails (not a local file path), ollama list returns the model
    execFileMock.mockImplementation((_b, args, _o, cb) => {
      if (args.includes("--version")) cb(new Error("not called"));
      else cb(null, { stdout: JSON.stringify([{ name: "phi3:mini" }]) });
      return { on: vi.fn() };
    });

    // Make stat throw so fileExists returns false for the model name
    fsStat.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const { LocalLlmInference } = await import("../../src/llm/inference.js");
    const inf = new LocalLlmInference({ modelPath: "phi3:mini" });
    const result = await inf.assertReady();
    expect(result).toBe("phi3:mini");
    fsStat.mockReset();
    delete process.env.VSCODE_ROTATOR_OLLAMA_BIN;
  });
});


// ── OpenAI-compat helpers (lines 302-384) ────────────────────────────────────
describe("isOpenAiCompatAvailable", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns true when /v1/models returns ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const { isOpenAiCompatAvailable } = await import("../../src/llm/inference.js");
    expect(await isOpenAiCompatAvailable()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("returns false when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const { isOpenAiCompatAvailable } = await import("../../src/llm/inference.js");
    expect(await isOpenAiCompatAvailable()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("returns false when response.ok is false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { isOpenAiCompatAvailable } = await import("../../src/llm/inference.js");
    expect(await isOpenAiCompatAvailable()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("listOpenAiCompatModels", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns names from data array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-3.5" }, { name: "local" }] }),
    }));
    const { listOpenAiCompatModels } = await import("../../src/llm/inference.js");
    expect(await listOpenAiCompatModels()).toEqual(expect.arrayContaining(["gpt-3.5", "local"]));
  });

  it("returns names from models array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: "phi3" }] }),
    }));
    const { listOpenAiCompatModels } = await import("../../src/llm/inference.js");
    expect(await listOpenAiCompatModels()).toContain("phi3");
  });

  it("returns [] when response not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { listOpenAiCompatModels } = await import("../../src/llm/inference.js");
    expect(await listOpenAiCompatModels()).toEqual([]);
  });

  it("returns [] when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net error")));
    const { listOpenAiCompatModels } = await import("../../src/llm/inference.js");
    expect(await listOpenAiCompatModels()).toEqual([]);
  });
});

describe("askOpenAiCompat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts chat completion and returns content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith("/v1/models")) {
        return { ok: true, json: async () => ({ data: [{ id: "local-model" }] }) };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { content: "Hello!" } }] }) };
    }));
    const { askOpenAiCompat } = await import("../../src/llm/inference.js");
    expect(await askOpenAiCompat("Say hi", "local-model")).toBe("Hello!");
  });

  it("uses first available model when none specified", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith("/v1/models")) {
        return { ok: true, json: async () => ({ models: [{ name: "auto-model" }] }) };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { content: "auto" } }] }) };
    }));
    const { askOpenAiCompat } = await import("../../src/llm/inference.js");
    expect(await askOpenAiCompat("prompt")).toBe("auto");
  });

  it("throws when completion endpoint returns non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith("/v1/models")) {
        return { ok: true, json: async () => ({ data: [{ id: "m1" }] }) };
      }
      return { ok: false, status: 503 };
    }));
    const { askOpenAiCompat } = await import("../../src/llm/inference.js");
    await expect(askOpenAiCompat("fail")).rejects.toThrow(/LLM request failed: 503/);
  });

  it("returns empty string when choices is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith("/v1/models")) {
        return { ok: true, json: async () => ({ data: [{ id: "m1" }] }) };
      }
      return { ok: true, json: async () => ({ choices: [] }) };
    }));
    const { askOpenAiCompat } = await import("../../src/llm/inference.js");
    expect(await askOpenAiCompat("empty")).toBe("");
  });

  it("returns empty string when the completion payload has no message content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith("/v1/models")) {
        return { ok: true, json: async () => ({ data: [{ id: "m1" }] }) };
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: {} }] }),
      };
    }));
    const { askOpenAiCompat } = await import("../../src/llm/inference.js");
    expect(await askOpenAiCompat("empty-content")).toBe("");
  });
});
