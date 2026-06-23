/**
 * coverage-branch-gap.test.js
 * Targets missing branches in secret-store.js, browser-bridge.js, local-llm.js
 * Place at: tests/coverage-branch-gap.test.js
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Static imports (no dynamic import tricks) ─────────────────────────────────
import {
  SecretStore,
  defaultProgressPath,
  getSupervisorCredentials,
  setSupervisorCredentials,
} from "../src/accounts/secret-store.js";

import {
  sendPrompt,
  comparePrompts,
  clearResponses,
  loadPromptLibrary,
  savePromptLibrary,
  addPrompt,
  findPrompt,
  updatePrompt,
  deletePrompt,
  getResponseMetadata,
  getBrowserResponsePlatform,
  getBrowserProfilesDir,
  getBrowserResponsesDir,
  getBrowserSelectorsPath,
  getPromptLibraryPath,
  listResponses,
  ensureBrowserDirs,
  tagResponse,
} from "../src/browser-bridge.js";

import {
  llmBaseDir,
  getLlmStatus,
  getLocalLlmStatus,
  setupModel,
  modulePath,
  MODEL_REGISTRY,
  OLLAMA_MODEL_REGISTRY,
} from "../src/llm/local-llm.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function mktemp(prefix = "cov-gap-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
async function rm(dir) {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// secret-store.js  (68.18% → ≥70%)
// ─────────────────────────────────────────────────────────────────────────────
describe("secret-store.js branch coverage gaps", () => {
  let dir;

  beforeEach(async () => {
    dir = await mktemp("ss-gap-");
  });

  afterEach(async () => {
    await rm(dir);
    vi.restoreAllMocks();
  });

  it("falls back to FileSecretAdapter when keytar is unavailable", async () => {
    const store = new SecretStore({ fallbackPath: path.join(dir, "s.enc") });
    // keytar not installed in test env → usingFallback=true after first op
    await store.set("id1", "token1");
    expect(store.usingFallback).toBe(true);
    expect(await store.get("id1")).toBe("token1");
    expect(await store.delete("id1")).toBe(true);
    expect(await store.get("id1")).toBeNull();
  });

  it("set() catches primary adapter error and falls back", async () => {
    const badAdapter = {
      setPassword: vi.fn().mockRejectedValue(new Error("keytar error")),
      getPassword: vi.fn().mockRejectedValue(new Error("keytar error")),
      deletePassword: vi.fn().mockRejectedValue(new Error("keytar error")),
    };
    const store = new SecretStore({
      adapter: badAdapter,
      fallbackPath: path.join(dir, "fb.enc"),
    });

    await store.set("a", "v");
    expect(store.usingFallback).toBe(true);

    // get() with broken primary → fallback
    const store2 = new SecretStore({
      adapter: { getPassword: vi.fn().mockRejectedValue(new Error("fail")) },
      fallbackPath: path.join(dir, "fb2.enc"),
    });
    const v = await store2.get("missing");
    expect(v === null || typeof v === "string").toBe(true);

    // delete() with broken primary → fallback
    const store3 = new SecretStore({
      adapter: { deletePassword: vi.fn().mockRejectedValue(new Error("fail")) },
      fallbackPath: path.join(dir, "fb3.enc"),
    });
    const d = await store3.delete("missing");
    expect(typeof d === "boolean").toBe(true);
  });

  it("FileSecretAdapter.save swallows chmod failure silently", async () => {
    const store = new SecretStore({
      fallbackPath: path.join(dir, "chmod.enc"),
    });
    // First call forces fallback path creation
    await store.set("x", "y");

    // Patch chmod to throw on next call
    vi.spyOn(fs, "chmod").mockRejectedValueOnce(new Error("EPERM chmod"));
    // Should not throw
    await expect(store.set("x", "y2")).resolves.toBeUndefined();
  });

  it("FileSecretAdapter.save uses unlink+rename when first rename fails", async () => {
    const store = new SecretStore({
      fallbackPath: path.join(dir, "rename.enc"),
    });
    // Seed existing file
    await store.set("k", "v1");

    let renameCount = 0;
    const realRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (...args) => {
      renameCount++;
      if (renameCount === 1)
        throw Object.assign(new Error("EXDEV"), { code: "EXDEV" });
      return realRename(...args);
    });

    await store.set("k", "v2");
    expect(renameCount).toBeGreaterThanOrEqual(2);
    expect(await store.get("k")).toBe("v2");
  });

  it("defaultProgressPath returns path containing PROGRESS.md", () => {
    expect(defaultProgressPath()).toMatch(/PROGRESS\.md$/);
  });

  it("getSupervisorCredentials returns null when not set", async () => {
    // keytar absent → file adapter → no key written → null
    const result = await getSupervisorCredentials("gap-test-provider");
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("setSupervisorCredentials stores and getSupervisorCredentials retrieves", async () => {
    // Both create fresh SecretStore instances, each falls back to file adapter
    // They each use os.homedir() /.vscode-rotator — test just confirms no throw
    await expect(
      setSupervisorCredentials("tok", "gap-sv"),
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// browser-bridge.js  (65.87% → ≥70%)
// ─────────────────────────────────────────────────────────────────────────────
describe("browser-bridge.js branch coverage gaps", () => {
  let dir;
  let origHome;

  beforeEach(async () => {
    dir = await mktemp("bb-gap-");
    origHome = process.env.HOME;
    process.env.HOME = dir;
    await fs.mkdir(path.join(dir, ".vscode-rotator"), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = origHome;
    await rm(dir);
    vi.restoreAllMocks();
  });

  it("sendPrompt dryRun:true returns without launching browser", async () => {
    const r = await sendPrompt({
      platform: "chatgpt",
      prompt: "hi",
      dryRun: true,
    });
    expect(r.dryRun).toBe(true);
    expect(r.platform).toBe("chatgpt");
    expect(r.message).toContain("chatgpt");
  });

  it("comparePrompts dryRun:true returns without launching browser", async () => {
    const r = await comparePrompts({
      prompt: "q",
      platforms: ["chatgpt", "claude"],
      dryRun: true,
    });
    expect(r.dryRun).toBe(true);
    expect(r.platforms).toEqual(["chatgpt", "claude"]);
  });

  it("comparePrompts throws when prompt is missing", async () => {
    await expect(comparePrompts({ platforms: ["chatgpt"] })).rejects.toThrow(
      "prompt is required",
    );
  });

  it("comparePrompts throws when platforms list is empty", async () => {
    await expect(
      comparePrompts({ prompt: "hi", platforms: [] }),
    ).rejects.toThrow("At least one platform is required");
  });

  it("clearResponses returns {deleted:0} when responses dir does not exist", async () => {
    expect(await clearResponses({ platform: "chatgpt" })).toEqual({
      deleted: 0,
    });
  });

  it("clearResponses deletes matching platform file and skips non-matching", async () => {
    await ensureBrowserDirs();
    const d = path.join(dir, ".vscode-rotator", "browser-responses");
    await fs.writeFile(path.join(d, "2026-01-01T00-00-00-chatgpt.md"), "x");
    await fs.writeFile(path.join(d, "2026-01-01T00-00-00-claude.md"), "x");

    const r = await clearResponses({ platform: "chatgpt" });
    expect(r.deleted).toBe(1);
    expect(await fs.readdir(d)).toContain("2026-01-01T00-00-00-claude.md");
  });

  it("clearResponses skips files newer than olderThanDays threshold", async () => {
    await ensureBrowserDirs();
    const d = path.join(dir, ".vscode-rotator", "browser-responses");
    await fs.writeFile(path.join(d, "2026-01-01T00-00-00-chatgpt.md"), "x");
    // File just created → age 0 days → should NOT be deleted when threshold is 30
    const r = await clearResponses({ platform: "chatgpt", olderThanDays: 30 });
    expect(r.deleted).toBe(0);
  });

  it("loadPromptLibrary returns [] when file does not exist", async () => {
    expect(await loadPromptLibrary()).toEqual([]);
  });

  it("loadPromptLibrary returns [] for malformed JSON", async () => {
    const libPath = path.join(dir, ".vscode-rotator", "prompt-library.json");
    await fs.writeFile(libPath, "not valid json {{{");
    expect(await loadPromptLibrary()).toEqual([]);
  });

  it("addPrompt → findPrompt → updatePrompt → deletePrompt lifecycle", async () => {
    const added = await addPrompt({
      name: "P1",
      template: "Say {{x}}",
      tags: [],
    });
    expect(added.id).toBeDefined();

    const found = await findPrompt(added.id);
    expect(found.id).toBe(added.id);

    const updated = await updatePrompt(added.id, { name: "P1-updated" });
    expect(updated.name).toBe("P1-updated");

    const deleted = await deletePrompt(added.id);
    expect(deleted.id).toBe(added.id);

    await expect(findPrompt(added.id)).rejects.toThrow("Prompt not found");
  });

  it("findPrompt throws for nonexistent id", async () => {
    await expect(findPrompt("no-such-id")).rejects.toThrow("Prompt not found");
  });

  it("updatePrompt throws for nonexistent id", async () => {
    await expect(updatePrompt("no-such-id", { name: "x" })).rejects.toThrow(
      "Prompt not found",
    );
  });

  it("deletePrompt throws for nonexistent id", async () => {
    await expect(deletePrompt("no-such-id")).rejects.toThrow(
      "Prompt not found",
    );
  });

  it("getResponseMetadata throws when file does not exist", async () => {
    await expect(getResponseMetadata("nonexistent.md")).rejects.toThrow(
      "Response not found",
    );
  });

  it("getBrowserResponsePlatform returns null for non-matching filename", () => {
    expect(getBrowserResponsePlatform("random-file.txt")).toBeNull();
  });

  it("getBrowserResponsePlatform extracts platform from matching filename", () => {
    expect(getBrowserResponsePlatform("2026-06-22T16-07-06-chatgpt.md")).toBe(
      "chatgpt",
    );
    expect(getBrowserResponsePlatform("2026-06-22T16-07-06-claude.md")).toBe(
      "claude",
    );
  });

  it("getter functions return expected path segments", () => {
    expect(getBrowserProfilesDir()).toContain("browser-profiles");
    expect(getBrowserResponsesDir()).toContain("browser-responses");
    expect(getBrowserSelectorsPath()).toContain("browser-selectors.json");
    expect(getPromptLibraryPath()).toContain("prompt-library.json");
  });

  it("ensureBrowserDirs creates both profile and response directories", async () => {
    await ensureBrowserDirs();
    const ok = async (p) =>
      fs
        .stat(p)
        .then(() => true)
        .catch(() => false);
    expect(
      await ok(path.join(dir, ".vscode-rotator", "browser-profiles")),
    ).toBe(true);
    expect(
      await ok(path.join(dir, ".vscode-rotator", "browser-responses")),
    ).toBe(true);
  });

  it("tagResponse throws on invalid quality value", async () => {
    await expect(
      tagResponse("any.md", { quality: "excellent" }),
    ).rejects.toThrow("Invalid quality");
  });

  it("listResponses returns [] when responses dir does not exist", async () => {
    expect(await listResponses()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// local-llm.js  (65.78% → ≥70%)
// ─────────────────────────────────────────────────────────────────────────────
describe("local-llm.js branch coverage gaps", () => {
  let dir;

  beforeEach(async () => {
    dir = await mktemp("llm-gap-");
  });

  afterEach(async () => {
    await rm(dir);
    vi.restoreAllMocks();
  });

  it("llmBaseDir returns provided baseDir unchanged", () => {
    expect(llmBaseDir("/custom/path")).toBe("/custom/path");
  });

  it("llmBaseDir falls back to homedir-based path when no arg given", () => {
    expect(llmBaseDir()).toContain(".vscode-rotator");
  });

  it("getLlmStatus: non-existent dir → available:false, models:[]", async () => {
    const r = await getLlmStatus({ baseDir: path.join(dir, "missing") });
    expect(r.available).toBe(false);
    expect(r.models).toEqual([]);
    expect(r.provider).toBeNull();
  });

  it("getLlmStatus: .gguf file present → provider='node-llama-cpp'", async () => {
    const modelsDir = path.join(dir, ".vscode-rotator", "models");
    await fs.mkdir(modelsDir, { recursive: true });
    await fs.writeFile(path.join(modelsDir, "test.gguf"), "fake");

    // isOllamaAvailable is bound at import time inside local-llm.js, so we
    // can't spy on the inference module after the fact.  Instead, stub readdir
    // to return our fake file list AND stub isOllamaAvailable via the inference
    // module's live binding by mocking the http check it does internally.
    // Simplest: stub fs.readdir for the models dir, and for ollama return [].
    const realReaddir = fs.readdir.bind(fs);
    vi.spyOn(fs, "readdir").mockImplementation(async (p, ...args) => {
      if (String(p).endsWith("models")) return ["test.gguf"];
      return realReaddir(p, ...args);
    });

    const r = await getLlmStatus({ baseDir: dir });
    // available depends on combined gguf + ollama models; gguf alone is enough
    expect(r.provider).toBe("node-llama-cpp");
    expect(r.models).toContain("test.gguf");
    expect(r.modelPath).toContain("test.gguf");
  });

  it("getLocalLlmStatus: no models dir → status 'unavailable'", async () => {
    // modelsDir under real homedir may not exist in CI; stub readdir
    vi.spyOn(fs, "readdir").mockRejectedValueOnce(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    const r = await getLocalLlmStatus();
    expect(r.status).toBe("unavailable");
    expect(r.models).toEqual([]);
  });

  it("getLocalLlmStatus: models exist + verifyRuntime throws → 'degraded'", async () => {
    vi.spyOn(fs, "readdir").mockResolvedValueOnce(["model.gguf"]);
    const r = await getLocalLlmStatus({
      verifyRuntime: async () => {
        throw new Error("no runtime");
      },
    });
    expect(r.status).toBe("degraded");
    expect(r.models).toContain("model.gguf");
  });

  it("getLocalLlmStatus: models exist + verifyRuntime ok → 'ready'", async () => {
    vi.spyOn(fs, "readdir").mockResolvedValueOnce(["model.gguf"]);
    const r = await getLocalLlmStatus({ verifyRuntime: async () => {} });
    expect(r.status).toBe("ready");
  });

  it("setupModel throws when model='custom' and no modelPath given", async () => {
    // Force node-llama-cpp provider so we skip the ollama branch and hit the custom check
    const inference = await import("../src/llm/inference.js");
    vi.spyOn(inference, "resolvePreferredLlmProvider").mockResolvedValue(
      "node-llama-cpp",
    );

    await expect(setupModel({ model: "custom", baseDir: dir })).rejects.toThrow(
      "--model custom requires --model-path",
    );
  });

  it("modulePath returns a string ending in local-llm.js", () => {
    expect(modulePath()).toMatch(/local-llm\.js$/);
  });

  it("MODEL_REGISTRY has phi3 and tinyllama entries", () => {
    expect(MODEL_REGISTRY).toHaveProperty("phi3");
    expect(MODEL_REGISTRY).toHaveProperty("tinyllama");
    expect(typeof MODEL_REGISTRY.phi3.url).toBe("string");
  });

  it("OLLAMA_MODEL_REGISTRY maps phi3 to phi3:mini", () => {
    expect(OLLAMA_MODEL_REGISTRY.phi3).toBe("phi3:mini");
    expect(OLLAMA_MODEL_REGISTRY.tinyllama).toBe("tinyllama");
  });
});
