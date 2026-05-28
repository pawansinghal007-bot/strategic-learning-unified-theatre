import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('capture-handlers.cjs', () => {
  let tempDir;
  let mockIpcMain;
  let mockMainWindow;
  let mockIngester;
  let captureHandler;
  let registerCaptureHandlers;

  beforeEach(async () => {
    // Setup temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strategic-learning-unified-theatre-capture-'));

    // Mock ipcMain
    mockIpcMain = {
      handlers: {},
      on: vi.fn(function (channel, handler) {
        this.handlers[channel] = handler;
      })
    };

    // Mock mainWindow
    mockMainWindow = {
      webContents: {
        send: vi.fn()
      }
    };

    // Mock DocumentIngester
    mockIngester = {
      ingestFile: vi.fn(async () => ({
        path: path.join(tempDir, 'test.md'),
        chunks: 5,
        skipped: false
      }))
    };

    // Import the module
    const mod = await import('../../electron-ui/ipc/capture-handlers.cjs');
    registerCaptureHandlers = mod.registerCaptureHandlers;

    // Register handlers
    await registerCaptureHandlers(mockIpcMain, mockIngester, mockMainWindow);
    captureHandler = mockIpcMain.handlers['capture:response'];
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('registers capture:response handler on ipcMain', () => {
    expect(mockIpcMain.on).toHaveBeenCalledWith('capture:response', expect.any(Function));
  });

  it('processes valid payload: writes file, ingests, and emits capture:done', async () => {
    const payload = {
      platform: 'claude',
      html: '<div>Hello</div>',
      text: 'Hello',
      url: 'https://claude.ai/',
      ts: 1621000000000
    };

    const mockEvent = {
      sender: {
        getURL: () => 'https://claude.ai/'
      }
    };

    // Temporary override HOME for this test
    const origHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      await captureHandler(mockEvent, payload);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that ingestFile was called
      expect(mockIngester.ingestFile).toHaveBeenCalled();

      // Check that capture:done was sent
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'capture:done',
        expect.objectContaining({
          platform: 'claude',
          chunks: 5,
          skipped: false,
          timestamp: payload.ts
        })
      );

      // Check that file was written to browser-responses dir
      const responseDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');
      const files = await fs.readdir(responseDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toMatch(/\.md$/);
    } finally {
      process.env.HOME = origHome;
    }
  });

  it('discards payload with missing platform field', async () => {
    const payload = {
      // Missing platform
      html: '<div>Hello</div>',
      text: 'Hello',
      url: 'https://claude.ai/',
      ts: 1621000000000
    };

    const mockEvent = { sender: { getURL: () => 'https://test.com/' } };

    await captureHandler(mockEvent, payload);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockIngester.ingestFile).not.toHaveBeenCalled();
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'capture:error',
      expect.objectContaining({
        code: 'ROTATOR_BROWSER_CAPTURE_INVALID',
        message: expect.stringContaining('Invalid browser capture payload')
      })
    );
    expect(mockMainWindow.webContents.send).not.toHaveBeenCalledWith('capture:done', expect.any(Object));
  });

  it('discards payload with missing text field', async () => {
    const payload = {
      platform: 'claude',
      html: '<div>Hello</div>',
      // Missing text
      url: 'https://claude.ai/',
      ts: 1621000000000
    };

    const mockEvent = { sender: { getURL: () => 'https://test.com/' } };

    await captureHandler(mockEvent, payload);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockIngester.ingestFile).not.toHaveBeenCalled();
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'capture:error',
      expect.objectContaining({
        code: 'ROTATOR_BROWSER_CAPTURE_INVALID',
        message: expect.stringContaining('Invalid browser capture payload')
      })
    );
    expect(mockMainWindow.webContents.send).not.toHaveBeenCalledWith('capture:done', expect.any(Object));
  });

  it('discards payload with missing html field', async () => {
    const payload = {
      platform: 'claude',
      // Missing html
      text: 'Hello',
      url: 'https://claude.ai/',
      ts: 1621000000000
    };

    const mockEvent = { sender: { getURL: () => 'https://test.com/' } };

    await captureHandler(mockEvent, payload);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockIngester.ingestFile).not.toHaveBeenCalled();
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'capture:error',
      expect.objectContaining({
        code: 'ROTATOR_BROWSER_CAPTURE_INVALID',
        message: expect.stringContaining('Invalid browser capture payload')
      })
    );
    expect(mockMainWindow.webContents.send).not.toHaveBeenCalledWith('capture:done', expect.any(Object));
  });

  it('discards payload with missing url field', async () => {
    const payload = {
      platform: 'claude',
      html: '<div>Hello</div>',
      text: 'Hello',
      // Missing url
      ts: 1621000000000
    };

    const mockEvent = { sender: { getURL: () => 'https://test.com/' } };

    await captureHandler(mockEvent, payload);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockIngester.ingestFile).not.toHaveBeenCalled();
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'capture:error',
      expect.objectContaining({
        code: 'ROTATOR_BROWSER_CAPTURE_INVALID',
        message: expect.stringContaining('Invalid browser capture payload')
      })
    );
    expect(mockMainWindow.webContents.send).not.toHaveBeenCalledWith('capture:done', expect.any(Object));
  });

  it('discards payload with missing ts field', async () => {
    const payload = {
      platform: 'claude',
      html: '<div>Hello</div>',
      text: 'Hello',
      url: 'https://claude.ai/'
      // Missing ts
    };

    const mockEvent = { sender: { getURL: () => 'https://test.com/' } };

    await captureHandler(mockEvent, payload);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockIngester.ingestFile).not.toHaveBeenCalled();
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'capture:error',
      expect.objectContaining({
        code: 'ROTATOR_BROWSER_CAPTURE_INVALID',
        message: expect.stringContaining('Invalid browser capture payload')
      })
    );
    expect(mockMainWindow.webContents.send).not.toHaveBeenCalledWith('capture:done', expect.any(Object));
  });

  it('catches ingestFile rejection and logs error without crashing', async () => {
    mockIngester.ingestFile.mockRejectedValueOnce(new Error('Ingestion failed'));

    const payload = {
      platform: 'claude',
      html: '<div>Hello</div>',
      text: 'Hello',
      url: 'https://claude.ai/',
      ts: 1621000000000
    };

    const mockEvent = {
      sender: {
        getURL: () => 'https://claude.ai/'
      }
    };

    const origHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await captureHandler(mockEvent, payload);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still emit capture:done even if ingest fails
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'capture:done',
        expect.any(Object)
      );
      errorSpy.mockRestore();
    } finally {
      process.env.HOME = origHome;
    }
  });

  it('writes file with correct filename pattern browser-responses/<ts>-<platform>.md', async () => {
    const ts = 1621000000000;
    const payload = {
      platform: 'gemini',
      html: '<div>Test</div>',
      text: 'Test',
      url: 'https://gemini.google.com/',
      ts
    };

    const mockEvent = {
      sender: {
        getURL: () => 'https://gemini.google.com/'
      }
    };

    const origHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      await captureHandler(mockEvent, payload);
      await new Promise(resolve => setTimeout(resolve, 100));

      const responseDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');
      const files = await fs.readdir(responseDir);
      expect(files.length).toBeGreaterThan(0);

      const filename = files[0];
      expect(filename).toMatch(/-gemini\.md$/);
    } finally {
      process.env.HOME = origHome;
    }
  });

  it('capture:done payload contains platform, chunks, and skipped fields', async () => {
    mockIngester.ingestFile.mockResolvedValueOnce({
      path: path.join(tempDir, 'test.md'),
      chunks: 3,
      skipped: false
    });

    const payload = {
      platform: 'chatgpt',
      html: '<div>Response</div>',
      text: 'Response',
      url: 'https://chat.openai.com/',
      ts: 1621000000000
    };

    const mockEvent = {
      sender: {
        getURL: () => 'https://chat.openai.com/'
      }
    };

    const origHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      await captureHandler(mockEvent, payload);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'capture:done',
        expect.objectContaining({
          platform: 'chatgpt',
          chunks: 3,
          skipped: false,
          timestamp: expect.any(Number)
        })
      );
    } finally {
      process.env.HOME = origHome;
    }
  });

  it('sets file permissions to 600 on written file', async () => {
    const payload = {
      platform: 'perplexity',
      html: '<div>Test</div>',
      text: 'Test',
      url: 'https://www.perplexity.ai/',
      ts: 1621000000000
    };

    const mockEvent = {
      sender: {
        getURL: () => 'https://www.perplexity.ai/'
      }
    };

    const origHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      await captureHandler(mockEvent, payload);
      await new Promise(resolve => setTimeout(resolve, 100));

      const responseDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');
      const files = await fs.readdir(responseDir);
      expect(files.length).toBeGreaterThan(0);

      const filepath = path.join(responseDir, files[0]);
      const stats = await fs.stat(filepath);
      // Check that mode is restrictive; Windows file mode reporting may differ.
      const mode = stats.mode & Number.parseInt('777', 8);
      if (process.platform === 'win32') {
        expect(mode).toBe(Number.parseInt('666', 8));
      } else {
        expect(mode).toBe(Number.parseInt('600', 8));
      }
    } finally {
      process.env.HOME = origHome;
    }
  });

  it('formats Markdown content with platform, URL, and timestamp', async () => {
    const ts = 1621000000000;
    const payload = {
      platform: 'claude',
      html: '<div>Hello World</div>',
      text: 'Hello World',
      url: 'https://claude.ai/chat',
      ts
    };

    const mockEvent = {
      sender: {
        getURL: () => 'https://claude.ai/chat'
      }
    };

    const origHome = process.env.HOME;
    process.env.HOME = tempDir;

    try {
      await captureHandler(mockEvent, payload);
      await new Promise(resolve => setTimeout(resolve, 100));

      const responseDir = path.join(tempDir, '.vscode-rotator', 'browser-responses');
      const files = await fs.readdir(responseDir);
      const filepath = path.join(responseDir, files[0]);
      const content = await fs.readFile(filepath, 'utf8');

      expect(content).toContain('# Captured Response');
      expect(content).toContain('claude');
      expect(content).toContain('https://claude.ai/chat');
      expect(content).toContain('Hello World');
    } finally {
      process.env.HOME = origHome;
    }
  });
});
