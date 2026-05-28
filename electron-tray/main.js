import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { app, Menu, Tray, nativeImage, shell, clipboard } from "electron";

import { AccountStore } from "../src/accounts/store.js";
import { WatcherDaemon } from "../src/daemon/watcher.js";
import { SwitcherService } from "../src/accounts/switcher.js";
import { CooldownScheduler } from "../src/scheduler.js";
import { getActiveSprint } from "../src/agent-handoff.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.join(os.homedir(), ".vscode-rotator", "daemon.log");
const iconPaths = {
  ok: path.join(__dirname, "assets", "icon-ok.png"),
  warn: path.join(__dirname, "assets", "icon-warn.png"),
  error: path.join(__dirname, "assets", "icon-error.png"),
};

let tray = null;
let currentStatus = "ok";
let currentAccounts = [];
let currentAccount = null;
let currentSprint = null;

const store = new AccountStore();
const switcher = new SwitcherService({ store });
const scheduler = new CooldownScheduler();
const daemon = new WatcherDaemon({ store, switcher, scheduler });

function loadIcon(state) {
  const file = iconPaths[state] || iconPaths.ok;
  return nativeImage.createFromPath(file).resize({ width: 16, height: 16 });
}

function getStateFromAccounts(accounts) {
  const active = accounts.filter((a) => a.status !== "retired");
  if (active.length === 0) return "error";
  if (active.every((a) => a.status === "cooldown")) return "error";
  if (active.some((a) => a.status === "cooldown")) return "warn";
  return "ok";
}

function truncate(text, limit) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function pickCurrentAccount(accounts) {
  const active = accounts.filter((a) => a.status !== "retired");
  if (active.length === 0) return null;
  return active.slice().sort((a, b) => {
    const at = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
    const bt = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
    return bt - at;
  })[0];
}

async function refreshAccounts() {
  try {
    currentAccounts = await store.list();
    currentAccount = pickCurrentAccount(currentAccounts);
    currentStatus = getStateFromAccounts(currentAccounts);
    currentSprint = await getActiveSprint();
  } catch {
    currentAccounts = [];
    currentAccount = null;
    currentStatus = "warn";
    currentSprint = null;
  }
}

function buildMenu() {
  const activeSprintLabel = currentSprint
    ? `Active sprint: ${truncate(currentSprint.goal, 30)}`
    : "Active sprint: none";
  const activeLabel = currentAccount
    ? `Active: ${currentAccount.email}`
    : "Active: none";
  const switchItems = currentAccounts
    .filter((a) => a.id !== currentAccount?.id && a.status !== "retired")
    .map((account) => ({
      label: `${account.email}${account.status === "cooldown" ? " (cooldown)" : ""}`,
      type: "normal",
      enabled: account.status !== "cooldown",
      click: async () => {
        try {
          await switcher.switch(account.id, { dryRun: false });
          await refreshAccounts();
          tray.setContextMenu(buildMenu());
        } catch (error) {
          console.error(error);
        }
      },
    }));

  return Menu.buildFromTemplate([
    {
      label: activeSprintLabel,
      type: "normal",
      enabled: Boolean(currentSprint),
      click: async () => {
        if (currentSprint) {
          await shell.openPath(logPath);
        }
      },
    },
    {
      label: "Copy resume prompt",
      type: "normal",
      enabled: Boolean(currentSprint?.resumePrompt),
      click: () => {
        if (currentSprint?.resumePrompt) {
          clipboard.writeText(currentSprint.resumePrompt);
        }
      },
    },
    { type: "separator" },
    { label: activeLabel, enabled: false },
    { type: "separator" },
    {
      label: "Switch to ▸",
      submenu:
        switchItems.length > 0
          ? switchItems
          : [{ label: "No available account", enabled: false }],
    },
    { type: "separator" },
    {
      label: `Daemon: ${currentStatus}`,
      enabled: false,
    },
    {
      label: "Open log",
      click: async () => {
        await shell.openPath(logPath);
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);
}

async function updateTray() {
  if (!tray) return;
  await refreshAccounts();
  tray.setImage(loadIcon(currentStatus));
  tray.setToolTip("strategic-learning-unified-theatre daemon");
  tray.setContextMenu(buildMenu());
}

async function initializeTray() {
  tray = new Tray(loadIcon(currentStatus));
  tray.setToolTip("strategic-learning-unified-theatre");
  tray.on("click", () => {
    tray.popUpContextMenu();
  });
  await updateTray();
}

function handleDaemonEvent() {
  currentStatus = getStateFromAccounts(currentAccounts);
  updateTray().catch((err) => console.error(err));
}

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("ready", async () => {
  await initializeTray();

  daemon.on("switch", async () => {
    await updateTray();
  });
  daemon.on("cooldown", async () => {
    await updateTray();
  });
  daemon.on("recover", async () => {
    await updateTray();
  });
  daemon.on("git_warn", async () => {
    await updateTray();
  });
  daemon.on("error", async () => {
    currentStatus = "warn";
    await updateTray();
  });

  await daemon.start();
});

app.on("before-quit", async () => {
  await daemon.stop();
});
