const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { readFile } = require('node:fs/promises');
const ElectronStore = require('electron-store');
const Store = ElectronStore.default || ElectronStore;
const { BrowserPane } = require('./browser-pane.cjs');
const { registerCaptureHandlers } = require('./ipc/capture-handlers.cjs');

app.setPath('cache', path.join(os.tmpdir(), 'strategic-learning-unified-theatre-cache'));
app.commandLine.appendSwitch('disk-cache-dir', path.join(os.tmpdir(), 'strategic-learning-unified-theatre-cache'));

const isDev = !!process.env.VITE_DEV_SERVER_URL;

async function createWindow() {
  console.log('[main] createWindow() starting');
  const store = new Store({ name: 'strategic-learning-unified-theatre-ui' });
  const saved = store.get('windowBounds');

  const opts = {
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  if (process.platform === 'darwin') opts.titleBarStyle = 'hiddenInset';

  if (saved && saved.x != null) {
    opts.x = saved.x;
    opts.y = saved.y;
    opts.width = saved.width || opts.width;
    opts.height = saved.height || opts.height;
  }

  const win = new BrowserWindow(opts);

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[renderer console] level=${level} source=${sourceId} line=${line} message=${message}`);
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[renderer] failed to load', { errorCode, errorDescription, validatedURL });
  });

  if (isDev) {
    const url = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    console.log('[main] loading dev URL', url);
    try {
      await win.loadURL(url);
    } catch (err) {
      console.error('[main] loadURL dev failed', err);
      await win.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    console.log('[main] loading prod file', indexPath);
    try {
      await win.loadFile(indexPath);
    } catch (err) {
      console.error('[main] loadFile prod failed, falling back to data URL', err);
      const html = await readFile(indexPath, 'utf8');
      const baseUrl = pathToFileURL(path.join(__dirname, 'dist') + path.sep).toString();
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, {
        baseURLForDataURL: baseUrl
      });
    }
  }

  win.on('close', () => {
    try {
      const b = win.getBounds();
      store.set('windowBounds', b);
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

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  console.log('[main] app.whenReady()');
  mainWindow = await createWindow();

  // start watcher daemon and forward events
  try {
    const { WatcherDaemon } = await import('../src/watcher.js');
    watcher = new WatcherDaemon();
    watcher.start().catch(() => {});

    const forward = (evtName, type) => (data) => {
      try {
        mainWindow.webContents.send('daemon:event', { type, ...(data || {}) });
      } catch {}
    };

    watcher.on('switch', forward('switch', 'SWITCH'));
    watcher.on('cooldown', forward('cooldown', 'COOLDOWN'));
    watcher.on('recover', forward('recover', 'RECOVER'));
    watcher.on('git_warn', forward('git_warn', 'GIT_WARN'));
    watcher.on('error', (err) => {
      try {
        mainWindow.webContents.send('daemon:event', { type: 'ERROR', error: String(err?.message ?? err) });
      } catch {}
    });
  } catch (err) {
    console.error('Watcher start failed', err);
  }

  // register IPC handlers
  try {
    console.log('[main] loading IPC handlers from', path.join(__dirname, 'ipc', 'handlers.cjs'));
    const register = require(path.join(__dirname, 'ipc', 'handlers.cjs'));
    if (typeof register === 'function') {
      await register({ ipcMain, dialog, watcher, app });
      console.log('[main] IPC handlers registered');
    } else {
      console.error('[main] IPC handlers module did not export a function');
    }
  } catch (err) {
    console.error('IPC handlers failed to register', err);
  }

  // Register browser pane IPC handlers
  try {
    ipcMain.handle('browser:switchPlatform', async (event, platformName) => {
      if (!browserPane) {
        throw new Error('Browser pane not initialized');
      }
      await browserPane.switchPlatform(platformName);
      return { success: true };
    });

    ipcMain.handle('browser:setVisible', async (event, visible) => {
      if (!browserPane || !browserPane.currentView) return { success: true };
      try {
        const { view, type } = browserPane.currentView;
        if (visible) {
          const bounds = browserPane.getBounds();
          view.setBounds(bounds);
        } else {
          view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 });
        }
      } catch (err) {
        console.error('[browser:setVisible] error:', err);
      }
      return { success: true };
    });

    ipcMain.handle('browser:navigate', async (event, url) => {
      if (!browserPane) {
        throw new Error('Browser pane not initialized');
      }
      await browserPane.navigate(url);
      return { success: true };
    });

    console.log('[main] browser pane IPC handlers registered');
  } catch (err) {
    console.error('[main] browser pane IPC handler registration failed:', err);
  }

  // Initialize browser pane for embedded browser views
  try {
    console.log('[main] initializing browser pane');
    browserPane = new BrowserPane(mainWindow, {
      platform: 'chatgpt',
      preloadPath: path.join(__dirname, 'preload-browser.cjs')
    });
    await browserPane.attachToWindow();
    browserPane.detachView(browserPane.currentView);
    console.log('[main] browser pane attached');
  } catch (err) {
    console.error('[main] browser pane initialization failed:', err);
  }

  // Register capture handlers
  try {
    console.log('[main] registering capture handlers');
    // Import DocumentIngester to pass to capture handlers
    const { DocumentIngester } = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'src', 'llm', 'document-ingester.js')).href);
    const ingester = new DocumentIngester();
    await registerCaptureHandlers(ipcMain, ingester, mainWindow);
    console.log('[main] capture handlers registered');
  } catch (err) {
    console.error('[main] capture handlers registration failed:', err);
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
