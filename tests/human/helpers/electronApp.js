import path from "node:path";
import { _electron as electron, expect } from "@playwright/test";

export async function launchHumanTester() {
  const appPath = path.join(process.cwd(), "electron-ui", "main.bundled.cjs");
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
  return { app, window };
}

export async function closeHumanTester(app) {
  if (app) {
    try {
      await app.close();
    } catch {}
  }
}

export async function expectDashboardLoaded(window) {
  await expect(window.getByText("Strategic Learning Theatre")).toBeVisible({
    timeout: 20000,
  });
  await expect(window.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    window.getByRole("heading", { name: "Active Account" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    window.getByRole("heading", { name: "Recent Events" }),
  ).toBeVisible({ timeout: 10000 });
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
