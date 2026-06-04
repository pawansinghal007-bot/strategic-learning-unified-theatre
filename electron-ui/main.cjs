const { app, BrowserWindow, ipcMain, dialog, session } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs");
const path = require("node:path");
const { getSystemHealth } = require("../src/accounts/health.js");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { readFile } = require("node:fs/promises");
const ElectronStore = require("electron-store");
const Store = ElectronStore.default || ElectronStore;
const { BrowserPane } = require("./browser-pane.cjs");
const { registerCaptureHandlers } = require("./ipc/capture-handlers.cjs");
const {
  registerProviderTelemetryHandlers,
} = require("./ipc/provider-telemetry-handlers.cjs");
const { createLogger } = require("../src/logger.js");
const { registerIpcHandlers } = require("../src/main/ipc/ipcAdapter");
const { IPC_CHANNELS } = require("../src/shared/ipc/contract");

function readUpdateConfig() {
  const packagedPath = path.join(
    process.resourcesPath || "",
    "config",
    "update.json",
  );
  const fallbackPath = path.join(__dirname, "..", "config", "update.json");
  const configPath = fs.existsSync(packagedPath) ? packagedPath : fallbackPath;

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      channel: typeof parsed.channel === "string" ? parsed.channel : "latest",
      healthCheckTimeoutMs:
        typeof parsed.healthCheckTimeoutMs === "number"
          ? parsed.healthCheckTimeoutMs
          : 30000,
    };
  } catch {
    return { channel: "latest", healthCheckTimeoutMs: 30000 };
  }
}

const healthStatePath = path.join(app.getPath("userData"), "health-state.json");

function readHealthState() {
  try {
    const raw = fs.readFileSync(healthStatePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      lastKnownGoodVersion:
        typeof parsed.lastKnownGoodVersion === "string"
          ? parsed.lastKnownGoodVersion
          : undefined,
      pendingVersion:
        typeof parsed.pendingVersion === "string"
          ? parsed.pendingVersion
          : undefined,
      rollbackRequested: parsed.rollbackRequested === true,
    };
  } catch {
    return {};
  }
}

function writeHealthState(state) {
  fs.writeFileSync(
    healthStatePath,
    JSON.stringify(state || {}, null, 2),
    "utf8",
  );
}

function markPendingVersion(current, next) {
  const state = readHealthState();
  if (!state.lastKnownGoodVersion) {
    state.lastKnownGoodVersion = current;
  }
  state.pendingVersion = next;
  writeHealthState(state);
}

function clearPendingVersionAsGood(current) {
  const state = readHealthState();
  state.lastKnownGoodVersion = current;
  delete state.pendingVersion;
  writeHealthState(state);
}

function markRollbackRequested() {
  const state = readHealthState();
  state.rollbackRequested = true;
  writeHealthState(state);
}

function runHealthChecks(timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    process.nextTick(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function handleStartupHealth() {
  const config = readUpdateConfig();
  const state = readHealthState();
  const currentVersion = app.getVersion();

  if (state.pendingVersion === currentVersion) {
    const passed = await runHealthChecks(config.healthCheckTimeoutMs);
    if (passed) {
      clearPendingVersionAsGood(currentVersion);
    } else {
      markRollbackRequested();
      dialog.showErrorBox(
        "Startup Health Check Failed",
        "The application failed its startup health check and will exit so a rollback can occur.",
      );
      app.exit(1);
    }
  } else if (!state.lastKnownGoodVersion) {
    clearPendingVersionAsGood(currentVersion);
  }
}

function setupAutoUpdater() {
  const config = readUpdateConfig();
  autoUpdater.channel = config.channel;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    mainWindow?.webContents.send("update:checking-for-update");
  });

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update:update-available", info);
  });

  autoUpdater.on("update-not-available", (info) => {
    mainWindow?.webContents.send("update:update-not-available", info);
  });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update:error", {
      message: err?.message || String(err),
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update:download-progress", progress);
  });

  autoUpdater.on("update-downloaded", (info) => {
    markPendingVersion(app.getVersion(), info.version);
    const result = dialog.showMessageBoxSync(mainWindow, {
      type: "info",
      buttons: ["Install and Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update Ready",
      message: "A new update is ready to install.",
      detail: `Version ${info.version} has been downloaded. Install now?`,
    });
    if (result === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {});
    },
    30 * 60 * 1000,
  );
}

let mainLogger = null;

app.setPath(
  "cache",
  path.join(os.tmpdir(), "strategic-learning-unified-theatre-cache"),
);
app.commandLine.appendSwitch(
  "disk-cache-dir",
  path.join(os.tmpdir(), "strategic-learning-unified-theatre-cache"),
);

const isDev = !!process.env.VITE_DEV_SERVER_URL;

function isObjectPayload(payload) {
  return (
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
  );
}

function hasStringField(field) {
  return (payload) =>
    isObjectPayload(payload) && typeof payload[field] === "string";
}

function registerContentSecurityPolicy() {
  const connectSrc =
    process.env.NODE_ENV === "development"
      ? "connect-src 'self' http://localhost:* ws://localhost:*;"
      : "connect-src 'self';";
  const csp = [
    "default-src 'self';",
    "script-src 'self';",
    "style-src 'self' 'unsafe-inline';",
    "img-src 'self' data:;",
    connectSrc,
  ].join(" ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

async function createWindow() {
  const store = new Store({ name: "strategic-learning-unified-theatre-ui" });
  const saved = store.get("windowBounds");

  const opts = {
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      enableRemoteModule: false,
    },
  };

  if (process.platform === "darwin") opts.titleBarStyle = "hiddenInset";

  if (saved?.x != null) {
    opts.x = saved.x;
    opts.y = saved.y;
    opts.width = saved.width || opts.width;
    opts.height = saved.height || opts.height;
  }

  const win = new BrowserWindow(opts);
  mainLogger = createLogger("electron-main", {
    onEntry(entry) {
      try {
        if (!win?.isDestroyed()) {
          win.webContents.send("log:event", entry);
        }
      } catch {
        /* never crash on log streaming */
      }
    },
  });

  mainLogger.info("window.create.start", {
    width: opts.width,
    height: opts.height,
  });

  win.webContents.on(
    "console-message",
    (event, level, message, line, sourceId) => {
      mainLogger.info("renderer.console", { level, message, line, sourceId });
    },
  );

  win.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      mainLogger.error("renderer.load.failure", {
        code: "ROTATOR_RENDERER_LOAD_FAILED",
        errorCode,
        errorDescription,
        validatedURL,
      });
    },
  );

  registerContentSecurityPolicy();

  if (isDev) {
    const url = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    mainLogger.info("window.load.dev.start", { url });
    try {
      await win.loadURL(url);
      mainLogger.info("window.load.dev.success", { url });
    } catch (err) {
      mainLogger.error("window.load.dev.failure", {
        url,
        error: err,
        code: err?.code || "ROTATOR_WINDOW_LOAD_DEV_FAILED",
      });
      await win.loadFile(path.join(__dirname, "dist", "index.html"));
    }
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexPath = path.join(__dirname, "dist", "index.html");
    mainLogger.info("window.load.prod.start", { indexPath });
    try {
      await win.loadFile(indexPath);
      mainLogger.info("window.load.prod.success", { indexPath });
    } catch (err) {
      mainLogger.error("window.load.prod.failure", {
        indexPath,
        error: err,
        code: err?.code || "ROTATOR_WINDOW_LOAD_PROD_FAILED",
      });
      const html = await readFile(indexPath, "utf8");
      const baseUrl = pathToFileURL(
        path.join(__dirname, "dist") + path.sep,
      ).toString();
      await win.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
        {
          baseURLForDataURL: baseUrl,
        },
      );
      mainLogger.info("window.load.dataUrl.success", { baseUrl });
    }
  }

  win.on("close", () => {
    try {
      const b = win.getBounds();
      store.set("windowBounds", b);
    } catch {}
  });

  return win;
}

// single instance
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;
let watcher = null;
let browserPane = null;

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  mainWindow = await createWindow();
  setupAutoUpdater();
  await handleStartupHealth();
  ipcMain.handle("health:get", async () => await getSystemHealth());

  registerIpcHandlers({
    [IPC_CHANNELS.captureResponse]: {
      captureResponse: {
        validate: hasStringField("responsePath"),
        run: async (payload) => {
          const { ingestBrowserResponseFile } = await import(
            pathToFileURL(
              path.join(__dirname, "..", "src", "browser-bridge.js"),
            ).href
          );
          return await ingestBrowserResponseFile(payload.responsePath);
        },
      },
    },
    [IPC_CHANNELS.trayCommand]: {
      trayCommand: {
        validate: hasStringField("command"),
        run: async (payload) => {
          mainLogger.info("ipc.tray.command", {
            correlationId: "ipc",
            command: payload.command,
          });
          return { ok: true };
        },
      },
    },
    [IPC_CHANNELS.logView]: {
      logView: {
        validate: isObjectPayload,
        run: async (payload) => {
          mainLogger.info("ipc.log.view", {
            correlationId: "ipc",
            payload,
          });
          return { ok: true };
        },
      },
    },
    [IPC_CHANNELS.robotRunnerAction]: {
      robotRunnerAction: {
        validate: hasStringField("action"),
        run: async (payload) => {
          mainLogger.info("ipc.robot.runner.action", {
            correlationId: "ipc",
            action: payload.action,
          });
          return { ok: true };
        },
      },
    },
  });

  // start watcher daemon and forward events
  try {
    mainLogger.info("daemon.start.start", { correlationId: "daemon" });
    const { WatcherDaemon } = await import("../src/daemon/watcher.js");
    watcher = new WatcherDaemon();
    watcher.start().catch(() => {});
    mainLogger.info("daemon.start.success", { correlationId: "daemon" });

    const forward = (evtName, type) => (data) => {
      try {
        mainWindow.webContents.send(
          "daemon:event",
          data ? { type, ...data } : { type },
        );
      } catch {}
    };

    watcher.on("switch", forward("switch", "SWITCH"));
    watcher.on("cooldown", forward("cooldown", "COOLDOWN"));
    watcher.on("recover", forward("recover", "RECOVER"));
    watcher.on("git_warn", forward("git_warn", "GIT_WARN"));
    watcher.on("error", (err) => {
      try {
        mainWindow.webContents.send("daemon:event", {
          type: "ERROR",
          error: String(err?.message ?? err),
        });
      } catch {}
    });
  } catch (err) {
    mainLogger.error("daemon.start.failure", {
      correlationId: "daemon",
      error: err,
      code: err?.code || "ROTATOR_DAEMON_START_FAILED",
    });
  }

  // register IPC handlers
  try {
    const handlersPath = path.join(__dirname, "ipc", "handlers.cjs");
    mainLogger.info("ipc.handlers.load.start", {
      correlationId: "ipc",
      handlersPath,
    });
    const register = require(handlersPath);
    if (typeof register === "function") {
      await register({ ipcMain, dialog, watcher, app });
      mainLogger.info("ipc.handlers.register.success", {
        correlationId: "ipc",
      });
    } else {
      mainLogger.error("ipc.handlers.register.failure", {
        correlationId: "ipc",
        code: "ROTATOR_IPC_HANDLER_EXPORT_INVALID",
        error: new Error("IPC handlers module did not export a function"),
      });
    }
  } catch (err) {
    mainLogger.error("ipc.handlers.register.failure", {
      correlationId: "ipc",
      error: err,
      code: err?.code || "ROTATOR_IPC_REGISTER_FAILED",
    });
  }

  // Register browser pane IPC handlers
  try {
    ipcMain.handle("browser:switchPlatform", async (event, platformName) => {
      if (!browserPane) {
        throw new Error("Browser pane not initialized");
      }
      await browserPane.switchPlatform(platformName);
      return { success: true };
    });

    ipcMain.handle("browser:setVisible", async (event, visible) => {
      if (!browserPane?.currentView) return { success: true };
      try {
        const { view } = browserPane.currentView;
        if (visible) {
          const bounds = browserPane.getBounds();
          view.setBounds(bounds);
        } else {
          view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 });
        }
      } catch (err) {
        mainLogger.error("ipc.browser.setVisible.failure", {
          correlationId: "ipc",
          error: err,
          code: err?.code || "ROTATOR_BROWSER_SET_VISIBLE_FAILED",
        });
      }
      return { success: true };
    });

    ipcMain.handle("browser:navigate", async (event, url) => {
      if (!browserPane) {
        throw new Error("Browser pane not initialized");
      }
      await browserPane.navigate(url);
      return { success: true };
    });

    mainLogger.info("ipc.browser.handlers.success", { correlationId: "ipc" });
  } catch (err) {
    mainLogger.error("ipc.browser.handlers.failure", {
      correlationId: "ipc",
      error: err,
      code: err?.code || "ROTATOR_BROWSER_IPC_REGISTER_FAILED",
    });
  }

  // Initialize browser pane for embedded browser views
  try {
    mainLogger.info("browserPane.init.start", { correlationId: "ipc" });
    browserPane = new BrowserPane(mainWindow, {
      platform: "chatgpt",
      preloadPath: path.join(__dirname, "preload-browser.cjs"),
    });
    await browserPane.attachToWindow();
    browserPane.detachView(browserPane.currentView);
    mainLogger.info("browserPane.init.success", { correlationId: "ipc" });
  } catch (err) {
    mainLogger.error("browserPane.init.failure", {
      correlationId: "ipc",
      error: err,
      code: err?.code || "ROTATOR_BROWSER_PANE_INIT_FAILED",
    });
  }

  // Register capture handlers
  try {
    mainLogger.info("ipc.capture.handlers.start", { correlationId: "ipc" });
    // Import DocumentIngester to pass to capture handlers
    const { DocumentIngester } = await import(
      pathToFileURL(
        path.join(__dirname, "..", "src", "llm", "document-ingester.js"),
      ).href
    );
    const ingester = new DocumentIngester();
    await registerCaptureHandlers(ipcMain, ingester, mainWindow);
    registerProviderTelemetryHandlers();
    mainLogger.info("ipc.capture.handlers.success", { correlationId: "ipc" });
  } catch (err) {
    mainLogger.error("ipc.capture.handlers.failure", {
      correlationId: "ipc",
      error: err,
      code: err?.code || "ROTATOR_CAPTURE_IPC_REGISTER_FAILED",
    });
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0)
      mainWindow = await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
