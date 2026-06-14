import { test, expect } from "@playwright/test";
import { launchHumanTester, closeHumanTester } from "./helpers/electronApp.js";

test.describe("Human Tester — launch smoke (Sprint 56 stable selectors)", () => {
  let app;
  let window;

  test.afterEach(async () => {
    await closeHumanTester(app);
  });

  test("local-AI status panel is present on launch", async () => {
    ({ app, window } = await launchHumanTester());
    await expect(
      window.locator('[data-testid="local-ai-status-panel"]'),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      window.locator('[data-testid="local-ai-status-value"]'),
    ).toBeVisible();
  });

  test("workspace-id input is locatable by data-testid", async () => {
    ({ app, window } = await launchHumanTester());
    await expect(
      window.locator('[data-testid="workspace-id-input"]'),
    ).toBeVisible({ timeout: 15000 });
  });

  test("load-unified-view button is locatable by data-testid", async () => {
    ({ app, window } = await launchHumanTester());
    await expect(
      window.locator('[data-testid="load-unified-view-btn"]'),
    ).toBeVisible({ timeout: 15000 });
  });

  test("security overview panel is locatable by data-testid", async () => {
    ({ app, window } = await launchHumanTester());
    await expect(
      window.locator('[data-testid="security-overview-panel"]'),
    ).toBeVisible({ timeout: 15000 });
  });
});
