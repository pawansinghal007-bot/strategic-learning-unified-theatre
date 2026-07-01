/**
 * tests/browser.test.js
 *
 * Unit tests for src/commands/browser.js
 * Mocks all external dependencies (browser-bridge, config, document-ingester).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock external dependencies ───────────────────────────────────────────────

vi.mock("../src/internal/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
  assertFeatureEnabled: vi.fn(),
}));

vi.mock("../src/browser-bridge.js", () => ({
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

vi.mock("../src/llm/document-ingester.js", () => {
  const DocumentIngester = vi.fn(function () {
    this.ingestThread = vi.fn().mockResolvedValue({ chunks: 3 });
  });
  return { DocumentIngester };
});

vi.mock("../src/domain/schemas.js", () => ({
  BrowserPlatformSchema: {
    safeParse: (v) =>
      ["chromium", "firefox", "webkit"].includes(v)
        ? { success: true, data: v }
        : {
            success: false,
            error: { issues: [{ message: "Invalid browser platform" }] },
          },
  },
  BrowserTypeSchema: {
    safeParse: (v) =>
      ["chrome", "safari", "firefox", "brave", "edge"].includes(v)
        ? { success: true, data: v }
        : {
            success: false,
            error: { issues: [{ message: "Invalid browser type" }] },
          },
  },
  TimeoutMsSchema: {
    parse: (v) => {
      if (typeof v !== "number" || v <= 0 || !Number.isFinite(v))
        throw Object.assign(new Error("Invalid timeout"), {
          issues: [{ message: "Timeout must be a positive number" }],
        });
      return v;
    },
  },
}));

vi.mock("node:fs/promises", () => ({
  default: { readFile: vi.fn() },
}));

import fs from "node:fs/promises";
import {
  ensureBrowserDirs,
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
  captureThread,
  BROWSER_RESPONSES_DIR,
} from "../src/browser-bridge.js";
import { loadConfig, assertFeatureEnabled } from "../src/internal/config.js";

import {
  bindBrowserCommands,
  captureAndIngest,
} from "../src/commands/browser.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Commander-like program mock that captures registered actions */
function makeProgram() {
  const actions = {};
  const makeCmd = (name) => {
    const cmd = {
      _name: name,
      _options: {},
      description: () => cmd,
      requiredOption: (flag, _desc, def) => {
        const key = flag
          .match(/--([a-z-]+)/)?.[1]
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (key && def !== undefined) cmd._options[key] = def;
        return cmd;
      },
      option: (flag, _desc, def) => {
        const key = flag
          .match(/--([a-z-]+)/)?.[1]
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (key && def !== undefined) cmd._options[key] = def;
        return cmd;
      },
      action: (fn) => {
        actions[name] = fn;
        return cmd;
      },
      command: (n) => makeCmd(n),
    };
    return cmd;
  };
  const topLevel = makeCmd("browser");
  // Override command() to track registered subcommands
  const subCmds = {};
  topLevel.command = (n) => {
    subCmds[n] = makeCmd(n);
    subCmds[n].command = (n2) => {
      const child = makeCmd(n2);
      subCmds[`${n}:${n2}`] = child;
      return child;
    };
    return subCmds[n];
  };

  const program = { command: () => topLevel };

  return { program, actions, subCmds };
}

/** Invoke a registered action by collecting all chained option/action calls */
function makeFluentCommand() {
  let _action = null;
  const cmd = {
    description: () => cmd,
    requiredOption: () => cmd,
    option: () => cmd,
    action: (fn) => {
      _action = fn;
      return cmd;
    },
    command: () => makeFluentCommand().cmd,
    _run: (opts, ...args) => _action(opts, ...args),
  };
  return cmd;
}

/** Simpler helper: build a real-enough Commander stub and extract action fns */
function buildAndExtractActions() {
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
      command: (childName) => {
        const n = childName.split(" ")[0];
        return makeNode(prefix ? `${prefix}:${n}` : n);
      },
    };
    return node;
  }

  // The top-level browser command; its children are "send", "compare", etc.
  const browserNode = makeNode("");
  // program.command("browser") returns browserNode
  const program = { command: () => browserNode };
  bindBrowserCommands(program, { log: null });
  return captured;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset process.exitCode
  process.exitCode = undefined;
});

// ─── captureAndIngest ─────────────────────────────────────────────────────────

describe("captureAndIngest", () => {
  it("captures and ingests a thread successfully", async () => {
    captureThread.mockResolvedValue({
      filePath: "/tmp/thread.json",
      filename: "thread.json",
      turns: ["turn1", "turn2"],
      platform: "claude",
    });

    const result = await captureAndIngest("claude", {
      outputDir: null,
      headless: false,
      timeout: 60000,
    });

    expect(captureThread).toHaveBeenCalledWith("claude", {
      outputDir: null,
      headless: false,
      timeout: 60000,
    });
    expect(result.filename).toBe("thread.json");
    expect(result.turns).toHaveLength(2);
    expect(result.chunksIngested).toBe(3);
    expect(result.platform).toBe("claude");
  });

  it("throws for invalid platform", async () => {
    await expect(captureAndIngest("unknown")).rejects.toThrow(
      "ROTATOR_CLI_INVALID",
    );
  });

  it("propagates captureThread errors", async () => {
    captureThread.mockRejectedValue(new Error("browser crashed"));
    await expect(captureAndIngest("chatgpt")).rejects.toThrow(
      "browser crashed",
    );
  });
});

// ─── parseServicePlatform (via captureAndIngest) ──────────────────────────────

describe("parseServicePlatform (via captureAndIngest)", () => {
  it.each(["chatgpt", "claude", "gemini", "perplexity"])(
    "accepts %s",
    async (p) => {
      captureThread.mockResolvedValue({
        filePath: "/f",
        filename: "f",
        turns: [],
        platform: p,
      });
      const r = await captureAndIngest(p);
      expect(r.platform).toBe(p);
    },
  );

  it("throws DomainError for unknown platform", async () => {
    await expect(captureAndIngest("bing")).rejects.toThrow(
      "ROTATOR_CLI_INVALID",
    );
  });
});

// ─── parseBrowserEngine / parseTimeoutMs (via bindBrowserCommands) ────────────

describe("parseBrowserEngine", () => {
  it("maps 'chrome' → 'chromium'", async () => {
    const actions = buildAndExtractActions();
    sendPrompt.mockResolvedValue({ dryRun: true, message: "ok" });
    // Invoke send action with browser=chrome
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "chrome",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ browserType: "chromium" }),
    );
    consoleSpy.mockRestore();
  });

  it("maps 'safari' → 'webkit'", async () => {
    const actions = buildAndExtractActions();
    sendPrompt.mockResolvedValue({ dryRun: true, message: "ok" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "safari",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ browserType: "webkit" }),
    );
    consoleSpy.mockRestore();
  });

  it("maps 'firefox' directly", async () => {
    const actions = buildAndExtractActions();
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

  it("throws DomainError for invalid browser engine", async () => {
    const actions = buildAndExtractActions();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "ie",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(consoleError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

describe("parseTimeoutMs", () => {
  it("throws DomainError for invalid timeout", async () => {
    const actions = buildAndExtractActions();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "chromium",
      timeout: "-1",
      headless: false,
      dryRun: false,
    });
    expect(consoleError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── parseVariables ───────────────────────────────────────────────────────────

describe("parseVariables (via prompts run action)", () => {
  it("throws for malformed variable (no = sign)", async () => {
    const actions = buildAndExtractActions();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:run"]?.("prompt-id", {
      platform: "claude",
      var: ["badformat"],
      dryRun: false,
    });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Invalid variable format"),
    );
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });

  it("parses valid key=value variables", async () => {
    const actions = buildAndExtractActions();
    runPromptTemplate.mockResolvedValue({ dryRun: true, prompt: "expanded" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["prompts:run"]?.("pid", {
      platform: "claude",
      var: ["name=world", "lang=en"],
      dryRun: true,
    });
    expect(runPromptTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { name: "world", lang: "en" } }),
    );
    consoleSpy.mockRestore();
  });
});

// ─── bindBrowserCommands: send action ────────────────────────────────────────

describe("browser send action", () => {
  it("sends prompt and logs response on success", async () => {
    const actions = buildAndExtractActions();
    sendPrompt.mockResolvedValue({
      responsePath: "/r.json",
      response: "Hello!",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "test",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Hello!"));
    consoleSpy.mockRestore();
  });

  it("handles dry-run send", async () => {
    const actions = buildAndExtractActions();
    sendPrompt.mockResolvedValue({ dryRun: true, message: "would send" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "test",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: true,
    });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("test"));
    consoleSpy.mockRestore();
  });

  it("reads prompt from --file when provided", async () => {
    const actions = buildAndExtractActions();
    fs.readFile.mockResolvedValue("file prompt content");
    sendPrompt.mockResolvedValue({ responsePath: "/r.json", response: "resp" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      file: "/tmp/prompt.txt",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(fs.readFile).toHaveBeenCalledWith("/tmp/prompt.txt", "utf8");
    consoleSpy.mockRestore();
  });

  it("throws when neither prompt nor file provided (line 176)", async () => {
    const actions = buildAndExtractActions();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Prompt text or --file required"),
    );
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });

  it("catches sendPrompt errors and sets exitCode=1", async () => {
    const actions = buildAndExtractActions();
    sendPrompt.mockRejectedValue(new Error("network fail"));
    const consoleError = vi
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
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── bindBrowserCommands: compare action ─────────────────────────────────────

describe("browser compare action", () => {
  it("compares prompts across platforms — non-dryRun with results", async () => {
    const actions = buildAndExtractActions();
    comparePrompts.mockResolvedValue({
      dryRun: false,
      reportPath: "/r.json",
      results: [
        { platform: "claude", error: null },
        { platform: "chatgpt", error: "timeout" },
      ],
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["compare"]?.({
      prompt: "hi",
      platforms: "claude,chatgpt",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("claude"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("timeout"));
    consoleSpy.mockRestore();
  });

  it("handles dry-run compare", async () => {
    const actions = buildAndExtractActions();
    comparePrompts.mockResolvedValue({
      dryRun: true,
      message: "would compare",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["compare"]?.({
      prompt: "hi",
      platforms: "claude,gemini",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: true,
    });
    expect(comparePrompts).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("throws when platforms list is empty", async () => {
    const actions = buildAndExtractActions();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["compare"]?.({
      prompt: "hi",
      platforms: "  ",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("At least one platform required"),
    );
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });

  it("catches comparePrompts errors", async () => {
    const actions = buildAndExtractActions();
    comparePrompts.mockRejectedValue(new Error("compare failed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["compare"]?.({
      prompt: "hi",
      platforms: "claude",
      browser: "chromium",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── prompts list ─────────────────────────────────────────────────────────────

describe("browser prompts list action", () => {
  it("prints table when prompts exist", async () => {
    const actions = buildAndExtractActions();
    loadPromptLibrary.mockResolvedValue([
      {
        id: "abc123def",
        name: "Test",
        platforms: ["claude"],
        tags: ["t"],
        lastUsed: "2026-01-01T00:00:00Z",
      },
    ]);
    const consoleSpy = vi.spyOn(console, "table").mockImplementation(() => {});
    await actions["prompts:list"]?.();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("shows empty message when no prompts", async () => {
    const actions = buildAndExtractActions();
    loadPromptLibrary.mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["prompts:list"]?.();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("No prompts saved yet"),
    );
    consoleSpy.mockRestore();
  });

  it("catches loadPromptLibrary errors", async () => {
    const actions = buildAndExtractActions();
    loadPromptLibrary.mockRejectedValue(new Error("fs error"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:list"]?.();
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── prompts view ─────────────────────────────────────────────────────────────

describe("browser prompts view action", () => {
  it("prints prompt details", async () => {
    const actions = buildAndExtractActions();
    findPrompt.mockResolvedValue({
      template: "Hello {{name}}",
      name: "Greeter",
      tags: ["greet"],
      platforms: ["claude"],
      lastUsed: "2026-01-01T00:00:00Z",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["prompts:view"]?.("abc123");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Hello {{name}}"),
    );
    consoleSpy.mockRestore();
  });

  it("handles lastUsed=null", async () => {
    const actions = buildAndExtractActions();
    findPrompt.mockResolvedValue({
      template: "T",
      name: "N",
      tags: [],
      platforms: [],
      lastUsed: null,
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["prompts:view"]?.("id");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("—"));
    consoleSpy.mockRestore();
  });

  it("catches findPrompt errors", async () => {
    const actions = buildAndExtractActions();
    findPrompt.mockRejectedValue(new Error("not found"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:view"]?.("bad-id");
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── prompts add ─────────────────────────────────────────────────────────────

describe("browser prompts add action", () => {
  it("adds prompt with inline template", async () => {
    const actions = buildAndExtractActions();
    addPrompt.mockResolvedValue({ id: "abc123def456" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["prompts:add"]?.({
      name: "Test",
      template: "Hello",
      tag: [],
      platform: [],
    });
    expect(addPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test", template: "Hello" }),
    );
    consoleSpy.mockRestore();
  });

  it("reads template from file", async () => {
    const actions = buildAndExtractActions();
    fs.readFile.mockResolvedValue("file template");
    addPrompt.mockResolvedValue({ id: "xyz999" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["prompts:add"]?.({
      name: "T",
      file: "/t.txt",
      tag: [],
      platform: [],
    });
    expect(fs.readFile).toHaveBeenCalledWith("/t.txt", "utf8");
    consoleSpy.mockRestore();
  });

  it("throws when neither template nor file provided", async () => {
    const actions = buildAndExtractActions();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:add"]?.({ name: "T", tag: [], platform: [] });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Template text or --file required"),
    );
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });

  it("catches addPrompt errors", async () => {
    const actions = buildAndExtractActions();
    addPrompt.mockRejectedValue(new Error("write failed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:add"]?.({
      name: "T",
      template: "x",
      tag: [],
      platform: [],
    });
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── prompts run ─────────────────────────────────────────────────────────────

describe("browser prompts run action", () => {
  it("runs template and logs response (non-dryRun)", async () => {
    const actions = buildAndExtractActions();
    runPromptTemplate.mockResolvedValue({
      dryRun: false,
      response: "The answer",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["prompts:run"]?.("pid", {
      platform: "claude",
      var: [],
      dryRun: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("The answer"),
    );
    consoleSpy.mockRestore();
  });

  it("catches runPromptTemplate errors", async () => {
    const actions = buildAndExtractActions();
    runPromptTemplate.mockRejectedValue(new Error("template error"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:run"]?.("pid", {
      platform: "claude",
      var: [],
      dryRun: false,
    });
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── prompts delete ───────────────────────────────────────────────────────────

describe("browser prompts delete action", () => {
  it("deletes prompt successfully", async () => {
    const actions = buildAndExtractActions();
    deletePrompt.mockResolvedValue(undefined);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["prompts:delete"]?.("pid");
    expect(deletePrompt).toHaveBeenCalledWith("pid");
    consoleSpy.mockRestore();
  });

  it("catches deletePrompt errors", async () => {
    const actions = buildAndExtractActions();
    deletePrompt.mockRejectedValue(new Error("not found"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["prompts:delete"]?.("pid");
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── browser login ────────────────────────────────────────────────────────────

describe("browser login action", () => {
  it("logs in and reports success", async () => {
    const actions = buildAndExtractActions();
    loginToPage.mockResolvedValue({ message: "Logged in to claude" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["login"]?.({
      platform: "claude",
      browser: "chromium",
      timeout: "60000",
    });
    expect(loginToPage).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "claude" }),
    );
    consoleSpy.mockRestore();
  });

  it("catches login errors and sets exitCode=1", async () => {
    const actions = buildAndExtractActions();
    loginToPage.mockRejectedValue(new Error("login failed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["login"]?.({
      platform: "claude",
      browser: "chromium",
      timeout: "60000",
    });
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── browser login-capture ────────────────────────────────────────────────────

describe("browser login-capture action", () => {
  it("logs in then captures and ingests", async () => {
    const actions = buildAndExtractActions();
    loginToPage.mockResolvedValue({});
    captureThread.mockResolvedValue({
      filePath: "/f",
      filename: "f.json",
      turns: ["t1"],
      platform: "claude",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["login-capture"]?.({
      platform: "claude",
      browser: "chromium",
      timeout: "60000",
      outputDir: null,
      headless: false,
    });
    expect(loginToPage).toHaveBeenCalled();
    expect(captureThread).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ingested"),
    );
    consoleSpy.mockRestore();
  });

  it("catches login-capture errors", async () => {
    const actions = buildAndExtractActions();
    loginToPage.mockRejectedValue(new Error("login crash"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["login-capture"]?.({
      platform: "claude",
      browser: "chromium",
      timeout: "60000",
    });
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── browser capture ─────────────────────────────────────────────────────────

describe("browser capture action", () => {
  it("captures when --thread is provided", async () => {
    const actions = buildAndExtractActions();
    captureThread.mockResolvedValue({
      filePath: "/f",
      filename: "f.json",
      turns: ["t"],
      platform: "claude",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["capture"]?.({
      platform: "claude",
      thread: true,
      timeout: "60000",
      outputDir: null,
    });
    expect(captureThread).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("throws when --thread is missing", async () => {
    const actions = buildAndExtractActions();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["capture"]?.({
      platform: "claude",
      thread: false,
      timeout: "60000",
    });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("--thread is required"),
    );
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });

  it("catches capture errors and logs via commandLog", async () => {
    const mockLog = { info: vi.fn(), error: vi.fn() };
    const actions2 = {};
    function makeNode2(prefix) {
      const node = {
        description: () => node,
        requiredOption: () => node,
        option: () => node,
        action: (fn) => {
          actions2[prefix] = fn;
          return node;
        },
        command: (childName) => {
          const n = childName.split(" ")[0];
          return makeNode2(prefix ? `${prefix}:${n}` : n);
        },
      };
      return node;
    }
    const browser2 = makeNode2("");
    bindBrowserCommands({ command: () => browser2 }, { log: mockLog });

    captureThread.mockRejectedValue(new Error("capture crashed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions2["capture"]?.({
      platform: "claude",
      thread: true,
      timeout: "60000",
      outputDir: "/out",
    });
    expect(mockLog.error).toHaveBeenCalledWith(
      "browser.capture.failure",
      expect.objectContaining({ error: expect.any(Error) }),
    );
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── responses list ───────────────────────────────────────────────────────────

describe("browser responses list action", () => {
  it("prints table when responses exist", async () => {
    const actions = buildAndExtractActions();
    listResponses.mockResolvedValue([
      { filename: "r1.json", content: "x".repeat(2048) },
    ]);
    const consoleSpy = vi.spyOn(console, "table").mockImplementation(() => {});
    await actions["responses:list"]?.({ limit: "10" });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("shows empty message when no responses", async () => {
    const actions = buildAndExtractActions();
    listResponses.mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["responses:list"]?.({ limit: "10" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("No responses found"),
    );
    consoleSpy.mockRestore();
  });

  it("catches listResponses errors", async () => {
    const actions = buildAndExtractActions();
    listResponses.mockRejectedValue(new Error("fs error"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["responses:list"]?.({ limit: "10" });
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── responses view ───────────────────────────────────────────────────────────

describe("browser responses view action", () => {
  it("writes response content to stdout", async () => {
    const actions = buildAndExtractActions();
    getResponseMetadata.mockResolvedValue({ content: "response text" });
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => {});
    await actions["responses:view"]?.("file.json");
    expect(writeSpy).toHaveBeenCalledWith("response text\n");
    writeSpy.mockRestore();
  });

  it("catches getResponseMetadata errors", async () => {
    const actions = buildAndExtractActions();
    getResponseMetadata.mockRejectedValue(new Error("not found"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["responses:view"]?.("missing.json");
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── responses clear ──────────────────────────────────────────────────────────

describe("browser responses clear action", () => {
  it("clears responses and reports count", async () => {
    const actions = buildAndExtractActions();
    clearResponses.mockResolvedValue({ deleted: 5 });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["responses:clear"]?.({ olderThanDays: "30" });
    expect(clearResponses).toHaveBeenCalledWith(
      expect.objectContaining({ olderThanDays: 30 }),
    );
    consoleSpy.mockRestore();
  });

  it("passes null when olderThanDays not provided", async () => {
    const actions = buildAndExtractActions();
    clearResponses.mockResolvedValue({ deleted: 0 });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["responses:clear"]?.({});
    expect(clearResponses).toHaveBeenCalledWith(
      expect.objectContaining({ olderThanDays: null }),
    );
    consoleSpy.mockRestore();
  });

  it("catches clearResponses errors", async () => {
    const actions = buildAndExtractActions();
    clearResponses.mockRejectedValue(new Error("clear failed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["responses:clear"]?.({});
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── responses tag ────────────────────────────────────────────────────────────

describe("browser responses tag action", () => {
  it("tags response and logs quality", async () => {
    const actions = buildAndExtractActions();
    tagResponse.mockResolvedValue({
      filename: "r.json",
      quality: "good",
      mistakeCreated: false,
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["responses:tag"]?.("r.json", { quality: "good" });
    expect(tagResponse).toHaveBeenCalledWith("r.json", {
      quality: "good",
      notes: undefined,
    });
    consoleSpy.mockRestore();
  });

  it("logs mistake when mistakeCreated=true", async () => {
    const actions = buildAndExtractActions();
    tagResponse.mockResolvedValue({
      filename: "r.json",
      quality: "bad",
      mistakeCreated: true,
      notes: "Wrong answer",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["responses:tag"]?.("r.json", {
      quality: "bad",
      notes: "Wrong answer",
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Mistake recorded"),
    );
    consoleSpy.mockRestore();
  });

  it("catches tagResponse errors", async () => {
    const actions = buildAndExtractActions();
    tagResponse.mockRejectedValue(new Error("tag failed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["responses:tag"]?.("r.json", { quality: "good" });
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── responses capture ────────────────────────────────────────────────────────

describe("browser responses capture action", () => {
  it("captures and ingests successfully", async () => {
    const actions = buildAndExtractActions();
    captureThread.mockResolvedValue({
      filePath: "/f",
      filename: "f.json",
      turns: ["t1", "t2"],
      platform: "gemini",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["responses:capture"]?.({
      platform: "gemini",
      timeout: "60000",
      outputDir: null,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ingested"),
    );
    consoleSpy.mockRestore();
  });

  it("catches responses capture errors", async () => {
    const actions = buildAndExtractActions();
    captureThread.mockRejectedValue(new Error("cap fail"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["responses:capture"]?.({
      platform: "gemini",
      timeout: "60000",
    });
    expect(process.exitCode).toBe(1);
    consoleError.mockRestore();
  });
});

// ─── responses dir ────────────────────────────────────────────────────────────

describe("browser responses dir action", () => {
  it("prints the BROWSER_RESPONSES_DIR", async () => {
    const actions = buildAndExtractActions();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["responses:dir"]?.();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("/fake/responses"),
    );
    consoleSpy.mockRestore();
  });
});

// ─── formatValidationError branches ──────────────────────────────────────────

describe("formatValidationError (via error paths)", () => {
  it("formats Zod-style issues array", async () => {
    // parseBrowserEngine with invalid → DomainError with issues message
    const actions = buildAndExtractActions();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "badengine",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Invalid browser type"),
    );
    consoleError.mockRestore();
  });

  it("formats plain Error message", async () => {
    const actions = buildAndExtractActions();
    sendPrompt.mockRejectedValue(new Error("plain error"));
    const consoleError = vi
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
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("plain error"),
    );
    consoleError.mockRestore();
  });
});

// ─── accumulate helper (line 57) ─────────────────────────────────────────────

describe("accumulate helper (line 57)", () => {
  it("collects repeated --tag values into an array via prompts add", async () => {
    // The accumulate fn is the Commander coercion callback for multi-value
    // options; it is invoked for every repeated flag. Using the real Commander
    // (via buildAndExtractActions which wires up .option(flag, desc, accumulate, []))
    // means we need Commander to actually call the coercion. Commander only
    // invokes the coercion when it parses raw argv, not when we call the
    // action directly. So we exercise accumulate by importing it indirectly
    // through a direct module call and verifying it concatenates correctly.
    //
    // The cleanest way without exposing the private function is to rely on the
    // fact that Commander *does* invoke the coercion during real parse. Since
    // bindBrowserCommands is wired to a real Commander in browser.test.js we
    // can verify the side-effect: addPrompt receives merged arrays.
    const { Command } = await import("commander");
    const { bindBrowserCommands: bind } = await import(
      "../src/commands/browser.js"
    );
    addPrompt.mockResolvedValue({ id: "newid12345" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const prog = new Command();
    prog.exitOverride();
    bind(prog);

    await prog.parseAsync([
      "node",
      "cli",
      "browser",
      "prompts",
      "add",
      "--name",
      "MyPrompt",
      "--template",
      "Hello",
      "--tag",
      "alpha",
      "--tag",
      "beta",
      "--platform",
      "claude",
      "--platform",
      "chatgpt",
    ]);

    // accumulate was invoked for each repeated flag → arrays have both values
    expect(addPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["alpha", "beta"],
        platforms: ["claude", "chatgpt"],
      }),
    );
    consoleSpy.mockRestore();
  });
});

// ─── parseBrowserEngine: line 109 (non-chrome/safari BrowserType) ─────────────

describe("parseBrowserEngine line 109 — BrowserType pass-through", () => {
  it("passes 'brave' straight through when BrowserPlatformSchema rejects it", async () => {
    // 'brave' is NOT in BrowserPlatformSchema mock (chromium/firefox/webkit),
    // so it falls to BrowserTypeSchema. The mock now includes 'brave', and
    // since it is neither 'chrome' nor 'safari' it hits the return-typeResult.data
    // branch (line 109).
    const actions = buildAndExtractActions();
    sendPrompt.mockResolvedValue({ dryRun: true, message: "ok" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "brave",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ browserType: "brave" }),
    );
    consoleSpy.mockRestore();
  });

  it("passes 'edge' straight through when BrowserPlatformSchema rejects it", async () => {
    const actions = buildAndExtractActions();
    sendPrompt.mockResolvedValue({ dryRun: true, message: "ok" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actions["send"]?.({
      platform: "claude",
      prompt: "hi",
      browser: "edge",
      timeout: "60000",
      headless: false,
      dryRun: false,
    });
    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ browserType: "edge" }),
    );
    consoleSpy.mockRestore();
  });
});
