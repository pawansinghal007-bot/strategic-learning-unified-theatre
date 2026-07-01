/**
 * tests/commands/browser.coverage-additions.test.js
 *
 * Targets missed branches in src/commands/browser.js:
 *   line 57 — captureAndIngest: default destructuring (outputDir=null, headless=false, timeout=60000)
 *             when options arg is omitted entirely
 *   line 109 — parseBrowserEngine: BrowserPlatformSchema succeeds → return data directly
 *              (the branch where the value is already a recognised platform string like "chromium")
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── mocks ───────────────────────────────────────────────────────────────────

vi.mock("../../src/internal/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
  assertFeatureEnabled: vi.fn(),
}));

vi.mock("../../src/browser-bridge.js", () => ({
  ensureBrowserDirs: vi.fn().mockResolvedValue(undefined),
  sendPrompt: vi.fn(),
  comparePrompts: vi.fn(),
  loadPromptLibrary: vi.fn(),
  addPrompt: vi.fn(),
  findPrompt: vi.fn(),
  deletePrompt: vi.fn(),
  runPromptTemplate: vi.fn(),
  loginToPage: vi.fn(),
  listResponses: vi.fn(),
  getResponseMetadata: vi.fn(),
  clearResponses: vi.fn(),
  tagResponse: vi.fn(),
  captureThread: vi.fn(),
  BROWSER_RESPONSES_DIR: "/fake/responses",
}));

vi.mock("../../src/llm/document-ingester.js", () => ({
  DocumentIngester: vi.fn(function () {
    this.ingestThread = vi.fn().mockResolvedValue({ chunks: 5 });
  }),
}));

vi.mock("../../src/domain/schemas.js", () => ({
  BrowserPlatformSchema: {
    safeParse: (v) =>
      ["chromium", "firefox", "webkit"].includes(v)
        ? { success: true, data: v }
        : { success: false, error: { issues: [{ message: "Invalid platform" }] } },
  },
  BrowserTypeSchema: {
    safeParse: (v) =>
      ["chrome", "safari", "firefox"].includes(v)
        ? { success: true, data: v }
        : { success: false, error: { issues: [{ message: "Invalid type" }] } },
  },
  TimeoutMsSchema: {
    parse: (v) => {
      if (typeof v !== "number" || v <= 0 || !Number.isFinite(v))
        throw Object.assign(new Error("Invalid timeout"), {
          issues: [{ message: "Timeout must be positive" }],
        });
      return v;
    },
  },
}));

vi.mock("node:fs/promises", () => ({
  default: { readFile: vi.fn() },
}));

import { captureThread } from "../../src/browser-bridge.js";
import { captureAndIngest, bindBrowserCommands } from "../../src/commands/browser.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildActions() {
  const captured = {};
  function makeNode(prefix) {
    const node = {
      description: () => node,
      requiredOption: () => node,
      option: () => node,
      action: (fn) => { captured[prefix] = fn; return node; },
      command: (name) => makeNode(prefix ? `${prefix}:${name.split(" ")[0]}` : name.split(" ")[0]),
    };
    return node;
  }
  bindBrowserCommands({ command: () => makeNode("") }, { log: null });
  return captured;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

// ─── line 57: captureAndIngest default options destructuring ─────────────────

describe("captureAndIngest — default options (line 57)", () => {
  it("uses outputDir=null, headless=false, timeout=60000 when options is omitted", async () => {
    captureThread.mockResolvedValue({
      filePath: "/tmp/t.json",
      filename: "t.json",
      turns: ["a", "b"],
      platform: "chatgpt",
    });

    // Call with only platform — no second arg at all (exercises `options = {}` default)
    const result = await captureAndIngest("chatgpt");

    expect(captureThread).toHaveBeenCalledWith("chatgpt", {
      outputDir: null,
      headless: false,
      timeout: 60000,
    });
    expect(result.chunksIngested).toBe(5);
  });

  it("uses explicit options when provided (non-default)", async () => {
    captureThread.mockResolvedValue({
      filePath: "/tmp/t.json",
      filename: "t.json",
      turns: ["x"],
      platform: "claude",
    });

    const result = await captureAndIngest("claude", {
      outputDir: "/out",
      headless: true,
      timeout: 30000,
    });

    expect(captureThread).toHaveBeenCalledWith("claude", {
      outputDir: "/out",
      headless: true,
      timeout: 30000,
    });
    expect(result.filename).toBe("t.json");
  });
});

// ─── line 109: parseBrowserEngine — BrowserPlatformSchema succeeds ────────────

describe("parseBrowserEngine — BrowserPlatformSchema success branch (line 109)", () => {
  it("passes 'chromium' through directly (BrowserPlatformSchema.safeParse succeeds)", async () => {
    const actions = buildActions();
    const { sendPrompt } = await import("../../src/browser-bridge.js");
    sendPrompt.mockResolvedValue({ dryRun: true, message: "ok" });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "chromium", // recognised by BrowserPlatformSchema → returns "chromium" directly
      timeout: "60000",
      headless: false,
      dryRun: false,
    });

    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ browserType: "chromium" }),
    );
    consoleSpy.mockRestore();
  });

  it("passes 'firefox' through via BrowserPlatformSchema (not BrowserTypeSchema)", async () => {
    // firefox is in BrowserPlatformSchema → returns "firefox" directly from first branch
    // (BrowserTypeSchema would also match it, but BrowserPlatformSchema runs first)
    const actions = buildActions();
    const { sendPrompt } = await import("../../src/browser-bridge.js");
    sendPrompt.mockResolvedValue({ dryRun: true, message: "ok" });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "firefox",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });

    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ browserType: "firefox" }),
    );
    consoleSpy.mockRestore();
  });

  it("passes 'webkit' through via BrowserPlatformSchema", async () => {
    const actions = buildActions();
    const { sendPrompt } = await import("../../src/browser-bridge.js");
    sendPrompt.mockResolvedValue({ dryRun: true, message: "ok" });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "webkit",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });

    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ browserType: "webkit" }),
    );
    consoleSpy.mockRestore();
  });
});
