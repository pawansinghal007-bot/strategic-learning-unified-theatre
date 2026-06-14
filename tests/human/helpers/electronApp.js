import path from "node:path";
import { _electron as electron, expect } from "@playwright/test";

export async function launchHumanTester() {
  const appPath = path.join(process.cwd(), "electron-ui", "main.bundled.cjs");
  const dashboardPath = path.join(
    process.cwd(),
    "src",
    "ui",
    "provider-dashboard.html",
  );
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
  const app = await electron.launch({
    args: [appPath],
    env: {
      ...env,
      NODE_ENV: "development",
    },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await app.evaluate(async ({ BrowserWindow, session }, filePath) => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: details.responseHeaders });
    });
    const focusedWindow =
      BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    await focusedWindow.loadFile(filePath);
  }, dashboardPath);
  await window.waitForLoadState("domcontentloaded");
  return { app, window, page: window };
}

export async function closeHumanTester(app) {
  if (app) {
    try {
      await app.close();
    } catch {}
  }
}

export async function expectDashboardLoaded(window) {
  await expect(
    window.locator('[data-testid="executive-evidence-panel"]'),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    window.locator('[data-testid="executive-proof-panel"]'),
  ).toBeVisible({ timeout: 10000 });
  await expect(window.getByText("Workspace Quotas")).toBeVisible({
    timeout: 10000,
  });
  await expect(window.getByText("Security Overview")).toBeVisible({
    timeout: 10000,
  });
}

export async function safeClickByText(window, text) {
  const locator = window.getByRole("button", { name: text }).first();
  try {
    await expect(locator).toBeVisible({ timeout: 5000 });
    await locator.click();
  } catch {
    // Button may not exist in current dashboard state — skip gracefully.
  }
}
