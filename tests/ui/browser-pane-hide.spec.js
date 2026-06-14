import { test, expect } from "@playwright/test";
import {
  launchUiValidationApp,
  closeUiValidationApp,
  takeScreenshot,
  callBrowserPaneVisible,
  isCenterPointClickable,
} from "./helpers/electronUi.js";

test.describe("UI validation — browser pane hide restores clickability", () => {
  let app;
  let window;

  test.afterEach(async () => {
    await closeUiValidationApp(app);
  });

  test("dashboard button is clickable at center after browser pane is hidden", async () => {
    ({ app, window } = await launchUiValidationApp());

    const targetButton = window
      .getByRole("button", { name: "Load audit events" })
      .first();
    await expect(targetButton).toBeVisible();

    await callBrowserPaneVisible(window, true, "chatgpt");
    await window.waitForTimeout(1000);

    await callBrowserPaneVisible(window, false, "chatgpt");
    await window.waitForTimeout(1000);

    const clickable = await isCenterPointClickable(window, targetButton);
    await takeScreenshot(window, "browser-pane-hidden-clickable");

    expect(clickable).toBe(true);
  });
});
