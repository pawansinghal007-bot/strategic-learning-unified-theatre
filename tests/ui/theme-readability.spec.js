import { test, expect } from "@playwright/test";
import {
  launchUiValidationApp,
  closeUiValidationApp,
  takeScreenshot,
  getStyleSnapshot,
} from "./helpers/electronUi.js";

test.describe("UI validation — theme and readability (Sprint 56)", () => {
  let app;
  let window;

  test.afterEach(async () => {
    await closeUiValidationApp(app);
  });

  test("dashboard renders with stable data-testid selectors accessible", async () => {
    ({ app, window } = await launchUiValidationApp());

    // Stable data-testid selectors (Sprint 56)
    await expect(
      window.locator('[data-testid="local-ai-status-panel"]'),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      window.locator('[data-testid="workspace-id-input"]'),
    ).toBeVisible();
    await expect(
      window.locator('[data-testid="load-unified-view-btn"]'),
    ).toBeVisible();
    await expect(window.locator('[data-testid="metric-total"]')).toBeVisible();
    await expect(
      window.locator('[data-testid="security-overview-panel"]'),
    ).toBeVisible();

    const styles = await getStyleSnapshot(window);
    expect(styles.backgroundColor).toBeTruthy();
    expect(styles.color).toBeTruthy();

    await takeScreenshot(window, "theme-readability-sprint56");
  });
});
