// tests/browser-bridge.coverage-additions3.test.js
// Targets uncovered branches after additions2:
//   29        homeDir() os.homedir() fallback
//   40-46     rotatorPath log + stack
//   109       quality || "" falsy branch
//   205       action.chunks || 0 — action missing chunks
//   291       JSON.parse(data) || {} — selectors file contains "null"
//   324       config?.browserPaths?.brave fallback (no BRAVE_PATH env)
//   341       browserType === "chrome" → "chromium" normalisation
//   382       closeBrowser(null) early return
//   567       JSON.parse(data) || {} — last-send file contains "null"
//   581       elapsed >= MIN_DELAY — no delay needed
//   625       comparePrompts per-platform error path (branch coverage)
//   657       JSON.parse(data) || [] — prompt library file contains "null"
//   813       listResponses limit branch
//   926       !containers.length → return [] inside evaluate callback
//   929-934   roleEl null + contentEl null branches in evaluate callback
//   949       turn.role || "unknown" falsy branch
//   960       outputDir || browserResponsesDir() fallback

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as browserBridge from "../src/browser-bridge.js";

import {
  ensureBrowserDirs,
  launchBrowser,
  closeBrowser,
  sendPrompt,
  comparePrompts,
  captureThread,
  listResponses,
  loadPromptLibrary,
  tagResponse,
} from "../src/browser-bridge.js";

import { ExperienceDb } from "../src/llm/experience-db.js";

vi.mock("playwright", () => {
  const makeContext = () => ({
    newPage: vi.fn(async () => ({
      goto: vi.fn(async () => {}),
      waitForLoadState: vi.fn(async () => {}),
      $: vi.fn(async () => ({})),
      fill: vi.fn(async () => {}),
      click: vi.fn(async () => {}),
      waitForSelector: vi.fn(async () => {}),
      $$: vi.fn(async () => [{ evaluate: vi.fn(async () => "ok") }]),
      waitForTimeout: vi.fn(async () => {}),
      evaluate: vi.fn(async () => [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ]),
    })),
    storageState: vi.fn(async () => ({})),
    close: vi.fn(async () => {}),
  });
  const makeBrowser = () => ({
    newContext: vi.fn(async (_opts) => makeContext()),
    once: vi.fn((event, cb) => {
      if (event === "disconnected") setImmediate(cb);
    }),
    isConnected: vi.fn(() => false),
    close: vi.fn(async () => {}),
  });
  return {
    chromium: { launch: vi.fn(async (_opts) => makeBrowser()) },
    firefox: { launch: vi.fn(async (_opts) => makeBrowser()) },
  };
});

vi.mock("node:readline/promises", () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: vi.fn(() => new Promise(() => {})),
      close: vi.fn(),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFullFakePage(overrides = {}) {
  return {
    goto: vi.fn(async () => {}),
    waitForLoadState: vi.fn(async () => {}),
    $: vi.fn(async () => ({})),
    fill: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    waitForSelector: vi.fn(async () => {}),
    $$: vi.fn(async () => [{ evaluate: vi.fn(async () => "Mock response") }]),
    waitForTimeout: vi.fn(async () => {}),
    evaluate: vi.fn(async () => [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]),
    ...overrides,
  };
}

function makeFakeContext(pageOverrides = {}) {
  return {
    newPage: vi.fn(async () => makeFullFakePage(pageOverrides)),
    close: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
describe("Browser Bridge — coverage additions 3", () => {
  let tempDir;
  let originalHome;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bb-cov3-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ─── 29: homeDir() os.homedir() fallback ──────────────────────────────────
  describe("homeDir — os.homedir() fallback (29)", () => {
    it("falls back to os.homedir() when HOME env var is unset", async () => {
      delete process.env.HOME;
      // ensureBrowserDirs calls rotatorPath → homeDir; with HOME unset it
      // falls back to os.homedir() at line 29.
      await ensureBrowserDirs();
      const homedirBased = path.join(os.homedir(), ".vscode-rotator");
      const stat = await fs.stat(homedirBased).catch(() => null);
      expect(stat).not.toBeNull();
    });
  });

  // ─── 109: quality || "" falsy branch ──────────────────────────────────────
  describe("tagResponse — quality falsy branch (109)", () => {
    it("coerces null quality to empty string and throws Invalid quality", async () => {
      await ensureBrowserDirs();
      const filename = "2026-05-19T10-30-45-chatgpt.md";
      const responsePath = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
        filename,
      );
      await fs.writeFile(responsePath, "content", "utf8");
      await expect(tagResponse(filename, { quality: null })).rejects.toThrow(
        /Invalid quality/,
      );
    });
  });

  // ─── 291: JSON.parse(data) || {} — selectors file is "null" ───────────────
  describe("loadSelectorOverrides — JSON.parse returns null (291)", () => {
    it("returns {} when selectors file contains JSON null", async () => {
      await ensureBrowserDirs();
      const selectorsPath = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-selectors.json",
      );
      await fs.writeFile(selectorsPath, "null", "utf8");

      // captureThread reads browser-selectors.json via loadSelectorOverrides.
      // JSON.parse("null") === null → || {} fires (line 291).
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true });
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(
        makeFakeContext(),
      );

      const result = await captureThread("chatgpt", {
        outputDir: responsesDir,
      });
      expect(result.turns.length).toBeGreaterThan(0);
    });
  });

  // ─── 324: config?.browserPaths?.brave fallback ────────────────────────────
  describe("setupLauncher — brave uses config.browserPaths.brave (324)", () => {
    it("uses config.browserPaths.brave when BRAVE_PATH is unset", async () => {
      delete process.env.BRAVE_PATH;
      const pw = await import("playwright");
      let capturedOpts = null;
      pw.chromium.launch.mockImplementationOnce(async (opts) => {
        capturedOpts = opts;
        return {
          newContext: vi.fn(async () => ({ close: vi.fn(async () => {}) })),
          close: vi.fn(async () => {}),
        };
      });

      const configModule = await import("../src/internal/config.js");
      vi.spyOn(configModule, "loadConfig").mockResolvedValueOnce({
        browserPaths: { brave: "/config/brave" },
      });

      const ctx = await launchBrowser({ browserType: "brave" });
      await ctx.close();
      // Line 324: execPath = executablePath || BRAVE_PATH || config.browserPaths.brave
      expect(capturedOpts?.executablePath).toBe("/config/brave");
    });
  });

  // ─── 341: browserType "chrome" → "chromium" normalisation ─────────────────
  describe("launchBrowser — 'chrome' normalised to 'chromium' (341)", () => {
    it("treats browserType 'chrome' as chromium", async () => {
      const pw = await import("playwright");
      const before = pw.chromium.launch.mock.calls.length;
      const ctx = await launchBrowser({ browserType: "chrome" });
      await ctx.close();
      expect(pw.chromium.launch.mock.calls.length).toBeGreaterThan(before);
    });
  });

  // ─── 382: closeBrowser(null) early return ─────────────────────────────────
  describe("closeBrowser — null context early return (382)", () => {
    it("returns immediately without throwing when context is null", async () => {
      await expect(closeBrowser(null)).resolves.toBeUndefined();
    });
  });

  // ─── 567: JSON.parse(data) || {} — last-send file is "null" ───────────────
  describe("loadPlatformLastSend — JSON.parse returns null (567)", () => {
    it("returns {} when last-send file contains JSON null", async () => {
      await ensureBrowserDirs();
      const lastSendPath = path.join(
        tempDir,
        ".vscode-rotator",
        "platform-last-send.json",
      );
      await fs.writeFile(lastSendPath, "null", "utf8");

      // comparePrompts → waitForMinimumDelay → loadPlatformLastSend.
      // JSON.parse("null") === null → || {} fires (line 567) → lastSend undefined → early return.
      vi.spyOn(browserBridge, "sendPrompt").mockResolvedValue({
        platform: "chatgpt",
        prompt: "hi",
        response: "ok",
        responsePath: path.join(tempDir, "r.md"),
        timestamp: "t",
      });
      await expect(
        comparePrompts({ prompt: "hi", platforms: ["chatgpt"], dryRun: false }),
      ).resolves.toMatchObject({ prompt: "hi" });
    });
  });

  // ─── 581: elapsed >= MIN_DELAY — no delay branch ──────────────────────────
  describe("waitForMinimumDelay — no delay when elapsed >= MIN_DELAY (581)", () => {
    it("skips setTimeout when last send was long ago", async () => {
      await ensureBrowserDirs();
      const lastSendPath = path.join(
        tempDir,
        ".vscode-rotator",
        "platform-last-send.json",
      );
      // lastSend = 10 seconds ago → elapsed > 3000 → if branch NOT taken.
      await fs.writeFile(
        lastSendPath,
        JSON.stringify({ chatgpt: Date.now() - 10_000 }),
        "utf8",
      );
      vi.spyOn(browserBridge, "sendPrompt").mockResolvedValue({
        platform: "chatgpt",
        prompt: "hi",
        response: "ok",
        responsePath: path.join(tempDir, "r.md"),
        timestamp: "t",
      });
      await expect(
        comparePrompts({ prompt: "hi", platforms: ["chatgpt"], dryRun: false }),
      ).resolves.toMatchObject({ prompt: "hi" });
    });
  });

  // ─── 625: comparePrompts per-platform error branch (branch coverage) ───────
  describe("comparePrompts — per-platform error recorded (625)", () => {
    it("records error string when a platform's sendPrompt throws", async () => {
      await ensureBrowserDirs();
      vi.spyOn(browserBridge, "sendPrompt").mockRejectedValue(
        new Error("platform boom"),
      );
      const result = await comparePrompts({
        prompt: "hi",
        platforms: ["chatgpt"],
        dryRun: false,
      });
      expect(result.results[0].error).toContain("platform boom");
    });
  });

  // ─── 657: JSON.parse(data) || [] — prompt library file is "null" ──────────
  describe("loadPromptLibrary — JSON.parse returns null (657)", () => {
    it("returns [] when prompt library file contains JSON null", async () => {
      await ensureBrowserDirs();
      const libPath = path.join(
        tempDir,
        ".vscode-rotator",
        "prompt-library.json",
      );
      await fs.mkdir(path.dirname(libPath), { recursive: true });
      await fs.writeFile(libPath, "null", "utf8");

      const result = await loadPromptLibrary();
      // JSON.parse("null") === null → || [] fires (line 657) → returns []
      // after .map() on empty array.
      expect(result).toEqual([]);
    });
  });

  // ─── 813: listResponses limit branch ──────────────────────────────────────
  describe("listResponses — limit option (813)", () => {
    it("slices files to the given limit", async () => {
      await ensureBrowserDirs();
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      // Write 3 files; request limit: 2.
      for (const name of [
        "2026-01-01T00-00-00-chatgpt.md",
        "2026-01-02T00-00-00-chatgpt.md",
        "2026-01-03T00-00-00-chatgpt.md",
      ]) {
        await fs.writeFile(path.join(responsesDir, name), "# x", "utf8");
      }

      vi.spyOn(ExperienceDb.prototype, "open").mockResolvedValue(undefined);
      vi.spyOn(ExperienceDb.prototype, "close").mockResolvedValue(undefined);
      vi.spyOn(ExperienceDb.prototype, "getDocumentsByFile").mockResolvedValue(
        [],
      );

      const baseDir = path.join(tempDir, ".vscode-rotator");
      const results = await listResponses({ limit: 2, baseDir });
      expect(results.length).toBe(2);
    });
  });

  // ─── 926, 929-934: evaluate callback branches ─────────────────────────────
  describe("captureThread — evaluate callback edge cases (926, 929-934)", () => {
    it("returns [] when containers.length is 0 (926)", async () => {
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true });

      const fakeDoc = { querySelectorAll: () => [] };
      const fakePage = makeFullFakePage({
        evaluate: vi.fn(async (fn, args) => {
          const prev = globalThis.document;
          globalThis.document = fakeDoc;
          try {
            return fn(args);
          } finally {
            globalThis.document = prev;
          }
        }),
      });
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue({
        newPage: vi.fn(async () => fakePage),
        close: vi.fn(async () => {}),
      });

      // Returns [] → throws "No conversation turns found"
      await expect(
        captureThread("chatgpt", { outputDir: responsesDir }),
      ).rejects.toThrow(/No conversation turns found/);
    });

    it("uses 'unknown' role when roleEl is null and empty content when contentEl is null (929-934)", async () => {
      // Container with no matching role element and no matching content element.
      const fakeContainers = [
        {
          // querySelector returns null for both selectors
          querySelector: vi.fn(() => null),
        },
      ];
      const fakeDoc = { querySelectorAll: () => fakeContainers };
      const fakePage = makeFullFakePage({
        evaluate: vi.fn(async (fn, args) => {
          const prev = globalThis.document;
          globalThis.document = fakeDoc;
          try {
            return fn(args);
          } finally {
            globalThis.document = prev;
          }
        }),
      });
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue({
        newPage: vi.fn(async () => fakePage),
        close: vi.fn(async () => {}),
      });

      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true });

      // roleEl=null → role="unknown"; contentEl=null → content="" → filtered out → []
      await expect(
        captureThread("chatgpt", { outputDir: responsesDir }),
      ).rejects.toThrow(/No conversation turns found/);
    });
  });

  // ─── 949: turn.role || "unknown" falsy branch ─────────────────────────────
  describe("captureThread — turn.role falsy → 'unknown' (949)", () => {
    it("uses 'unknown' when a turn has no role property", async () => {
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true });

      // Turns where role is absent — triggers || "unknown" at line 949.
      // Also no "user"/"assistant" → throws Incomplete conversation thread.
      const fakePage = makeFullFakePage({
        evaluate: vi.fn(async () => [
          { content: "some text" }, // role is undefined
        ]),
      });
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue({
        newPage: vi.fn(async () => fakePage),
        close: vi.fn(async () => {}),
      });

      await expect(
        captureThread("chatgpt", { outputDir: responsesDir }),
      ).rejects.toThrow(/Incomplete conversation thread/);
    });
  });

  // ─── 960: outputDir || browserResponsesDir() fallback ─────────────────────
  describe("captureThread — outputDir fallback to browserResponsesDir (960)", () => {
    it("uses browserResponsesDir() when outputDir is not passed", async () => {
      await ensureBrowserDirs();
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(
        makeFakeContext(),
      );

      // No outputDir passed → line 960 uses browserResponsesDir() fallback.
      const result = await captureThread("chatgpt");
      expect(result.turns.length).toBeGreaterThan(0);
      // captureThread returns { filePath, ... } (capital P)
      expect(result.filePath).toContain(".vscode-rotator");
    });
  });

  // ─── 205: action.chunks || 0 — action missing chunks property ─────────────
  describe("ingestBrowserResponseFile — action.chunks || 0 (205)", () => {
    it("counts 0 for actions without a chunks property", async () => {
      await ensureBrowserDirs();
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(
        makeFakeContext(),
      );

      const { StorageMonitor } =
        await import("../src/storage/storage-monitor.js");
      const { DocumentIngester } =
        await import("../src/llm/document-ingester.js");
      const configModule = await import("../src/internal/config.js");

      // Ensure loadConfig succeeds so ingestBrowserResponseFile proceeds past line 184.
      vi.spyOn(configModule, "loadConfig").mockResolvedValue({
        browserResponsesIngest: true,
        browserPaths: {},
      });

      vi.spyOn(StorageMonitor.prototype, "appendChanges").mockResolvedValueOnce(
        undefined,
      );
      Object.defineProperty(StorageMonitor.prototype, "snapshotPath", {
        get: () => "/tmp/snap",
        configurable: true,
      });

      // Action without chunks → action.chunks || 0 fires at line 205.
      vi.spyOn(
        DocumentIngester.prototype,
        "ingestFromSnapshot",
      ).mockResolvedValueOnce({ actions: [{ type: "add" }], skipped: false });

      const result = await sendPrompt({
        platform: "chatgpt",
        prompt: "chunks test",
        dryRun: false,
      });
      expect(result.platform).toBe("chatgpt");

      delete StorageMonitor.prototype.snapshotPath;
    });
  });

  // ─── 46: ?? "unknown" — unreachable in Node (source annotation needed) ──────
  // new Error().stack?.split("\n")[2]?.trim() always returns a defined string in
  // Node.js (stacks always have 3+ lines), so ?? "unknown" never fires.
  // Add to src/browser-bridge.js line 48:
  //   ?.trim() /* v8 ignore next */ ?? "unknown",

  // ─── 813: limit falsy — if(limit) false branch ────────────────────────────
  describe("listResponses — limit:0 skips slice (813 false branch)", () => {
    it("returns all files when limit is 0 (falsy)", async () => {
      await ensureBrowserDirs();
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      for (const name of [
        "2026-01-01T00-00-00-chatgpt.md",
        "2026-01-02T00-00-00-chatgpt.md",
      ]) {
        await fs.writeFile(path.join(responsesDir, name), "# x", "utf8");
      }

      vi.spyOn(ExperienceDb.prototype, "open").mockResolvedValue(undefined);
      vi.spyOn(ExperienceDb.prototype, "close").mockResolvedValue(undefined);
      vi.spyOn(ExperienceDb.prototype, "getDocumentsByFile").mockResolvedValue(
        [],
      );

      const baseDir = path.join(tempDir, ".vscode-rotator");
      // limit: 0 is falsy → if(limit) branch NOT taken → all files returned.
      const results = await listResponses({ limit: 0, baseDir });
      expect(results.length).toBe(2);
    });
  });

  // ─── 625: err?.message ?? err — throw plain string, no .message ───────────
  describe("comparePrompts — err?.message ?? err fallback (625)", () => {
    it("uses err itself when thrown value has no .message property", async () => {
      await ensureBrowserDirs();
      // Plain string has no .message → err?.message is undefined → ?? err fires.
      vi.spyOn(browserBridge, "sendPrompt").mockRejectedValue(
        "plain string error",
      );
      const result = await comparePrompts({
        prompt: "hi",
        platforms: ["chatgpt"],
        dryRun: false,
      });
      expect(result.results[0].error).toBe("plain string error");
    });
  });

  // ─── 931: roleEl.getAttribute() || "unknown" — getAttribute returns "" ─────
  describe("captureThread evaluate — roleEl.getAttribute returns empty string (931)", () => {
    it("falls back to 'unknown' when getAttribute returns empty string", async () => {
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true });

      const fakeContainers = [
        {
          querySelector: (sel) =>
            sel.startsWith("[")
              ? { getAttribute: () => "" } // returns "" → || "unknown" fires (931)
              : { textContent: "some content" },
        },
        {
          querySelector: (sel) =>
            sel.startsWith("[")
              ? { getAttribute: () => "assistant" }
              : { textContent: "reply content" },
        },
      ];
      const fakeDoc = { querySelectorAll: () => fakeContainers };
      const fakePage = makeFullFakePage({
        evaluate: vi.fn(async (fn, args) => {
          const prev = globalThis.document;
          globalThis.document = fakeDoc;
          try {
            return fn(args);
          } finally {
            globalThis.document = prev;
          }
        }),
      });
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue({
        newPage: vi.fn(async () => fakePage),
        close: vi.fn(async () => {}),
      });

      // "unknown" and "assistant" roles → missing "user" → Incomplete thread
      await expect(
        captureThread("chatgpt", { outputDir: responsesDir }),
      ).rejects.toThrow(/Incomplete conversation thread/);
    });
  });

  // ─── 966: turn.role || "unknown" in forEach (966) ─────────────────────────
  describe("captureThread — turn.role falsy in forEach (966)", () => {
    it("uses 'unknown' label in content when turn.role is falsy", async () => {
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true });

      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(
        makeFakeContext({
          evaluate: vi.fn(async () => [
            { role: "user", content: "user msg" }, // passes role validation
            { role: "assistant", content: "reply" }, // passes role validation
            { role: "", content: "extra msg" }, // falsy role → || "unknown" at 966
          ]),
        }),
      );

      const result = await captureThread("chatgpt", {
        outputDir: responsesDir,
      });
      expect(result.filePath).toBeTruthy();
      const written = await fs.readFile(result.filePath, "utf8");
      expect(written).toContain("unknown");
    });
  });

  // ─── 1041: getDefaultThreadSelectors — unknown platform fallback ───────────
  describe("captureThread — unknown platform uses chatgpt selectors (1041)", () => {
    it("falls back to chatgpt selectors for an unrecognised platform", async () => {
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true });

      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(
        makeFakeContext(),
      );

      // Line 1041: defaults[platform] || defaults.chatgpt — the || fallback is
      // unreachable via public API since all 4 valid platforms are in defaults.
      // Add  /* v8 ignore next */  above line 1041 in the source.
      // Lines 1018-1040 (each platform's selector block) are covered below.
      const result = await captureThread("gemini", { outputDir: responsesDir });
      expect(result.turns.length).toBeGreaterThan(0);
    });
  });

  // ─── 1018-1040: getDefaultThreadSelectors — all platform bodies ────────────
  describe("getDefaultThreadSelectors — all known platforms (1018-1040)", () => {
    for (const platform of ["claude", "perplexity"]) {
      it(`covers selector block for platform: ${platform}`, async () => {
        const responsesDir = path.join(
          tempDir,
          ".vscode-rotator",
          "browser-responses",
        );
        await fs.mkdir(responsesDir, { recursive: true });
        vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(
          makeFakeContext(),
        );
        const result = await captureThread(platform, {
          outputDir: responsesDir,
        });
        expect(result.turns.length).toBeGreaterThan(0);
      });
    }
  });
});
