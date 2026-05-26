// REGRESSION: Historical malformed payload handling
// Source: test_summary.txt, Sprint 15.6
// Must never be removed — encode historical failure as permanent gate
//
// Background: Capture pipeline received many malformed payloads with missing required fields.
// Each shape used to cause crashes or unhandled rejections.
// Now each must return a structured error (not crash, not unhandled rejection).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("Regression: Malformed Payloads", () => {
  let tempDir;
  let mockIpcMain;
  let mockMainWindow;
  let ingester;
  let captureHandler;
  let registerCaptureHandlers;

  beforeEach(async () => {
    // Setup temp directory
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "malformed-payloads-test-"),
    );
    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    await fs.mkdir(browserResponsesDir, { recursive: true });
    process.env.HOME = tempDir;

    // Mock ipcMain
    mockIpcMain = {
      handlers: {},
      on: function (channel, handler) {
        this.handlers[channel] = handler;
      },
    };

    // Mock mainWindow to capture error events
    const errorEvents = [];
    mockMainWindow = {
      webContents: {
        send: (channel, data) => {
          if (channel === "capture:error") {
            errorEvents.push(data);
          }
        },
      },
      getErrorEvents: () => errorEvents,
    };

    // Import real ingester and handlers
    const { DocumentIngester } =
      await import("../../src/llm/document-ingester.js");
    ingester = new DocumentIngester({ baseDir: tempDir });

    const mod = await import("../../electron-ui/ipc/capture-handlers.cjs");
    registerCaptureHandlers = mod.registerCaptureHandlers;

    // Register handlers
    await registerCaptureHandlers(mockIpcMain, ingester, mockMainWindow);
    captureHandler = mockIpcMain.handlers["capture:response"];
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 1: Missing 'html' field
  it("rejects payload missing html field with structured error", async () => {
    const payload = {
      platform: "claude",
      text: "Response without HTML",
      url: "https://claude.ai/",
      ts: Date.now(),
      // html is missing
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should NOT crash
    // Should send error event with structured format
    const errorEvents = mockMainWindow.getErrorEvents();
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]).toHaveProperty("code");
    expect(errorEvents[0]).toHaveProperty("message");
    expect(errorEvents[0].code).toBe("ROTATOR_BROWSER_CAPTURE_INVALID");

    // Should NOT create file
    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);
  });

  // Test 2: Missing 'text' field
  it("rejects payload missing text field with structured error", async () => {
    const payload = {
      platform: "gemini",
      html: "<div>Response</div>",
      url: "https://gemini.google.com/",
      ts: Date.now(),
      // text is missing
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://gemini.google.com/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorEvents = mockMainWindow.getErrorEvents();
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]).toHaveProperty(
      "code",
      "ROTATOR_BROWSER_CAPTURE_INVALID",
    );

    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);
  });

  // Test 3: Missing 'platform' field
  it("rejects payload missing platform field with structured error", async () => {
    const payload = {
      html: "<div>Response</div>",
      text: "Response text",
      url: "https://test.com/",
      ts: Date.now(),
      // platform is missing
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://test.com/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorEvents = mockMainWindow.getErrorEvents();
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]).toHaveProperty(
      "code",
      "ROTATOR_BROWSER_CAPTURE_INVALID",
    );

    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);
  });

  // Test 4: Missing 'url' field
  it("rejects payload missing url field with structured error", async () => {
    const payload = {
      platform: "perplexity",
      html: "<div>Response</div>",
      text: "Response text",
      ts: Date.now(),
      // url is missing
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://perplexity.ai/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorEvents = mockMainWindow.getErrorEvents();
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]).toHaveProperty(
      "code",
      "ROTATOR_BROWSER_CAPTURE_INVALID",
    );

    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);
  });

  // Test 5: Missing 'ts' field
  it("rejects payload missing ts field with structured error", async () => {
    const payload = {
      platform: "chatgpt",
      html: "<div>Response</div>",
      text: "Response text",
      url: "https://chat.openai.com/",
      // ts is missing
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://chat.openai.com/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorEvents = mockMainWindow.getErrorEvents();
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]).toHaveProperty(
      "code",
      "ROTATOR_BROWSER_CAPTURE_INVALID",
    );

    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);
  });

  // Test 6: Null payload
  it("rejects null payload with structured error", async () => {
    const payload = null;

    const mockEvent = {
      sender: {
        getURL: () => "https://test.com/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorEvents = mockMainWindow.getErrorEvents();
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]).toHaveProperty(
      "code",
      "ROTATOR_BROWSER_CAPTURE_INVALID",
    );

    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);
  });

  // Test 7: Undefined payload
  it("rejects undefined payload with structured error", async () => {
    const payload = undefined;

    const mockEvent = {
      sender: {
        getURL: () => "https://test.com/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorEvents = mockMainWindow.getErrorEvents();
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]).toHaveProperty(
      "code",
      "ROTATOR_BROWSER_CAPTURE_INVALID",
    );

    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);
  });

  // Test 8: Invalid URL format
  it("rejects payload with invalid url format with structured error", async () => {
    const payload = {
      platform: "claude",
      html: "<div>Response</div>",
      text: "Response text",
      url: "not-a-valid-url",
      ts: Date.now(),
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorEvents = mockMainWindow.getErrorEvents();
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]).toHaveProperty(
      "code",
      "ROTATOR_BROWSER_CAPTURE_INVALID",
    );

    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);
  });

  // Test 9: Empty platform string
  it("rejects payload with empty platform string with structured error", async () => {
    const payload = {
      platform: "",
      html: "<div>Response</div>",
      text: "Response text",
      url: "https://test.com/",
      ts: Date.now(),
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://test.com/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorEvents = mockMainWindow.getErrorEvents();
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]).toHaveProperty(
      "code",
      "ROTATOR_BROWSER_CAPTURE_INVALID",
    );

    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);
  });

  // Test 10: Negative timestamp
  it("rejects payload with negative timestamp with structured error", async () => {
    const payload = {
      platform: "claude",
      html: "<div>Response</div>",
      text: "Response text",
      url: "https://claude.ai/",
      ts: -1000,
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorEvents = mockMainWindow.getErrorEvents();
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]).toHaveProperty(
      "code",
      "ROTATOR_BROWSER_CAPTURE_INVALID",
    );

    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);
  });
});
