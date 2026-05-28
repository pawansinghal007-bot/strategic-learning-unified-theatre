// REGRESSION: Ingestion error handling
// Source: test_summary.txt, Sprint 15.6
// Must never be removed — encode historical failure as permanent gate
//
// Background: Ingestion failures used to crash the capture pipeline or throw unhandled errors.
// Now ingestion failures must be caught and reported via error events without crashing.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("Regression: Ingestion Error Handling", () => {
  let tempDir;
  let mockIpcMain;
  let mockMainWindow;
  let captureHandler;
  let registerCaptureHandlers;

  beforeEach(async () => {
    // Setup temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingestion-error-test-"));
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

    // Mock mainWindow
    const emittedEvents = [];
    mockMainWindow = {
      webContents: {
        send: (channel, data) => {
          emittedEvents.push({ channel, data });
        },
      },
      getEmittedEvents: () => emittedEvents,
    };

    // Import real ingester
    const { DocumentIngester } =
      await import("../../src/llm/document-ingester.js");
    const ingester = new DocumentIngester({ baseDir: tempDir });

    // Import handlers
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

  // Test 1: Valid payload ingests successfully
  it("successfully ingests valid capture payload", async () => {
    const payload = {
      platform: "claude",
      html: "<div>Response content</div>",
      text: "Response content",
      url: "https://claude.ai/",
      ts: Date.now(),
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const events = mockMainWindow.getEmittedEvents();
    const captureEvent = events.find((e) => e.channel === "capture:done");

    expect(captureEvent).toBeDefined();
    expect(captureEvent.data).toHaveProperty("platform", "claude");
    expect(captureEvent.data).toHaveProperty("chunks");
    expect(captureEvent.data.chunks).toBeGreaterThan(0);
    expect(captureEvent.data).toHaveProperty("skipped", false);
  });

  // Test 2: Rapid successive captures don't cause ingestion lock issues
  it("handles rapid successive captures without ingestion errors", async () => {
    const baseTime = Date.now();
    const captures = [];

    for (let i = 0; i < 5; i++) {
      captures.push({
        platform: "claude",
        html: `<div>Response ${i}</div>`,
        text: `Response ${i}`,
        url: "https://claude.ai/",
        ts: baseTime + i, // Different timestamps
      });
    }

    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    // Send all captures rapidly, then wait for the handler work to settle.
    await Promise.all(captures.map((capture) => captureHandler(mockEvent, capture)));

    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvents = events.filter(
      (e) => e.channel === "capture:done",
    );

    // All captures should succeed
    expect(captureDoneEvents.length).toBeGreaterThanOrEqual(5);
    expect(captureDoneEvents.every((e) => e.data.chunks > 0)).toBe(true);
  });

  // Test 3: Duplicate captures with same timestamp
  it("handles duplicate captures gracefully", async () => {
    const timestamp = Date.now();
    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    const payload1 = {
      platform: "claude",
      html: "<div>First version</div>",
      text: "First version",
      url: "https://claude.ai/",
      ts: timestamp,
    };

    const payload2 = {
      platform: "claude",
      html: "<div>Second version</div>",
      text: "Second version",
      url: "https://claude.ai/",
      ts: timestamp, // Same timestamp
    };

    // Send both captures
    await captureHandler(mockEvent, payload1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await captureHandler(mockEvent, payload2);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvents = events.filter(
      (e) => e.channel === "capture:done",
    );

    // Both should be processed
    expect(captureDoneEvents.length).toBeGreaterThanOrEqual(2);
  });

  // Test 4: Large response text doesn't cause ingestion errors
  it("handles very large response text without ingestion errors", async () => {
    // Generate large response
    const largeText = "a".repeat(100000); // 100KB text
    const payload = {
      platform: "claude",
      html: `<div>${largeText}</div>`,
      text: largeText,
      url: "https://claude.ai/",
      ts: Date.now(),
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvent = events.find((e) => e.channel === "capture:done");

    // Should succeed despite large size
    expect(captureDoneEvent).toBeDefined();
    expect(captureDoneEvent.data.chunks).toBeGreaterThan(0);
  });

  // Test 5: Special characters in response don't cause encoding errors
  it("handles special characters in response without encoding errors", async () => {
    const specialChars = "你好世界 🚀 مرحبا بالعالم ñoño © € £ ¥";
    const payload = {
      platform: "claude",
      html: `<div>${specialChars}</div>`,
      text: specialChars,
      url: "https://claude.ai/",
      ts: Date.now(),
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvent = events.find((e) => e.channel === "capture:done");

    // Should succeed with special chars
    expect(captureDoneEvent).toBeDefined();
    expect(captureDoneEvent.data.chunks).toBeGreaterThan(0);
  });

  // Test 6: HTML with complex structure doesn't cause parsing errors
  it("handles complex HTML structure without parsing errors", async () => {
    const complexHtml = `
      <div>
        <article>
          <section>
            <h1>Title</h1>
            <p>Paragraph with <strong>bold</strong> and <em>italic</em></p>
            <code>code block</code>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
            <table>
              <tr><td>Cell 1</td><td>Cell 2</td></tr>
            </table>
          </section>
        </article>
      </div>
    `;

    const payload = {
      platform: "claude",
      html: complexHtml,
      text: "Plain text extraction from complex HTML",
      url: "https://claude.ai/",
      ts: Date.now(),
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvent = events.find((e) => e.channel === "capture:done");

    expect(captureDoneEvent).toBeDefined();
    expect(captureDoneEvent.data.chunks).toBeGreaterThan(0);
  });

  // Test 7: Multiple different platforms in sequence
  it("handles captures from multiple platforms without cross-contamination", async () => {
    const platforms = ["claude", "gemini", "chatgpt", "perplexity"];
    const baseTime = Date.now();

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      const payload = {
        platform,
        html: `<div>Response from ${platform}</div>`,
        text: `Response from ${platform}`,
        url: `https://${platform}.example.com/`,
        ts: baseTime + i,
      };

      const mockEvent = {
        sender: {
          getURL: () => `https://${platform}.example.com/`,
        },
      };

      await captureHandler(mockEvent, payload);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvents = events.filter(
      (e) => e.channel === "capture:done",
    );

    expect(captureDoneEvents.length).toBeGreaterThanOrEqual(4);

    // Each platform should have its own capture
    const platformsInEvents = captureDoneEvents.map((e) => e.data.platform);
    for (const platform of platforms) {
      expect(platformsInEvents).toContain(platform);
    }
  });

  // Test 8: No unhandled promise rejections during ingestion
  it("does not produce unhandled promise rejections", async () => {
    let unhandledRejection = null;
    const rejectHandler = (reason) => {
      unhandledRejection = reason;
    };

    process.on("unhandledRejection", rejectHandler);

    try {
      const payload = {
        platform: "claude",
        html: "<div>Test</div>",
        text: "Test",
        url: "https://claude.ai/",
        ts: Date.now(),
      };

      const mockEvent = {
        sender: {
          getURL: () => "https://claude.ai/",
        },
      };

      // This should NOT produce an unhandled rejection
      captureHandler(mockEvent, payload);
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(unhandledRejection).toBeNull();
    } finally {
      process.removeListener("unhandledRejection", rejectHandler);
    }
  });

  // Test 9: File write permissions are set correctly
  it("written response files have correct permissions", async () => {
    const payload = {
      platform: "claude",
      html: "<div>Response</div>",
      text: "Response",
      url: "https://claude.ai/",
      ts: Date.now(),
    };

    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    await captureHandler(mockEvent, payload);
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Check file permissions
    const browserResponsesDir = path.join(
      tempDir,
      ".vscode-rotator",
      "browser-responses",
    );
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBeGreaterThan(0);

    const filepath = path.join(browserResponsesDir, files[0]);
    const stats = await fs.stat(filepath);
    const mode = stats.mode & Number.parseInt("777", 8);

    // On Windows, perms are different
    if (process.platform === "win32") {
      // Windows file permissions are less strict
      expect(mode).toBeDefined();
    } else {
      // On Unix-like systems, should be 600 (read/write for owner only)
      expect(mode).toBe(Number.parseInt("600", 8));
    }
  });

  // Test 10: Capture doesn't lose events due to buffer issues
  it("all capture events are received and processed", async () => {
    const captureCount = 10;
    const captures = [];

    for (let i = 0; i < captureCount; i++) {
      captures.push({
        platform: "claude",
        html: `<div>Response ${i}</div>`,
        text: `Response ${i}`,
        url: "https://claude.ai/",
        ts: Date.now() + i,
      });
    }

    const mockEvent = {
      sender: {
        getURL: () => "https://claude.ai/",
      },
    };

    for (const capture of captures) {
      await captureHandler(mockEvent, capture);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvents = events.filter(
      (e) => e.channel === "capture:done",
    );

    // All captures should be accounted for
    expect(captureDoneEvents.length).toBeGreaterThanOrEqual(captureCount);
  });
});
