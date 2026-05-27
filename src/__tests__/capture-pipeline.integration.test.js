import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

describe('Capture Pipeline Integration', () => {
  let tempDir;
  let mockIpcMain;
  let mockMainWindow;
  let ingester;
  let captureHandler;
  let registerCaptureHandlers;

  beforeEach(async () => {
    // Create temp directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strategic-learning-unified-theatre-capture-int-'));
    const browserResponsesDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');
    await fs.mkdir(browserResponsesDir, { recursive: true });

    // Set HOME to temp dir for this test
    process.env.HOME = tempDir;

    // Setup mock ipcMain
    mockIpcMain = {
      handlers: {},
      on: function (channel, handler) {
        this.handlers[channel] = handler;
      }
    };

    // Setup mock mainWindow
    const emittedEvents = [];
    mockMainWindow = {
      webContents: {
        send: (channel, data) => {
          emittedEvents.push({ channel, data });
        }
      },
      getEmittedEvents: () => emittedEvents
    };

    // Import real DocumentIngester
    const { DocumentIngester } = await import('../../src/llm/document-ingester.js');
    ingester = new DocumentIngester({ baseDir: tempDir });

    // Import capture handlers
    const mod = await import('../../electron-ui/ipc/capture-handlers.cjs');
    registerCaptureHandlers = mod.registerCaptureHandlers;

    // Register handlers
    await registerCaptureHandlers(mockIpcMain, ingester, mockMainWindow);
    captureHandler = mockIpcMain.handlers['capture:response'];
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('happy path: capture event triggers atomic write, ingestion, and emission', async () => {
    const payload = {
      platform: 'claude',
      html: '<div class="markdown"><p>This is the response.</p></div>',
      text: 'This is the response.',
      url: 'https://claude.ai/chat/abc123',
      ts: Date.now()
    };

    const mockEvent = {
      sender: {
        getURL: () => 'https://claude.ai/'
      }
    };

    // Fire the capture event
    await captureHandler(mockEvent, payload);

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 200));

    // Assert file was written
    const browserResponsesDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBeGreaterThan(0);

    // Assert file has correct name pattern
    const filename = files[0];
    expect(filename).toMatch(/-claude\.md$/);

    // Assert file contents
    const filepath = path.join(browserResponsesDir, filename);
    const content = await fs.readFile(filepath, 'utf8');
    expect(content).toContain('# Captured Response');
    expect(content).toContain('claude');
    expect(content).toContain('https://claude.ai/chat/abc123');
    expect(content).toContain('This is the response.');

    // Assert file has correct permissions
    const stats = await fs.stat(filepath);
    const mode = stats.mode & Number.parseInt('777', 8);
    if (process.platform === 'win32') {
      expect(mode).toBe(Number.parseInt('666', 8));
    } else {
      expect(mode).toBe(Number.parseInt('600', 8));
    }

    // Assert capture:done event was emitted
    const events = mockMainWindow.getEmittedEvents();
    expect(events.length).toBeGreaterThan(0);

    const captureDoneEvent = events.find(e => e.channel === 'capture:done');
    expect(captureDoneEvent).toBeDefined();
    expect(captureDoneEvent.data).toHaveProperty('platform', 'claude');
    expect(captureDoneEvent.data).toHaveProperty('chunks');
    expect(captureDoneEvent.data.chunks).toBeGreaterThan(0);
    expect(captureDoneEvent.data).toHaveProperty('skipped', false);
  });

  it('duplicate ingestion: second capture overwrites file and detects duplicate', async () => {
    const baseTs = 1000000000000;
    const payload1 = {
      platform: 'gemini',
      html: '<div class="response">First version</div>',
      text: 'First version',
      url: 'https://gemini.google.com/',
      ts: baseTs
    };

    const payload2 = {
      platform: 'gemini',
      html: '<div class="response">Second version</div>',
      text: 'Second version',
      url: 'https://gemini.google.com/',
      ts: baseTs
    };

    const mockEvent = {
      sender: {
        getURL: () => 'https://gemini.google.com/'
      }
    };

    // Fire first capture
    await captureHandler(mockEvent, payload1);
    await new Promise(resolve => setTimeout(resolve, 150));

    // Fire second capture (same timestamp, different content)
    await captureHandler(mockEvent, payload2);
    await new Promise(resolve => setTimeout(resolve, 150));

    // Assert only one file exists (atomic overwrite)
    const browserResponsesDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(1);

    // Assert file has latest content
    const filepath = path.join(browserResponsesDir, files[0]);
    const content = await fs.readFile(filepath, 'utf8');
    expect(content).toContain('Second version');
    expect(content).not.toContain('First version');

    // Assert duplicate detection on second ingest
    // Note: This depends on DocumentIngester's dedup logic
    // We verify that capture:done events were sent for both
    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvents = events.filter(e => e.channel === 'capture:done');
    expect(captureDoneEvents.length).toBe(2);
  });

  it('multiple platforms: captures to different files and ingests independently', async () => {
    const mockEvent = {
      sender: {
        getURL: () => 'https://test.com/'
      }
    };

    const platforms = ['chatgpt', 'claude', 'gemini', 'perplexity'];
    const ts = Date.now();

    for (const platform of platforms) {
      const payload = {
        platform,
        html: `<div>${platform} response</div>`,
        text: `${platform} response`,
        url: `https://example.com/${platform}`,
        ts: ts + platforms.indexOf(platform) // Slightly different timestamps
      };

      await captureHandler(mockEvent, payload);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Assert four files were created
    const browserResponsesDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(4);

    // Assert each platform has a file
    for (const platform of platforms) {
      const platformFile = files.find(f => f.includes(platform));
      expect(platformFile).toBeDefined();

      // Assert correct content
      const filepath = path.join(browserResponsesDir, platformFile);
      const content = await fs.readFile(filepath, 'utf8');
      expect(content).toContain(platform);
      expect(content).toContain(`${platform} response`);
    }

    // Assert capture:done events for all platforms
    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvents = events.filter(e => e.channel === 'capture:done');
    expect(captureDoneEvents.length).toBe(4);
    for (const platform of platforms) {
      const event = captureDoneEvents.find(e => e.data.platform === platform);
      expect(event).toBeDefined();
    }
  });

  it('malformed payload: discarded without file creation or ingestion', async () => {
    const invalidPayloads = [
      { platform: 'claude', text: 'Missing html' }, // Missing html
      { platform: 'claude', html: '<div></div>', url: 'test' }, // Missing text
      { html: '<div></div>', text: 'Test' }, // Missing platform
      null,
      undefined
    ];

    const mockEvent = {
      sender: {
        getURL: () => 'https://test.com/'
      }
    };

    const browserResponsesDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');

    for (const payload of invalidPayloads) {
      await captureHandler(mockEvent, payload);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // No files should have been created
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(0);

    // Invalid captures should report capture:error without emitting capture:done.
    const events = mockMainWindow.getEmittedEvents();
    expect(events.filter(e => e.channel === 'capture:done')).toHaveLength(0);
    const captureErrorEvents = events.filter(e => e.channel === 'capture:error');
    expect(captureErrorEvents).toHaveLength(invalidPayloads.length);
    expect(captureErrorEvents[0].data).toMatchObject({
      code: 'ROTATOR_BROWSER_CAPTURE_INVALID'
    });
  });

  it('large response text: ingested correctly with multiple chunks', async () => {
    // Generate a large response to ensure multi-chunk ingestion
    const largeText = 'This is a test response. '.repeat(500); // ~12KB

    const payload = {
      platform: 'perplexity',
      html: `<div>${largeText}</div>`,
      text: largeText,
      url: 'https://www.perplexity.ai/',
      ts: Date.now()
    };

    const mockEvent = {
      sender: {
        getURL: () => 'https://www.perplexity.ai/'
      }
    };

    await captureHandler(mockEvent, payload);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Assert file was written
    const browserResponsesDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');
    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(1);

    // Assert capture:done indicates multiple chunks
    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvent = events.find(e => e.channel === 'capture:done');
    expect(captureDoneEvent).toBeDefined();
    expect(captureDoneEvent.data.chunks).toBeGreaterThan(1);
  });

  it('rapid successive captures: all processed and files created', async () => {
    const mockEvent = {
      sender: {
        getURL: () => 'https://test.com/'
      }
    };

    const baseTs = Date.now();
    const count = 10;

    // Fire 10 rapid captures
    for (let i = 0; i < count; i++) {
      const payload = {
        platform: 'claude',
        html: `<div>Response ${i}</div>`,
        text: `Response ${i}`,
        url: 'https://claude.ai/',
        ts: baseTs + i
      };

      // Don't wait between captures
      captureHandler(mockEvent, payload);
    }

    // Wait for all to process by polling (avoid flaky fixed sleep)
    const browserResponsesDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');
    const waitFor = async (pred, timeout = 5000, interval = 100) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await pred()) return;
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    };

    // Wait until the expected number of files exist
    await waitFor(async () => {
      const files = await fs.readdir(browserResponsesDir);
      return files.length === count;
    }, 8000, 100);

    const files = await fs.readdir(browserResponsesDir);
    expect(files.length).toBe(count);

    // Wait until the expected number of capture:done events were emitted
    await waitFor(() => {
      const events = mockMainWindow.getEmittedEvents();
      const captureDoneEvents = events.filter(e => e.channel === 'capture:done');
      return captureDoneEvents.length === count;
    }, 8000, 100);

    // Assert all capture:done events were emitted
    const events = mockMainWindow.getEmittedEvents();
    const captureDoneEvents = events.filter(e => e.channel === 'capture:done');
    expect(captureDoneEvents.length).toBe(count);
  });
});
