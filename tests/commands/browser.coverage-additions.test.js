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
        : {
            success: false,
            error: { issues: [{ message: "Invalid platform" }] },
          },
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

import {
  captureThread,
  sendPrompt,
  comparePrompts,
  loadPromptLibrary,
  addPrompt,
  findPrompt,
  deletePrompt,
  runPromptTemplate,
  loginToPage,
  listResponses,
  getResponseMetadata,
  clearResponses,
  tagResponse,
} from "../../src/browser-bridge.js";
import {
  captureAndIngest,
  bindBrowserCommands,
} from "../../src/commands/browser.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildActions() {
  const captured = {};
  function makeNode(prefix) {
    const node = {
      description: () => node,
      requiredOption: () => node,
      option: () => node,
      action: (fn) => {
        captured[prefix] = fn;
        return node;
      },
      command: (name) =>
        makeNode(
          prefix ? `${prefix}:${name.split(" ")[0]}` : name.split(" ")[0],
        ),
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

// ─── Line 71: formatValidationError — String(err) branch ──────────────────

describe("formatValidationError — String(err) branch (line 71)", () => {
  it("uses String(err) when err has no .issues and is not an Error", async () => {
    const schemas = await import("../../src/domain/schemas.js");
    const originalPlatformParse = schemas.BrowserPlatformSchema.safeParse;
    const originalTypeParse = schemas.BrowserTypeSchema.safeParse;
    try {
      schemas.BrowserPlatformSchema.safeParse = () => ({
        success: false,
        error: { issues: [{ message: "fail" }] },
      });
      schemas.BrowserTypeSchema.safeParse = () => ({
        success: false,
        error: "plain-string-error",
      });

      const actions = buildActions();
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await actions["send"]?.({
        platform: "claude",
        prompt: "hi",
        browser: "unknown-engine",
        timeout: "60000",
        headless: false,
        dryRun: false,
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorMsg = consoleErrorSpy.mock.calls[0][0];
      expect(errorMsg).toContain("plain-string-error");
      consoleErrorSpy.mockRestore();
    } finally {
      schemas.BrowserPlatformSchema.safeParse = originalPlatformParse;
      schemas.BrowserTypeSchema.safeParse = originalTypeParse;
    }
  });
});

// ─── Lines 83 & 97: value || "" branches ──────────────────────────────────

describe("parseServicePlatform — value || '' branch (line 83)", () => {
  it("handles undefined platform by falling back to empty string", async () => {
    const actions = buildActions();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await actions["send"]?.({
      platform: undefined,
      prompt: "hi",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe("parseBrowserEngine — value || '' branch (line 97)", () => {
  it("handles undefined browser by falling back to empty string", async () => {
    const actions = buildActions();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: undefined,
      timeout: "60000",
      headless: false,
      dryRun: false,
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// ─── Line 299: p.lastUsed ? : "\u2014" ────────────────────────────────────────

describe("prompts list — lastUsed falsy branch (line 299)", () => {
  it("shows '\u2014' when lastUsed is falsy", async () => {
    const actions = buildActions();
    loadPromptLibrary.mockResolvedValue([
      {
        id: "abc12345",
        name: "Test",
        platforms: ["chatgpt"],
        tags: ["test"],
        lastUsed: null,
      },
    ]);

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleTableSpy = vi
      .spyOn(console, "table")
      .mockImplementation(() => {});

    await actions["prompts:list"]?.();

    expect(consoleTableSpy).toHaveBeenCalled();
    const tableData = consoleTableSpy.mock.calls[0][0];
    expect(tableData[0].lastUsed).toBe("\u2014");

    consoleLogSpy.mockRestore();
    consoleTableSpy.mockRestore();
  });
});

// ─── Lines 355, 356: options.tag || [], options.platform || [] ────────────

describe("prompts add — tag/platform || [] branches (lines 355-356)", () => {
  it("uses empty arrays when tag and platform are undefined", async () => {
    const actions = buildActions();
    addPrompt.mockResolvedValue({ id: "abc12345", name: "Test" });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await actions["prompts:add"]?.({
      name: "Test",
      template: "Hello {{name}}",
      tag: undefined,
      platform: undefined,
    });

    expect(addPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [], platforms: [] }),
    );
    consoleLogSpy.mockRestore();
  });
});

// ─── Catch blocks — err?.message ?? err (throw non-Error) ─────────────────
// When a caught value has no .message property, ?? falls through to err itself

describe("catch blocks — err?.message ?? err branch (string throws)", () => {
  // Line 202: send command
  it("line 202: send command catches string throw", async () => {
    const actions = buildActions();
    sendPrompt.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 269: compare command
  it("line 269: compare command catches string throw", async () => {
    const actions = buildActions();
    comparePrompts.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["compare"]?.({
      prompt: "hi",
      platforms: "chatgpt,claude",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 304: prompts list
  it("line 304: prompts list catches string throw", async () => {
    const actions = buildActions();
    loadPromptLibrary.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:list"]?.();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 325: prompts view
  it("line 325: prompts view catches string throw", async () => {
    const actions = buildActions();
    findPrompt.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:view"]?.("abc123");
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 362: prompts add
  it("line 362: prompts add catches string throw", async () => {
    const actions = buildActions();
    addPrompt.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:add"]?.({
      name: "Test",
      template: "Hello",
      tag: [],
      platform: [],
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 396: prompts run
  it("line 396: prompts run catches string throw", async () => {
    const actions = buildActions();
    runPromptTemplate.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:run"]?.("abc123", {
      var: ["key=value"],
      dryRun: false,
      platform: "chatgpt",
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 411: prompts delete
  it("line 411: prompts delete catches string throw", async () => {
    const actions = buildActions();
    deletePrompt.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:delete"]?.("abc123");
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 447: login
  it("line 447: login catches string throw", async () => {
    const actions = buildActions();
    loginToPage.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["login"]?.({
      platform: "chatgpt",
      browser: "chromium",
      timeout: "60000",
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 503: login-capture
  it("line 503: login-capture catches string throw", async () => {
    const actions = buildActions();
    loginToPage.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["login-capture"]?.({
      platform: "chatgpt",
      browser: "chromium",
      timeout: "60000",
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 595: responses list
  it("line 595: responses list catches string throw", async () => {
    const actions = buildActions();
    listResponses.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["responses:list"]?.({ platform: undefined, limit: "10" });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 608: responses view
  it("line 608: responses view catches string throw", async () => {
    const actions = buildActions();
    getResponseMetadata.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["responses:view"]?.("response.json");
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 631: responses clear
  it("line 631: responses clear catches string throw", async () => {
    const actions = buildActions();
    clearResponses.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["responses:clear"]?.({
      platform: undefined,
      olderThanDays: undefined,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 655: responses tag
  it("line 655: responses tag catches string throw", async () => {
    const actions = buildActions();
    tagResponse.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["responses:tag"]?.("response.json", {
      quality: "good",
      notes: undefined,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Line 684: responses capture
  it("line 684: responses capture catches string throw", async () => {
    const actions = buildActions();
    captureThread.mockRejectedValue("string error");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["responses:capture"]?.({
      platform: "chatgpt",
      timeout: "60000",
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// ─── Lines 526 & 557: browser capture with commandLog ──────────────────────

describe("browser capture — commandLog branches (lines 526, 557)", () => {
  function buildActionsWithLog() {
    const mockLog = { info: vi.fn(), error: vi.fn() };
    const captured = {};
    function makeNode(prefix) {
      const node = {
        description: () => node,
        requiredOption: () => node,
        option: () => node,
        action: (fn) => {
          captured[prefix] = fn;
          return node;
        },
        command: (name) =>
          makeNode(
            prefix ? `${prefix}:${name.split(" ")[0]}` : name.split(" ")[0],
          ),
      };
      return node;
    }
    bindBrowserCommands({ command: () => makeNode("") }, { log: mockLog });
    return { actions: captured, log: mockLog };
  }

  // Line 526: options.outputDir || null
  it("line 526: uses null when outputDir is undefined", async () => {
    const { actions, log } = buildActionsWithLog();
    captureThread.mockResolvedValue({
      filePath: "/tmp/t.json",
      filename: "t.json",
      turns: ["a"],
      platform: "chatgpt",
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["capture"]?.({
      platform: "chatgpt",
      thread: true,
      outputDir: undefined,
      timeout: "60000",
    });
    consoleLogSpy.mockRestore();

    expect(log.info).toHaveBeenCalledWith(
      "browser.capture.start",
      expect.objectContaining({
        outputDir: null,
      }),
    );
  });

  // Line 557: err?.code || "ROTATOR_BROWSER_CAPTURE_FAILED"
  it("line 557: uses default code when error has no .code property", async () => {
    const { actions, log } = buildActionsWithLog();
    captureThread.mockRejectedValue(new Error("scan failed"));

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["capture"]?.({
      platform: "chatgpt",
      thread: true,
      outputDir: undefined,
      timeout: "60000",
    });
    consoleErrorSpy.mockRestore();

    expect(log.error).toHaveBeenCalledWith(
      "browser.capture.failure",
      expect.objectContaining({
        code: "ROTATOR_BROWSER_CAPTURE_FAILED",
      }),
    );
  });
});
