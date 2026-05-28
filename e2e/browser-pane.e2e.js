import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.setConfig?.({ testTimeout: 120000 }); // important if supported
vi.setConfig?.({ hookTimeout: 120000 });

describe("E2E: Browser Pane Integration", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "e2e-browser-pane-"));
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("BrowserPane class", () => {
    it("initializes with correct defaults", async () => {
      const { BrowserPane } = await import("../electron-ui/browser-pane.cjs");

      const mockWindow = {
        getContentBounds: () => ({ width: 1000, height: 600 }),
        webContents: { send: vi.fn() },
        contentView: {
          addChildView: vi.fn(),
          removeChildView: vi.fn(),
        },
      };

      const pane = new BrowserPane(mockWindow, {
        platform: "chatgpt",
        preloadPath: "/path",
      });

      expect(pane.currentPlatform).toBe("chatgpt");
      expect(pane.currentView).toBeNull();
      expect(pane.viewCache.size).toBe(0);
    });

    it("supports all platforms", async () => {
      const { BrowserPane } = await import("../electron-ui/browser-pane.cjs");

      const mockWindow = {
        getContentBounds: () => ({ width: 1000, height: 600 }),
        webContents: { send: vi.fn() },
      };

      for (const p of ["chatgpt", "claude", "gemini", "perplexity"]) {
        const pane = new BrowserPane(mockWindow, { platform: p });
        expect(pane.currentPlatform).toBe(p);
      }
    });

    it("computes bounds correctly", async () => {
      const { BrowserPane } = await import("../electron-ui/browser-pane.cjs");

      const pane = new BrowserPane({
        getContentBounds: () => ({ width: 1200, height: 800 }),
        webContents: {},
      });

      const bounds = pane.getBounds();

      expect(bounds.x).toBe(220);
      expect(bounds.y).toBe(80);
      expect(bounds.width).toBe(980);
      expect(bounds.height).toBe(720);
    });

    it("validates platform names", async () => {
      const { BrowserPane } = await import("../electron-ui/browser-pane.cjs");

      const pane = new BrowserPane({
        getContentBounds: () => ({ width: 1000, height: 600 }),
      });

      await expect(pane.switchPlatform("claude")).resolves.not.toThrow();
      await expect(pane.switchPlatform("bad")).rejects.toThrow();
    });
  });

  describe("Capture handlers integration", () => {
    it("registers capture handler", async () => {
      const { registerCaptureHandlers } =
        await import("../electron-ui/ipc/capture-handlers.cjs");

      const handlers = {};
      const mockIpcMain = {
        on: (ch, fn) => (handlers[ch] = fn),
      };

      const mockIngester = {
        ingestFile: vi.fn().mockResolvedValue({
          chunks: 1,
          skipped: false,
        }),
      };

      const mockWindow = { webContents: { send: vi.fn() } };

      await registerCaptureHandlers(mockIpcMain, mockIngester, mockWindow);

      expect(handlers["capture:response"]).toBeDefined();
    });

    it("validates payload handling", async () => {
      const { registerCaptureHandlers } =
        await import("../electron-ui/ipc/capture-handlers.cjs");

      const handlers = {};
      const mockIpcMain = {
        on: (ch, fn) => (handlers[ch] = fn),
      };

      const mockIngester = {
        ingestFile: vi.fn().mockResolvedValue({ chunks: 1, skipped: false }),
      };

      const mockWindow = { webContents: { send: vi.fn() } };

      await registerCaptureHandlers(mockIpcMain, mockIngester, mockWindow);

      const handler = handlers["capture:response"];

      const valid = {
        platform: "claude",
        html: "<div/>",
        text: "t",
        url: "https://x.com",
        ts: Date.now(),
      };

      await handler({}, valid);
      expect(mockIngester.ingestFile).toHaveBeenCalled();

      mockIngester.ingestFile.mockClear();

      const invalid = [
        { html: "a", text: "b", url: "c", ts: Date.now() },
        { platform: "claude", text: "b", url: "c", ts: Date.now() },
        { platform: "claude", html: "a", url: "c", ts: Date.now() },
        { platform: "claude", html: "a", text: "b", ts: Date.now() },
      ];

      for (const p of invalid) await handler({}, p);

      expect(mockIngester.ingestFile).not.toHaveBeenCalled();
    });
  });

  describe("Browser selectors", () => {
    it("exports platforms", async () => {
      const { SELECTORS } = await import("../src/browser-selectors.js");

      expect(Object.keys(SELECTORS)).toEqual(
        expect.arrayContaining(["chatgpt", "claude", "gemini", "perplexity"]),
      );
    });

    it("valid shape", async () => {
      const { SELECTORS } = await import("../src/browser-selectors.js");

      for (const s of Object.values(SELECTORS)) {
        expect(typeof s.responseContainer).toBe("string");
        expect(typeof s.completionDelay).toBe("number");
        expect(typeof s.streamingIndicator).toBe("string");
      }
    });

    it("loads overrides", async () => {
      const { loadOverrides, SELECTORS } =
        await import("../src/browser-selectors.js");

      const file = path.join(tempDir, "sel.json");

      await fs.writeFile(
        file,
        JSON.stringify({
          chatgpt: { completionDelay: 3000 },
        }),
      );

      const merged = await loadOverrides(file);

      expect(merged.chatgpt.completionDelay).toBe(3000);
      expect(merged.chatgpt.responseContainer).toBe(
        SELECTORS.chatgpt.responseContainer,
      );
    });
  });

  describe("IPC flow", () => {
    it("emits capture:done", async () => {
      const { registerCaptureHandlers } =
        await import("../electron-ui/ipc/capture-handlers.cjs");

      const handlers = {};
      const events = [];

      const mockIpcMain = {
        on: (c, fn) => (handlers[c] = fn),
      };

      const mockIngester = {
        ingestFile: vi.fn().mockResolvedValue({
          chunks: 3,
          skipped: false,
        }),
      };

      const mockWindow = {
        webContents: {
          send: (c, d) => events.push({ c, d }),
        },
      };

      await registerCaptureHandlers(mockIpcMain, mockIngester, mockWindow);

      const handler = handlers["capture:response"];

      await handler(
        {},
        {
          platform: "gemini",
          html: "<div/>",
          text: "t",
          url: "https://g.com",
          ts: Date.now(),
        },
      );

      const done = events.find((e) => e.c === "capture:done");

      expect(done).toBeDefined();
      expect(done.d.chunks).toBe(3);
    });
  });

  describe("filesystem", () => {
    it("creates directory", async () => {
      const { registerCaptureHandlers } =
        await import("../electron-ui/ipc/capture-handlers.cjs");

      const handlers = {};
      const mockIpcMain = { on: (c, f) => (handlers[c] = f) };

      const mockIngester = {
        ingestFile: vi.fn().mockResolvedValue({ chunks: 1, skipped: false }),
      };

      const mockWindow = { webContents: { send: vi.fn() } };

      await registerCaptureHandlers(mockIpcMain, mockIngester, mockWindow);

      const handler = handlers["capture:response"];

      const payload = {
        platform: "claude",
        html: "<div/>",
        text: "t",
        url: "https://c.com",
        ts: Date.now(),
      };

      const mockEvent = {
        sender: {
          getURL: () => "https://test.com/",
        },
      };
      await handler(mockEvent, payload);

      const dir = path.join(tempDir, ".vscode-rotator", "browser-responses");

      const exists = await fs
        .stat(dir)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });
  });
});
