const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { readFile } = require('node:fs/promises');
const ElectronStore = require('electron-store');
const Store = ElectronStore.default || ElectronStore;

app.setPath('cache', path.join(os.tmpdir(), 'vscode-rotator-cache'));
app.commandLine.appendSwitch('disk-cache-dir', path.join(os.tmpdir(), 'vscode-rotator-cache'));

const isDev = !!process.env.VITE_DEV_SERVER_URL;

async function createWindow() {
  console.log('[main] createWindow() starting');
  const store = new Store({ name: 'vscode-rotator-ui' });
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
    const indexUrl = pathToFileURL(indexPath).toString();
    console.log('[main] loading prod URL', indexUrl);
    try {
      await win.loadURL(indexUrl);
    } catch (err) {
      console.error('[main] loadURL prod failed, falling back to data URL', err);
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

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
