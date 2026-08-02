// tests/browser-clear-session.test.js
//
// Sprint 115 — Session Isolation on Explicit Logout
//
// Test strategy mirrors browser-bridge.coverage-additions.test.js:
//   - Top-level vi.mock("playwright") with a deterministic fake chromium
//   - beforeEach/afterEach real tempDir-as-HOME (mkdtemp / rm), no fs mocking
//   - Unit tests spy on _self.launchBrowser via vi.spyOn(browserBridge, ...)
//   - Integration test (item 4) lets clearSession run through to launchBrowser
//     and captures what newContext receives — the real seam assertion
//
// CRITICAL guards built into this suite:
//   - fakeContext.storageState must NEVER be called inside clearSession
//     (if it is, the impl silently re-persists the state it just deleted)
//   - fakeContext.close() and fakeContext.browserHandle.close() must be called
//     directly — clearSession must not route through closeBrowser

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as browserBridge from "../src/browser-bridge.js";
import { clearSession } from "../src/browser-bridge.js";

// ---------------------------------------------------------------------------
// Top-level playwright mock — mirrors coverage-additions.test.js pattern
// ---------------------------------------------------------------------------
vi.mock("playwright", () => {
  const makeFakeContext = () => ({
    newPage: vi.fn(async () => ({
      goto: vi.fn(async () => {}),
      waitForLoadState: vi.fn(async () => {}),
    })),
    storageState: vi.fn(async () => ({ cookies: [], origins: [] })),
    clearCookies: vi.fn(async () => undefined),
    close: vi.fn(async () => {}),
  });

  const makeFakeBrowser = () => ({
    newContext: vi.fn(async (_opts) => makeFakeContext()),
    close: vi.fn(async () => {}),
  });

  return {
    chromium: { launch: vi.fn(async () => makeFakeBrowser()) },
    firefox: { launch: vi.fn(async () => makeFakeBrowser()) },
  };
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe("clearSession — Sprint 115 session isolation", () => {
  let tempDir;
  let originalHome;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clear-session-"));
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

  // Helper: write a real storage-state.json at the expected path for a platform
  async function writeStorageState(platform, content = { cookies: [{ name: "sid", value: "abc" }], origins: [] }) {
    const stateDir = path.join(tempDir, ".vscode-rotator", "browser-profiles", platform);
    await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
    const statePath = path.join(stateDir, "storage-state.json");
    await fs.writeFile(statePath, JSON.stringify(content), "utf8");
    return statePath;
  }

  function storageStatePath(platform) {
    return path.join(tempDir, ".vscode-rotator", "browser-profiles", platform, "storage-state.json");
  }

  // ─── Item 1: Unit — clearCookies called, storageState NEVER called, file deleted ──
  describe("item 1 — unit: clearCookies called, storageState never called, file removed", () => {
    it("clears cookies and deletes the storage-state file without calling storageState", async () => {
      // Write a real storage-state.json so we can verify real-fs deletion
      const statePath = await writeStorageState("claude");

      // Spy on launchBrowser — return a context whose storageState is tracked
      const fakeContext = {
        clearCookies: vi.fn(async () => undefined),
        storageState: vi.fn(async () => ({ cookies: [], origins: [] })),
        close: vi.fn(async () => {}),
        browserHandle: { close: vi.fn(async () => {}) },
        storageStatePath: statePath,
        platform: "claude",
      };
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(fakeContext);

      await clearSession("claude");

      // clearCookies must have been called exactly once
      expect(fakeContext.clearCookies).toHaveBeenCalledTimes(1);

      // storageState must NEVER be called — regression guard for closeBrowser reuse bug
      expect(fakeContext.storageState).not.toHaveBeenCalled();

      // Real fs: file must be gone
      await expect(fs.stat(statePath)).rejects.toThrow();
    });
  });

  // ─── Item 2: Multi-platform isolation ─────────────────────────────────────
  describe("item 2 — multi-platform isolation: only target platform cleared", () => {
    it("removes claude's file but leaves chatgpt's file intact and unchanged", async () => {
      const claudeContent = { cookies: [{ name: "claude-tok", value: "x" }], origins: [] };
      const chatgptContent = { cookies: [{ name: "gpt-tok", value: "y" }], origins: [] };

      const claudePath = await writeStorageState("claude", claudeContent);
      const chatgptPath = await writeStorageState("chatgpt", chatgptContent);

      // Spy returns a context with the same platform we asked to clear
      const fakeContext = {
        clearCookies: vi.fn(async () => undefined),
        storageState: vi.fn(async () => ({})),
        close: vi.fn(async () => {}),
        browserHandle: { close: vi.fn(async () => {}) },
        storageStatePath: claudePath,
        platform: "claude",
      };
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(fakeContext);

      await clearSession("claude");

      // claude's file must be gone
      await expect(fs.stat(claudePath)).rejects.toThrow();

      // chatgpt's file must still exist and be unchanged
      await expect(fs.stat(chatgptPath)).resolves.toBeTruthy();
      const remaining = JSON.parse(await fs.readFile(chatgptPath, "utf8"));
      expect(remaining).toMatchObject(chatgptContent);
    });
  });

  // ─── Item 3: Missing file (ENOENT swallowed) ──────────────────────────────
  describe("item 3 — missing storage-state file: ENOENT swallowed, clearCookies still called", () => {
    it("resolves without throwing when no storage-state.json exists for the platform", async () => {
      // Do NOT write any file — the ENOENT path
      const fakeContext = {
        clearCookies: vi.fn(async () => undefined),
        storageState: vi.fn(async () => ({})),
        close: vi.fn(async () => {}),
        browserHandle: { close: vi.fn(async () => {}) },
        storageStatePath: storageStatePath("claude"),
        platform: "claude",
      };
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(fakeContext);

      // Must not throw
      await expect(clearSession("claude")).resolves.not.toThrow();

      // clearCookies still called — session is wiped even without a state file
      expect(fakeContext.clearCookies).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Item 4: Integration — after clearSession, launchBrowser gets NO storageState ──
  describe("item 4 — integration: next launchBrowser call starts with no storageState", () => {
    it("proves the platform starts clean on next launch after clearSession", async () => {
      // Write a real storage-state.json with recognizable content
      const stateContent = { cookies: [{ name: "session", value: "secret-token-abc123" }], origins: [] };
      await writeStorageState("claude", stateContent);

      // For clearSession itself, use a spy context (no real playwright needed for the clear op)
      const clearContext = {
        clearCookies: vi.fn(async () => undefined),
        storageState: vi.fn(async () => ({})),
        close: vi.fn(async () => {}),
        browserHandle: { close: vi.fn(async () => {}) },
        storageStatePath: storageStatePath("claude"),
        platform: "claude",
      };
      const launchSpy = vi.spyOn(browserBridge, "launchBrowser")
        .mockResolvedValueOnce(clearContext);  // first call: clearSession's open

      await clearSession("claude");

      // Verify the file is actually gone from disk before the next launch
      await expect(fs.stat(storageStatePath("claude"))).rejects.toThrow();

      // Now restore spy so the real launchBrowser runs for the second call,
      // which will go through playwright (mocked at top level).
      launchSpy.mockRestore();

      // Capture what options newContext receives on the next launch
      const pw = await import("playwright");
      let capturedCtxOpts = null;
      pw.chromium.launch.mockImplementationOnce(async () => ({
        newContext: vi.fn(async (opts) => {
          capturedCtxOpts = opts;
          return {
            newPage: vi.fn(async () => ({ goto: vi.fn(async () => {}) })),
            storageState: vi.fn(async () => ({})),
            close: vi.fn(async () => {}),
          };
        }),
        close: vi.fn(async () => {}),
      }));

      const ctx = await browserBridge.launchBrowser({ platform: "claude" });
      await ctx.close();

      // THE SEAM ASSERTION: no storageState should have been passed to newContext
      // because the file was deleted — proves a fresh session, not just a deleted file
      expect(capturedCtxOpts).not.toHaveProperty("storageState");
    });
  });

  // ─── Item 5: Guard clause — platform is required ──────────────────────────
  describe("item 5 — guard clause: platform is required", () => {
    it("rejects with 'platform is required' when called with undefined", async () => {
      await expect(clearSession(undefined)).rejects.toThrow(/platform is required/);
    });

    it("rejects with 'platform is required' when called with empty string", async () => {
      await expect(clearSession("")).rejects.toThrow(/platform is required/);
    });
  });

  // ─── Return value ──────────────────────────────────────────────────────────
  describe("return value", () => {
    it("returns { platform, message } confirming the cleared platform", async () => {
      await writeStorageState("gemini");

      const fakeContext = {
        clearCookies: vi.fn(async () => undefined),
        storageState: vi.fn(async () => ({})),
        close: vi.fn(async () => {}),
        browserHandle: { close: vi.fn(async () => {}) },
        storageStatePath: storageStatePath("gemini"),
        platform: "gemini",
      };
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(fakeContext);

      const result = await clearSession("gemini");

      expect(result).toMatchObject({
        platform: "gemini",
        message: expect.stringContaining("gemini"),
      });
    });
  });

  // ─── Direct close (not via closeBrowser) ──────────────────────────────────
  describe("context close — must use direct close, not closeBrowser", () => {
    it("calls context.close() and browserHandle.close() directly", async () => {
      await writeStorageState("chatgpt");

      const browserHandleClose = vi.fn(async () => {});
      const contextClose = vi.fn(async () => {});
      const fakeContext = {
        clearCookies: vi.fn(async () => undefined),
        storageState: vi.fn(async () => ({})),
        close: contextClose,
        browserHandle: { close: browserHandleClose },
        storageStatePath: storageStatePath("chatgpt"),
        platform: "chatgpt",
      };
      vi.spyOn(browserBridge, "launchBrowser").mockResolvedValue(fakeContext);

      await clearSession("chatgpt");

      expect(contextClose).toHaveBeenCalledTimes(1);
      expect(browserHandleClose).toHaveBeenCalledTimes(1);
    });
  });
});
