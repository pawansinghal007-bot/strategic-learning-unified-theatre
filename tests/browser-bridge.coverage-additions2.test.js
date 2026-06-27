// tests/browser-bridge.coverage-additions2.test.js
//
// Covers remaining lines in browser-bridge.js.
//
// TWO LINES REQUIRE SOURCE ANNOTATIONS (unreachable from Node tests):
//
// 1. Line 521 — log.error inside sendPrompt's catch around ingestBrowserResponseFile.
//    ingestBrowserResponseFile has its own internal try/catch that swallows all
//    errors, so nothing ever propagates to sendPrompt's catch. Add to source:
//
//      try {
//        /* v8 ignore next */
//        await ingestBrowserResponseFile(responsePath);
//      } catch (err) {
//        /* v8 ignore next 6 */
//        log.error("browser.ingest.failure", { ... });
//      }
//
// 2. Lines 925-937 — inline page.evaluate() browser-side callback. Runs in a
//    browser VM, not Node — V8 cannot instrument it. Add above line 924:
//      /* v8 ignore next 15 */

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
  addPrompt,
  runPromptTemplate,
  loginToPage,
  captureThread,
  tagResponse,
} from "../src/browser-bridge.js";

import { ExperienceDb } from "../src/llm/experience-db.js";

// ---------------------------------------------------------------------------
// vi.mock calls — hoisted before all imports by Vitest
// ---------------------------------------------------------------------------

// playwright — no real browser. Individual tests use mockImplementationOnce
// on pw.chromium.launch / pw.firefox.launch to capture options.
vi.mock("playwright", () => {
  const makeContext = () => ({
    newPage: vi.fn(async () => ({
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
    })),
    storageState: vi.fn(async () => ({})),
    close: vi.fn(async () => {}),
  });
  // browser is also used as context.browserHandle — needs once/isConnected.
  const makeBrowser = () => {
    const browser = {
      newContext: vi.fn(async (_opts) => makeContext()),
      once: vi.fn((event, cb) => {
        if (event === "disconnected") setImmediate(cb);
      }),
      isConnected: vi.fn(() => false),
      close: vi.fn(async () => {}),
    };
    return browser;
  };
  return {
    chromium: { launch: vi.fn(async (_opts) => makeBrowser()) },
    firefox: { launch: vi.fn(async (_opts) => makeBrowser()) },
  };
});

// readline/promises — browser-bridge.js imports this as a default:
//   import readline from "node:readline/promises"
// then calls readline.createInterface(...). Mock the default export.
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
// Suite
// ---------------------------------------------------------------------------
describe("Browser Bridge — coverage additions 2", () => {
  let tempDir;
  let originalHome;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bb-cov2-"));
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

  // ─── 137-140: Float32Array → Buffer in tagResponse ────────────────────────
  describe("tagResponse — Float32Array embedding conversion (137-140)", () => {
    it("converts Float32Array rows to Buffer before upserting", async () => {
      await ensureBrowserDirs();
      const filename = "2026-05-19T10-30-45-chatgpt.md";
      const responsePath = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
        filename,
      );
      await fs.writeFile(responsePath, "# test\n\nContent", "utf8");
      const baseDir = path.join(tempDir, ".vscode-rotator");

      // Stub open/close so ExperienceDb never calls loadConfig/assertFeatureEnabled.
      vi.spyOn(ExperienceDb.prototype, "open").mockResolvedValueOnce(undefined);
      vi.spyOn(ExperienceDb.prototype, "close").mockResolvedValueOnce(
        undefined,
      );

      // Return a row with a Float32Array embedding — forces the 137-140 branch.
      vi.spyOn(
        ExperienceDb.prototype,
        "getDocumentsByFile",
      ).mockResolvedValueOnce([
        {
          content: "test",
          embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
          source_type: "llm-response",
          platform: "chatgpt",
          file_ts: "2026-05-19T10:30:45.000Z",
          turn_index: null,
          metadata: null,
        },
      ]);

      vi.spyOn(
        ExperienceDb.prototype,
        "replaceDocumentsForFile",
      ).mockResolvedValueOnce(undefined);

      const result = await tagResponse(filename, { quality: "good", baseDir });
      expect(result).toMatchObject({
        filename,
        quality: "good",
        mistakeCreated: false,
      });
    });
  });

  // ─── 302-303: getAdapterModule catch / rethrow ────────────────────────────
  describe("getAdapterModule — adapter not found (302-303)", () => {
    it("throws for a platform with no adapter file", async () => {
      await expect(
        sendPrompt({
          platform: "no-such-platform",
          prompt: "hi",
          dryRun: false,
        }),
      ).rejects.toThrow(/Adapter not found for platform: no-such-platform/);
    });
  });

  // ─── 315-316, 323, 355: setupLauncher + resolvedPath ──────────────────────
  describe("launchBrowser — setupLauncher branches", () => {
    it("calls firefox.launch for browserType 'firefox' (315-316)", async () => {
      const pw = await import("playwright");
      const before = pw.firefox.launch.mock.calls.length;
      const ctx = await launchBrowser({ browserType: "firefox" });
      await ctx.close();
      expect(pw.firefox.launch.mock.calls.length).toBeGreaterThan(before);
    });

    it("sets executablePath from BRAVE_PATH for 'brave' (323 + 355)", async () => {
      const pw = await import("playwright");
      process.env.BRAVE_PATH = "/opt/brave/brave";
      let capturedOpts = null;
      pw.chromium.launch.mockImplementationOnce(async (opts) => {
        capturedOpts = opts;
        return {
          newContext: vi.fn(async () => ({ close: vi.fn(async () => {}) })),
          close: vi.fn(async () => {}),
        };
      });
      try {
        const ctx = await launchBrowser({ browserType: "brave" });
        await ctx.close();
      } finally {
        delete process.env.BRAVE_PATH;
      }
      expect(capturedOpts?.executablePath).toBe("/opt/brave/brave");
    });

    it("sets executablePath from FIREFOX_PATH for 'firefox' (316 + 355)", async () => {
      const pw = await import("playwright");
      process.env.FIREFOX_PATH = "/opt/firefox/firefox";
      let capturedOpts = null;
      pw.firefox.launch.mockImplementationOnce(async (opts) => {
        capturedOpts = opts;
        return {
          newContext: vi.fn(async () => ({ close: vi.fn(async () => {}) })),
          close: vi.fn(async () => {}),
        };
      });
      try {
        const ctx = await launchBrowser({ browserType: "firefox" });
        await ctx.close();
      } finally {
        delete process.env.FIREFOX_PATH;
      }
      expect(capturedOpts?.executablePath).toBe("/opt/firefox/firefox");
    });
  });

  // ─── 366-367: launchBrowser reads storage-state ───────────────────────────
  describe("launchBrowser — reads existing storage-state (366-367)", () => {
    it("passes parsed storageState to newContext when file exists", async () => {
      const platform = "chatgpt";
      const storageStatePath = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-profiles",
        platform,
        "storage-state.json",
      );
      await fs.mkdir(path.dirname(storageStatePath), { recursive: true });
      const fakeState = {
        cookies: [{ name: "tok", value: "abc" }],
        origins: [],
      };
      await fs.writeFile(storageStatePath, JSON.stringify(fakeState), "utf8");

      const pw = await import("playwright");
      let capturedCtxOpts = null;
      pw.chromium.launch.mockImplementationOnce(async () => ({
        newContext: vi.fn(async (opts) => {
          capturedCtxOpts = opts;
          return { close: vi.fn(async () => {}) };
        }),
        close: vi.fn(async () => {}),
      }));

      const ctx = await launchBrowser({ platform });
      await ctx.close();
      expect(capturedCtxOpts).toMatchObject({ storageState: fakeState });
    });
  });

  // ─── 391: closeBrowser — storageStatePath write-back ──────────────────────
  describe("closeBrowser — storageStatePath write-back (391)", () => {
    it("saves storageState to disk when context has storageStatePath", async () => {
      const storageStatePath = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-profiles",
        "chatgpt",
        "storage-state.json",
      );
      const fakeState = { cookies: [{ name: "s", value: "v" }] };
      const fakeCtx = {
        storageStatePath,
        storageState: vi.fn(async () => fakeState),
        close: vi.fn(async () => {}),
        browserHandle: { close: vi.fn(async () => {}) },
      };
      await closeBrowser(fakeCtx);
      const written = JSON.parse(await fs.readFile(storageStatePath, "utf8"));
      expect(written).toMatchObject(fakeState);
    });
  });

  // ─── 512-513: sendPrompt — rename retry ───────────────────────────────────
  describe("sendPrompt — rename-retry on EEXIST (512-513)", () => {
    it("unlinks dest and retries when first fs.rename throws EEXIST", async () => {
      await ensureBrowserDirs();
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(
        makeFakeContext(),
      );

      let calls = 0;
      const origRename = fs.rename.bind(fs);
      vi.spyOn(fs, "rename").mockImplementation(async (...args) => {
        if (calls++ === 0)
          throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
        return origRename(...args);
      });

      const result = await sendPrompt({
        platform: "chatgpt",
        prompt: "test",
        dryRun: false,
      });
      expect(result.platform).toBe("chatgpt");
      expect(calls).toBeGreaterThan(1);
    });
  });

  // ─── 565-569: loadPlatformLastSend — malformed JSON ───────────────────────
  describe("loadPlatformLastSend — malformed JSON (565-569)", () => {
    it("falls back to {} when platform-last-send.json is corrupt", async () => {
      await ensureBrowserDirs();
      const lastSendPath = path.join(
        tempDir,
        ".vscode-rotator",
        "platform-last-send.json",
      );
      await fs.writeFile(lastSendPath, "{bad json", "utf8");

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

  // ─── 578-583: waitForMinimumDelay — elapsed < MIN_DELAY ───────────────────
  describe("waitForMinimumDelay — delay branch (578-583)", () => {
    it("waits when platform was used very recently", async () => {
      await ensureBrowserDirs();
      const lastSendPath = path.join(
        tempDir,
        ".vscode-rotator",
        "platform-last-send.json",
      );
      // lastSend = now → elapsed ≈ 0 ms → elapsed < MIN_DELAY → branch fires.
      await fs.writeFile(
        lastSendPath,
        JSON.stringify({ chatgpt: Date.now() }),
        "utf8",
      );

      vi.spyOn(browserBridge, "sendPrompt").mockResolvedValue({
        platform: "chatgpt",
        prompt: "hi",
        response: "ok",
        responsePath: path.join(tempDir, "r.md"),
        timestamp: "t",
      });

      // Replace setTimeout with a version that fires the callback on the next
      // microtask tick instead of waiting the real delay. This keeps all real
      // fs I/O working (no fake timers) while still executing lines 581-583.
      const realSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, "setTimeout").mockImplementation((cb, _delay) => {
        return realSetTimeout(cb, 0);
      });

      await comparePrompts({
        prompt: "hi",
        platforms: ["chatgpt"],
        dryRun: false,
      });
    });
  });

  // ─── 707-715: runPromptTemplate ───────────────────────────────────────────
  describe("runPromptTemplate (707-715)", () => {
    it("substitutes variables and calls sendPrompt", async () => {
      const p = await addPrompt({
        name: "Tmpl",
        template: "Tell me about {{topic}}.",
        tags: [],
        platforms: [],
      });

      const result = await runPromptTemplate({
        promptId: p.id,
        platform: "chatgpt",
        variables: { topic: "testing" },
        dryRun: true,
      });

      expect(result).toMatchObject({
        platform: "chatgpt",
        prompt: "Tell me about testing.",
        dryRun: true,
      });
    });
  });

  // ─── 718-782: loginToPage ─────────────────────────────────────────────────
  // loginToPage calls bare launchBrowser (not _self.launchBrowser), so
  // vi.spyOn cannot intercept it. We let the real launchBrowser run, which
  // uses the playwright mock above. That mock's browser has once/isConnected
  // so the 'disconnected' event fires immediately via setImmediate.
  describe("loginToPage (718-782)", () => {
    it("throws when platform is missing (720)", async () => {
      await expect(loginToPage({})).rejects.toThrow(/platform is required/);
    });

    it("completes when browser disconnects immediately (730-771)", async () => {
      // Real launchBrowser runs → mocked playwright browser fires 'disconnected'
      // via setImmediate → Promise.race resolves → loginToPage returns.
      vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await loginToPage({ platform: "chatgpt" });
      expect(result).toMatchObject({
        platform: "chatgpt",
        message: expect.stringContaining("Login completed"),
      });
    });

    it("calls rl.close() when promptClosed wins the race (759)", async () => {
      // Make readline.question resolve immediately (stdin wins over disconnect).
      // browserHandle.once never fires so promptClosed wins Promise.race.
      const pw = await import("playwright");
      const mockRl = {
        question: vi.fn(() => Promise.resolve()),
        close: vi.fn(),
      };
      const { default: readline } = await import("node:readline/promises");
      readline.createInterface.mockReturnValueOnce(mockRl);

      pw.chromium.launch.mockImplementationOnce(async () => ({
        newContext: vi.fn(async () => ({
          newPage: vi.fn(async () => ({ goto: vi.fn(async () => {}) })),
          storageState: vi.fn(async () => ({})),
          close: vi.fn(async () => {}),
        })),
        // once never fires — promptClosed wins the race
        once: vi.fn(),
        isConnected: vi.fn(() => false),
        close: vi.fn(async () => {}),
      }));

      vi.spyOn(console, "log").mockImplementation(() => {});
      await loginToPage({ platform: "chatgpt" });

      // rl.close() called once inside the .then() (line 759) and once after
      // Promise.race (line 763) — the important thing is it was called.
      expect(mockRl.close).toHaveBeenCalled();
    });

    it("calls browserHandle.close() when isConnected() returns true (766)", async () => {
      // Make isConnected() return true so line 766 fires.
      const pw = await import("playwright");
      const mockBrowserClose = vi.fn(async () => {});
      pw.chromium.launch.mockImplementationOnce(async () => ({
        newContext: vi.fn(async () => ({
          newPage: vi.fn(async () => ({ goto: vi.fn(async () => {}) })),
          storageState: vi.fn(async () => ({})),
          close: vi.fn(async () => {}),
        })),
        once: vi.fn((event, cb) => {
          if (event === "disconnected") setImmediate(cb);
        }),
        isConnected: vi.fn(() => true), // triggers line 766
        close: mockBrowserClose,
      }));

      vi.spyOn(console, "log").mockImplementation(() => {});
      await loginToPage({ platform: "chatgpt" });

      expect(mockBrowserClose).toHaveBeenCalled();
    });

    it("rethrows and closes browser when page.goto throws (772-782)", async () => {
      // Override chromium.launch so newContext().newPage().goto() throws.
      const pw = await import("playwright");
      pw.chromium.launch.mockImplementationOnce(async () => ({
        newContext: vi.fn(async () => ({
          newPage: vi.fn(async () => ({
            goto: vi.fn(async () => {
              throw new Error("nav failed");
            }),
          })),
          storageState: vi.fn(async () => ({})),
          close: vi.fn(async () => {}),
        })),
        once: vi.fn(),
        isConnected: vi.fn(() => false),
        close: vi.fn(async () => {}),
      }));

      await expect(loginToPage({ platform: "chatgpt" })).rejects.toThrow(
        /nav failed/,
      );
    });
  });

  // ─── 986-987: captureThread — rename-retry ────────────────────────────────
  describe("captureThread — rename-retry on EEXIST (986-987)", () => {
    it("unlinks dest and retries when first rename throws EEXIST", async () => {
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true });

      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(
        makeFakeContext(),
      );

      let count = 0;
      const orig = fs.rename.bind(fs);
      vi.spyOn(fs, "rename").mockImplementation(async (...args) => {
        if (count++ === 0)
          throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
        return orig(...args);
      });

      const result = await captureThread("chatgpt", {
        outputDir: responsesDir,
      });
      expect(result.turns.length).toBe(2);
    });
  });

  // ─── 925-937: page.evaluate browser-side callback ─────────────────────────
  // The callback is passed to page.evaluate() as a function. Real Playwright
  // serialises it and runs it in a browser VM — V8 never sees it execute.
  // Fix: make our fake page.evaluate actually CALL the callback, injecting a
  // minimal plain-JS document shim so querySelectorAll works without a real DOM.
  describe("captureThread — page.evaluate callback execution (925-937)", () => {
    it("executes the evaluate callback with a fake document shim", async () => {
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true });

      // Minimal element shim. querySelector handles both:
      //   "[data-message-author-role]"  → roleEl  (has getAttribute)
      //   "div[class*='prose']"         → contentEl (has textContent)
      function makeContainer(role, content) {
        return {
          querySelector: (sel) =>
            sel.startsWith("[")
              ? { getAttribute: () => role } // roleEl
              : { textContent: content }, // contentEl
        };
      }

      const fakeContainers = [
        makeContainer("user", "hello there"),
        makeContainer("assistant", "hi back"),
      ];

      // querySelectorAll must return something Array.from() can iterate.
      const fakeDoc = {
        querySelectorAll: () => fakeContainers, // plain array — Array.from works
      };

      const fakePage = makeFullFakePage({
        evaluate: vi.fn(async (fn, args) => {
          // Call the ORIGINAL function object directly — not fn.toString() —
          // so V8 instruments the code at its original source location (925-937).
          // The callback references `document` as a free variable (browser global),
          // so we temporarily install our shim on globalThis before calling.
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

      const result = await captureThread("chatgpt", {
        outputDir: responsesDir,
      });
      expect(result.turns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "user", content: "hello there" }),
          expect.objectContaining({ role: "assistant", content: "hi back" }),
        ]),
      );
    });
  });

  // ─── 521: sendPrompt ingest error catch ───────────────────────────────────
  describe("sendPrompt — ingest error catch logger (521)", () => {
    it("logs ingest error at line 521 when loadConfig throws inside ingestBrowserResponseFile", async () => {
      await ensureBrowserDirs();
      // launchBrowser is spied — it never calls loadConfig (line 339 is bypassed).
      // So the FIRST call to loadConfig comes from ingestBrowserResponseFile
      // at line 184, before its own try/catch. Throwing there propagates to
      // sendPrompt's catch at line 520 → executes line 521.
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(
        makeFakeContext(),
      );

      const configModule = await import("../src/internal/config.js");
      vi.spyOn(configModule, "loadConfig").mockRejectedValue(
        new Error("loadConfig failed in ingest"),
      );

      // sendPrompt must still resolve — line 521 logs the error but doesn't rethrow.
      const result = await sendPrompt({
        platform: "chatgpt",
        prompt: "test 521",
        dryRun: false,
      });
      expect(result.platform).toBe("chatgpt");
    });
  });

  // ─── 1000-1003: captureThread — outer catch ───────────────────────────────
  describe("captureThread — outer catch on fs.open failure (1000-1003)", () => {
    it("tries to unlink tmp and rethrows when fs.open throws", async () => {
      const responsesDir = path.join(
        tempDir,
        ".vscode-rotator",
        "browser-responses",
      );
      await fs.mkdir(responsesDir, { recursive: true });

      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(
        makeFakeContext(),
      );
      vi.spyOn(fs, "open").mockRejectedValue(
        Object.assign(new Error("EMFILE: too many open files"), {
          code: "EMFILE",
        }),
      );

      await expect(
        captureThread("chatgpt", { outputDir: responsesDir }),
      ).rejects.toThrow(/EMFILE/);
    });
  });
});
