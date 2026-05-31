const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { shell } = require("electron");

function resolveModule(relPath) {
  return pathToFileURL(path.resolve(__dirname, relPath)).href;
}

module.exports = async function register({ ipcMain, dialog, watcher, app }) {
  const { AccountStore } = await import(
    resolveModule("../../src/accounts/store.js")
  );
  const { SecretStore: SecretStoreClass } = await import(
    resolveModule("../../src/accounts/secret-store.js")
  );
  const { captureAuthBlob } = await import(
    resolveModule("../../src/auth-capture.js")
  );
  const { SwitcherService } = await import(
    resolveModule("../../src/accounts/switcher.js")
  );
  const { resolveAuthPath } = await import(
    resolveModule("../../src/internal/paths.js")
  );
  const { GitMonitor } = await import(
    resolveModule("../../src/internal/git-monitor.js")
  );
  const { Journal } = await import(
    resolveModule("../../src/internal/journal.js")
  );
  const { loadConfig, saveConfig } = await import(
    resolveModule("../../src/internal/config.js")
  );
  const { probeAccount } = await import(
    resolveModule("../../src/accounts/health.js")
  );
  const { getLlmStatus, setupModel, askLocalLlm } = await import(
    resolveModule("../../src/llm/local-llm.js")
  );
  const browserBridge = await import(
    resolveModule("../../src/browser-bridge.js")
  );
  const testRunner = await import(resolveModule("../../src/test-runner.js"));

  const store = watcher?.store ?? new AccountStore();
  const secretStore = new SecretStoreClass();
  const switcher = watcher?.switcher ?? new SwitcherService({ store });
  const journal = new Journal();
  const gitMonitor = new GitMonitor();

  const LOGIN_TARGETS = {
    vscode: "https://code.visualstudio.com/",
    github: "https://github.com/features/copilot",
    codex: "https://app.codex.com/login",
    trae: "https://trae.ai/",
  };

  const pathExists = async (filePath) => {
    try {
      await fs.stat(filePath);
      return true;
    } catch {
      return false;
    }
  };

  const getAccountAuthInfo = async (account) => {
    try {
      const authPath = await resolveAuthPath(account.agentType, {
        profileName: account.profileName ?? null,
        preferExisting: true,
      });
      return {
        authPath,
        authPathExists: await pathExists(authPath),
        loginUrl:
          LOGIN_TARGETS[account.agentType] ||
          `https://www.google.com/search?q=${encodeURIComponent(`login ${account.agentType}`)}`,
        supportsVsCodeAuth: ["vscode", "github", "codex", "trae"].includes(
          account.agentType,
        ),
      };
    } catch {
      return {
        authPath: null,
        authPathExists: false,
        loginUrl:
          LOGIN_TARGETS[account.agentType] ||
          `https://www.google.com/search?q=${encodeURIComponent(`login ${account.agentType}`)}`,
        supportsVsCodeAuth: ["vscode", "github", "codex", "trae"].includes(
          account.agentType,
        ),
      };
    }
  };

  ipcMain.handle("accounts:list", async () => {
    await secretStore.migrateLegacy({ storePath: store.storePath });
    return await store.list();
  });

  ipcMain.handle("accounts:add", async (e, account) => {
    const id = String(account?.id || account?.email || `acct-${Date.now()}`);
    const email = String(account?.email || "").trim();
    const agentType = String(account?.agentType || "vscode").trim();
    const authBlob = String(account?.authBlob || "").trim();
    const profileName = account?.profileName
      ? String(account.profileName).trim()
      : null;

    if (!email) {
      throw new Error("Email is required");
    }
    if (!authBlob) {
      throw new Error("Auth blob is required");
    }

    await secretStore.set(id, authBlob);
    const added = await store.add({
      id,
      email,
      agentType,
      authBlob: null,
      profileName,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });
    return JSON.parse(JSON.stringify(added));
  });

  ipcMain.handle("accounts:capture", async (e, payload) => {
    try {
      const email = String(payload?.email || "").trim();
      const agentType = String(payload?.agentType || "vscode").trim();
      const profileName = payload?.profileName
        ? String(payload.profileName).trim()
        : null;
      const timeoutMs = Number(payload?.timeoutMs || 120000);
      const launchEditor = Boolean(payload?.launchEditor);

      if (!email) {
        throw new Error("Email is required for capture");
      }

      const authBlob = await captureAuthBlob(agentType, {
        timeoutMs,
        launchEditor,
        profileName,
      });

      const id = `captured-${Date.now()}`;
      await secretStore.set(id, authBlob);
      const added = await store.add({
        id,
        email,
        agentType,
        authBlob: null,
        profileName,
        cooldownUntil: null,
        lastUsed: null,
        status: "active",
      });
      return JSON.parse(JSON.stringify(added));
    } catch (err) {
      throw new Error(String(err?.message ?? err));
    }
  });

  // Backwards-compatible alias: some callers used a different channel name
  ipcMain.handle("account capture", async (e, payload) => {
    return await ipcMain
      .invoke?.("accounts:capture", payload)
      .catch(async () => {
        // Fallback: run same logic inline if invoke isn't available
        const email = String(payload?.email || "").trim();
        const agentType = String(payload?.agentType || "vscode").trim();
        const profileName = payload?.profileName
          ? String(payload.profileName).trim()
          : null;
        const timeoutMs = Number(payload?.timeoutMs || 120000);
        const launchEditor = Boolean(payload?.launchEditor);

        if (!email) {
          throw new Error("Email is required for capture");
        }

        const authBlob = await captureAuthBlob(agentType, {
          timeoutMs,
          launchEditor,
          profileName,
        });

        const id = `captured-${Date.now()}`;
        await secretStore.set(id, authBlob);
        const added = await store.add({
          id,
          email,
          agentType,
          authBlob: null,
          profileName,
          cooldownUntil: null,
          lastUsed: null,
          status: "active",
        });
        return JSON.parse(JSON.stringify(added));
      });
  });

  ipcMain.handle("accounts:update", async (e, id, patch) => {
    return await store.update(id, patch);
  });

  ipcMain.handle("accounts:remove", async (e, id) => {
    return await store.remove(id);
  });

  ipcMain.handle("accounts:listDetails", async () => {
    await secretStore.migrateLegacy({ storePath: store.storePath });
    const list = await store.list();
    const details = await Promise.all(
      list.map(async (account) => ({
        ...account,
        ...(await getAccountAuthInfo(account)),
      })),
    );
    return details;
  });

  ipcMain.handle("accounts:info", async (e, id) => {
    const account = await store.get(id);
    return {
      ...account,
      ...(await getAccountAuthInfo(account)),
    };
  });

  ipcMain.handle("accounts:health", async (e, id) => {
    const acct = await store.get(id);
    return await probeAccount(acct);
  });

  ipcMain.handle("switcher:switch", async (e, id) => {
    return await switcher.switch(id, { dryRun: false });
  });

  ipcMain.handle("llm:status", async () => {
    return await getLlmStatus();
  });

  ipcMain.handle("llm:setup", async (e, payload) => {
    return await setupModel(payload || {});
  });

  ipcMain.handle("llm:ask", async (e, payload) => {
    return await askLocalLlm(payload || {});
  });

  ipcMain.handle("browser:send", async (e, payload) => {
    return await browserBridge.sendPrompt(payload || {});
  });

  ipcMain.handle("browser:login", async (e, payload) => {
    return await browserBridge.loginToPage(payload || {});
  });

  ipcMain.handle("browser:listResponses", async (e, payload) => {
    return await browserBridge.listResponses(payload || {});
  });

  ipcMain.handle("browser:getResponse", async (e, filename) => {
    return await browserBridge.getResponseMetadata(filename);
  });

  ipcMain.handle("browser:clearResponses", async (e, payload) => {
    return await browserBridge.clearResponses(payload || {});
  });

  ipcMain.handle("browser:listPrompts", async () => {
    return await browserBridge.loadPromptLibrary();
  });

  ipcMain.handle("browser:addPrompt", async (e, prompt) => {
    return await browserBridge.addPrompt(prompt || {});
  });

  ipcMain.handle("browser:updatePrompt", async (e, id, updates) => {
    return await browserBridge.updatePrompt(id, updates || {});
  });

  ipcMain.handle("browser:deletePrompt", async (e, id) => {
    return await browserBridge.deletePrompt(id);
  });

  ipcMain.handle("browser:runPrompt", async (e, payload) => {
    return await browserBridge.runPromptTemplate(payload || {});
  });

  ipcMain.handle("robot:runSuite", async (e, opts) => {
    return await testRunner.runSuite(opts || {});
  });

  ipcMain.handle("robot:tddCheck", async (e, opts) => {
    return await testRunner.assertTddGate(opts || {});
  });

  ipcMain.handle("robot:generateSkeleton", async (e, filePath) => {
    return await testRunner.generateSkeletonRobotFile(filePath);
  });

  ipcMain.handle("robot:runFile", async (e, filePath, opts) => {
    return await testRunner.runRobotFile(filePath, opts?.outputDir, opts?.env);
  });

  ipcMain.handle("robot:listFiles", async () => {
    return await testRunner.listRobotFiles();
  });

  ipcMain.handle("robot:readFile", async (e, filePath) => {
    return await testRunner.readRobotFile(filePath);
  });

  ipcMain.handle("robot:openFile", async (e, filePath) => {
    const rootDir = path.resolve(__dirname, "..", "..", "robot");
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(rootDir, filePath);
    const result = await shell.openPath(resolved);
    if (result) {
      throw new Error(`Failed to open file: ${result}`);
    }
    return { opened: true, path: resolved };
  });

  ipcMain.handle("robot:pickSourceFile", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Source files", extensions: ["js", "ts"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0)
      return null;
    return res.filePaths[0];
  });

  ipcMain.handle("robot:pickRobotFile", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Robot files", extensions: ["robot"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0)
      return null;
    return res.filePaths[0];
  });

  ipcMain.handle("app:openUrl", async (e, url) => {
    if (!url || typeof url !== "string") {
      throw new Error("URL is required");
    }
    return await shell.openExternal(url);
  });

  ipcMain.handle("daemon:status", async () => {
    return { running: Boolean(watcher?.running) };
  });

  ipcMain.handle("daemon:pause", async () => {
    if (watcher?.running) await watcher.stop();
    return { running: false };
  });

  ipcMain.handle("daemon:resume", async () => {
    if (watcher && !watcher.running) await watcher.start();
    return { running: Boolean(watcher?.running) };
  });

  ipcMain.handle("git:status", async (e, repoPath) => {
    return await gitMonitor.status(repoPath);
  });

  ipcMain.handle("git:watchedRepos", async () => {
    const cfg = await loadConfig();
    return Array.isArray(cfg?.watchedRepos) ? cfg.watchedRepos : [];
  });

  ipcMain.handle("git:addRepo", async (e, repoPath) => {
    const cfg = await loadConfig();
    const list = Array.isArray(cfg?.watchedRepos)
      ? cfg.watchedRepos.slice()
      : [];
    if (!list.includes(repoPath)) list.push(repoPath);
    cfg.watchedRepos = list;
    await saveConfig(cfg);
    return list;
  });

  ipcMain.handle("git:removeRepo", async (e, repoPath) => {
    const cfg = await loadConfig();
    const list = Array.isArray(cfg?.watchedRepos)
      ? cfg.watchedRepos.filter((p) => p !== repoPath)
      : [];
    cfg.watchedRepos = list;
    await saveConfig(cfg);
    return list;
  });

  ipcMain.handle("git:pickDir", async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0)
      return null;
    return res.filePaths[0];
  });

  ipcMain.handle("journal:tail", async (e, n) => {
    return await journal.tail(n);
  });

  ipcMain.handle("journal:rawMd", async () => {
    try {
      const p = journal.filePath;
      const raw = await fs.readFile(p, "utf8");
      return raw;
    } catch (err) {
      return "";
    }
  });

  ipcMain.handle("config:get", async () => {
    return await loadConfig();
  });

  ipcMain.handle("config:set", async (e, patch) => {
    const cfg = await loadConfig();
    const next = { ...(cfg || {}), ...(patch || {}) };
    await saveConfig(next);
    return next;
  });

  ipcMain.handle("app:version", async () => {
    try {
      const pkg = require(path.join(process.cwd(), "package.json"));
      return pkg.version || "";
    } catch {
      return "";
    }
  });
};
