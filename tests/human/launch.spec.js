import { test, expect } from "@playwright/test";
import { launchElectronApp, closeElectronApp } from "../helpers/electronApp.js";

let app;
let page;

test.beforeAll(async () => {
  ({ app, page } = await launchElectronApp());
});

test.afterAll(async () => {
  await closeElectronApp(app);
});

test.describe("launch smoke — stable executive selectors", () => {
  test("dashboard root evidence surfaces are locatable", async () => {
    await expect(
      page.locator('[data-testid="local-ai-status-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="executive-evidence-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="workspace-id-input"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="load-unified-view-btn"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="security-overview-panel"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="knowledge-panel"]')).toBeVisible();
  });
});
