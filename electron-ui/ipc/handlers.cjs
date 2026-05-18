const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function resolveModule(relPath) {
  return pathToFileURL(path.resolve(__dirname, relPath)).href;
}

module.exports = async function register({ ipcMain, dialog, watcher, app }) {
  const { AccountStore } = await import(resolveModule('../../src/store.js'));
  const { SwitcherService } = await import(resolveModule('../../src/switcher.js'));
  const { GitMonitor } = await import(resolveModule('../../src/git-monitor.js'));
  const { Journal } = await import(resolveModule('../../src/journal.js'));
  const { loadConfig, saveConfig } = await import(resolveModule('../../src/config.js'));
  const { probeAccount } = await import(resolveModule('../../src/health.js'));

  const store = watcher?.store ?? new AccountStore();
  const switcher = watcher?.switcher ?? new SwitcherService({ store });
  const journal = new Journal();
  const gitMonitor = new GitMonitor();

  ipcMain.handle('accounts:list', async () => {
    return await store.list();
  });

  ipcMain.handle('accounts:add', async (e, account) => {
    return await store.add(account);
  });

  ipcMain.handle('accounts:update', async (e, id, patch) => {
    return await store.update(id, patch);
  });

  ipcMain.handle('accounts:remove', async (e, id) => {
    return await store.remove(id);
  });

  ipcMain.handle('accounts:health', async (e, id) => {
    const acct = await store.get(id);
    return await probeAccount(acct);
  });

  ipcMain.handle('switcher:switch', async (e, id) => {
    return await switcher.switch(id, { dryRun: false });
  });

  ipcMain.handle('daemon:status', async () => {
    return { running: Boolean(watcher?.running) };
  });

  ipcMain.handle('daemon:pause', async () => {
    if (watcher?.running) await watcher.stop();
    return { running: false };
  });

  ipcMain.handle('daemon:resume', async () => {
    if (watcher && !watcher.running) await watcher.start();
    return { running: Boolean(watcher?.running) };
  });

  ipcMain.handle('git:status', async (e, repoPath) => {
    return await gitMonitor.status(repoPath);
  });

  ipcMain.handle('git:watchedRepos', async () => {
    const cfg = await loadConfig();
    return Array.isArray(cfg?.watchedRepos) ? cfg.watchedRepos : [];
  });

  ipcMain.handle('git:addRepo', async (e, repoPath) => {
    const cfg = await loadConfig();
    const list = Array.isArray(cfg?.watchedRepos) ? cfg.watchedRepos.slice() : [];
    if (!list.includes(repoPath)) list.push(repoPath);
    cfg.watchedRepos = list;
    await saveConfig(cfg);
    return list;
  });

  ipcMain.handle('git:removeRepo', async (e, repoPath) => {
    const cfg = await loadConfig();
    const list = Array.isArray(cfg?.watchedRepos) ? cfg.watchedRepos.filter((p) => p !== repoPath) : [];
    cfg.watchedRepos = list;
    await saveConfig(cfg);
    return list;
  });

  ipcMain.handle('git:pickDir', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('journal:tail', async (e, n) => {
    return await journal.tail(n);
  });

  ipcMain.handle('journal:rawMd', async () => {
    try {
      const p = journal.filePath;
      const raw = await fs.readFile(p, 'utf8');
      return raw;
    } catch (err) {
      return '';
    }
  });

  ipcMain.handle('config:get', async () => {
    return await loadConfig();
  });

  ipcMain.handle('config:set', async (e, patch) => {
    const cfg = await loadConfig();
    const next = { ...(cfg || {}), ...(patch || {}) };
    await saveConfig(next);
    return next;
  });

  ipcMain.handle('app:version', async () => {
    try {
      const pkg = require(path.join(process.cwd(), 'package.json'));
      return pkg.version || '';
    } catch {
      return '';
    }
  });
};
