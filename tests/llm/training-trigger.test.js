/**
 * training-trigger.test.js
 *
 * Unit tests for src/llm/training-trigger.js.
 *
 * Strategy: mock ../../src/llm/_child-process.js (the user-land wrapper)
 * rather than node:child_process directly.  This matches the established
 * convention used by inference-windows.test.js and ensures Vitest can
 * intercept the spawn call regardless of how Vite externalises node: built-ins.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Hoist the mock before any import that pulls in training-trigger.js
// ---------------------------------------------------------------------------
const spawnMock = vi.fn();

vi.mock("../../src/llm/_child-process.js", () => ({
  spawn: spawnMock,
  // keep execFile available so any transitive import doesn't break
  execFile: vi.fn(),
}));

// Import under test AFTER mock is registered
const { triggerLoraTraining } = await import(
  "../../src/llm/training-trigger.js"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal ChildProcess-like EventEmitter that can emit 'close'.
 */
function makeFakeProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

let statMock;
let readdirMock;

// ---------------------------------------------------------------------------
// spawn invocation
// ---------------------------------------------------------------------------
describe("triggerLoraTraining — spawn invocation", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    statMock = vi.spyOn(fs, "stat").mockRejectedValue(new Error("no path"));
    readdirMock = vi.spyOn(fs, "readdir").mockRejectedValue(
      new Error("no dir"),
    );
  });

  afterEach(() => {
    statMock.mockRestore();
    readdirMock.mockRestore();
  });

  it("calls spawn with the confirmed wt.exe / wsl.exe unsloth train command", async () => {
    const fakeProc = makeFakeProcess();
    spawnMock.mockReturnValue(fakeProc);

    const datasetPath = "/path/to/export.jsonl";
    const promise = triggerLoraTraining(datasetPath);

    await new Promise((resolve) => setImmediate(resolve));
    fakeProc.emit("close", 0);

    await promise;

    expect(spawnMock).toHaveBeenCalledOnce();

    const [cmd, args, opts] = spawnMock.mock.calls[0];

    expect(cmd).toBe("wt.exe");
    expect(args).toEqual([
      "wsl.exe",
      "-d",
      "Ubuntu-22.04",
      "--",
      "bash",
      "-l",
      "-c",
      `exec '/home/pawan/.unsloth/studio/unsloth_studio/bin/unsloth' train --model 'phi3' --local-dataset '${datasetPath}' --format-type jsonl --output-dir '/home/pawan/.local/share/unsloth/outputs'`,
    ]);
    expect(opts).toBeDefined();
  });

  it("passes --model-path when provided", async () => {
    const fakeProc = makeFakeProcess();
    spawnMock.mockReturnValue(fakeProc);

    const datasetPath = "/path/to/export.jsonl";
    const modelPath = "/home/pawan/models/custom.gguf";

    statMock.mockImplementation(async (filePath) => {
      if (filePath === modelPath) {
        return { isFile: () => true, isDirectory: () => false };
      }
      throw new Error("not found");
    });

    const promise = triggerLoraTraining(datasetPath, { modelPath });

    await new Promise((resolve) => setImmediate(resolve));
    fakeProc.emit("close", 0);
    await promise;

    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe("wt.exe");
    expect(args[7]).toContain(`--model '${modelPath}'`);
    expect(args[7]).toContain(`--local-dataset '${datasetPath}'`);
    expect(args[7]).toContain("--format-type jsonl");
    expect(args[7]).toContain("--output-dir '/home/pawan/.local/share/unsloth/outputs'");
  });

  it("prefers safetensors from HF hub cache when present", async () => {
    const fakeProc = makeFakeProcess();
    spawnMock.mockReturnValue(fakeProc);

    const datasetPath = "/path/to/export.jsonl";
    const hfHubDir = path.join(os.homedir(), ".cache", "huggingface", "hub");
    const modelDir = path.join(hfHubDir, "models--Qwen--Qwen3.6-27B");
    const safetensorsPath = path.join(modelDir, "Qwen3.6-27B.safetensors");

    // stat for hub and model file
    statMock.mockImplementation(async (p) => {
      if (p === modelDir) return { isFile: () => false, isDirectory: () => true };
      if (p === safetensorsPath) return { isFile: () => true, isDirectory: () => false };
      throw new Error("not found");
    });

    // readdir for hub and model dir
    readdirMock.mockImplementation(async (dir, opts) => {
      if (dir === path.join(os.homedir(), ".cache", "huggingface", "hub")) {
        return [{ name: "models--Qwen--Qwen3.6-27B", isFile: () => false, isDirectory: () => true }];
      }
      if (dir === modelDir) {
        return [{ name: "Qwen3.6-27B.safetensors", isFile: () => true, isDirectory: () => false }];
      }
      throw new Error("not found");
    });

    const promise = triggerLoraTraining(datasetPath);
    await new Promise((resolve) => setImmediate(resolve));
    fakeProc.emit("close", 0);
    await promise;

    const [cmd, args] = spawnMock.mock.calls[0];
    expect(args[7]).toContain(`--model '${safetensorsPath}'`);
    expect(args[7]).toContain(`--local-dataset '${datasetPath}'`);
    expect(args[7]).toContain("--format-type jsonl");
  });

  it("discovers a local .gguf model automatically from mounted model directories", async () => {
    const fakeProc = makeFakeProcess();
    spawnMock.mockReturnValue(fakeProc);

    const datasetPath = "/path/to/export.jsonl";
    const discoveredModelPath = "/mnt/d/ai/models/Qwen3-Coder-30B-A3B-Instruct-Q5_K_M.gguf";

    statMock.mockImplementation(async (filePath) => {
      if (filePath === "/mnt/d/ai/models") {
        return { isFile: () => false, isDirectory: () => true };
      }
      if (filePath === discoveredModelPath) {
        return { isFile: () => true, isDirectory: () => false };
      }
      throw new Error("not found");
    });

    readdirMock.mockImplementation(async (dir, opts) => {
      if (dir === "/mnt/d/ai/models") {
        return [
          { name: "Qwen3-Coder-30B-A3B-Instruct-Q5_K_M.gguf", isFile: () => true, isDirectory: () => false },
        ];
      }
      throw new Error("not found");
    });

    const promise = triggerLoraTraining(datasetPath);
    await new Promise((resolve) => setImmediate(resolve));
    fakeProc.emit("close", 0);
    await promise;

    const [cmd, args] = spawnMock.mock.calls[0];
    expect(args[7]).toContain(`--model '${discoveredModelPath}'`);
    expect(args[7]).toContain(`--local-dataset '${datasetPath}'`);
    expect(args[7]).toContain("--format-type jsonl");
  });
});

// ---------------------------------------------------------------------------
// Promise resolution / rejection based on 'close' exit code
// ---------------------------------------------------------------------------
describe("triggerLoraTraining — promise resolution", () => {
  let statMock;
  let readdirMock;

  beforeEach(() => {
    spawnMock.mockReset();
    statMock = vi.spyOn(fs, "stat").mockRejectedValue(new Error("no path"));
    readdirMock = vi.spyOn(fs, "readdir").mockRejectedValue(new Error("no dir"));
  });

  afterEach(() => {
    statMock.mockRestore();
    readdirMock.mockRestore();
  });

  it("resolves when the spawned process emits close with code 0", async () => {
    const fakeProc = makeFakeProcess();
    spawnMock.mockReturnValue(fakeProc);

    const promise = triggerLoraTraining("/some/dataset.jsonl");
    await new Promise((resolve) => setImmediate(resolve));
    fakeProc.emit("close", 0);

    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects when the spawned process emits close with code 1", async () => {
    const fakeProc = makeFakeProcess();
    spawnMock.mockReturnValue(fakeProc);

    const promise = triggerLoraTraining("/some/dataset.jsonl");
    await new Promise((resolve) => setImmediate(resolve));
    fakeProc.emit("close", 1);

    await expect(promise).rejects.toThrow();
  });

  it("rejects with a message containing the non-zero exit code", async () => {
    const fakeProc = makeFakeProcess();
    spawnMock.mockReturnValue(fakeProc);

    const promise = triggerLoraTraining("/some/dataset.jsonl");
    await new Promise((resolve) => setImmediate(resolve));
    fakeProc.emit("close", 2);

    await expect(promise).rejects.toThrow("2");
  });
});
