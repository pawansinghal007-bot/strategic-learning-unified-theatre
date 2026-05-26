import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  parseBrowserPayloadOrThrow,
  registerCaptureHandlers
} from "../electron-ui/ipc/capture-handlers.cjs";

function createIpcMain() {
  return {
    handlers: {},
    on(channel, handler) {
      this.handlers[channel] = handler;
    }
  };
}

function createMainWindow() {
  const events = [];
  return {
    events,
    webContents: {
      send(channel, data) {
        events.push({ channel, data });
      }
    }
  };
}

function validPayload(overrides = {}) {
  return {
    platform: "chatgpt",
    html: "<div>Hello</div>",
    text: "Hello",
    url: "https://chat.openai.com/",
    ts: 1621000000000,
    ...overrides
  };
}

describe("Capture payload validation", () => {
  let tempDir;
  let originalHome;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "capture-payload-validation-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("malformed payload missing platform is rejected with ROTATOR_BROWSER_CAPTURE_INVALID code", async () => {
    const payload = validPayload();
    delete payload.platform;

    await expect(parseBrowserPayloadOrThrow(payload)).rejects.toMatchObject({
      code: "ROTATOR_BROWSER_CAPTURE_INVALID"
    });
  });

  it("malformed payload does not cause file write", async () => {
    const ipcMain = createIpcMain();
    const mainWindow = createMainWindow();
    const ingester = { ingestFile: vi.fn() };
    await registerCaptureHandlers(ipcMain, ingester, mainWindow);

    const payload = validPayload();
    delete payload.platform;
    await ipcMain.handlers["capture:response"]({ sender: { getURL: () => "https://test.com/" } }, payload);

    const responseDir = path.join(tempDir, ".vscode-rotator", "browser-responses");
    const files = await fs.readdir(responseDir).catch(() => []);
    expect(files).toHaveLength(0);
    expect(ingester.ingestFile).not.toHaveBeenCalled();
    expect(mainWindow.events[0]).toMatchObject({
      channel: "capture:error",
      data: { code: "ROTATOR_BROWSER_CAPTURE_INVALID" }
    });
  });

  it("valid payload passes through to write path", async () => {
    const ipcMain = createIpcMain();
    const mainWindow = createMainWindow();
    const ingester = { ingestFile: vi.fn(async () => ({ chunks: 1, skipped: false })) };
    await registerCaptureHandlers(ipcMain, ingester, mainWindow);

    await ipcMain.handlers["capture:response"](
      { sender: { getURL: () => "https://chat.openai.com/" } },
      validPayload()
    );

    const responseDir = path.join(tempDir, ".vscode-rotator", "browser-responses");
    const files = await fs.readdir(responseDir);
    expect(files).toHaveLength(1);
    expect(ingester.ingestFile).toHaveBeenCalled();
    expect(mainWindow.events.some((event) => event.channel === "capture:done")).toBe(true);
  });
});
