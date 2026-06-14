import { test, expect } from "@playwright/test";
import {
  launchUiValidationApp,
  closeUiValidationApp,
  takeScreenshot,
  callBrowserPaneVisible,
  getOverlapAtElementCenter,
} from "./helpers/electronUi.js";

test.describe("UI validation — browser pane overlap detection", () => {
  let app;
  let window;

  test.afterEach(async () => {
    await closeUiValidationApp(app);
  });

  test("records what element is at audit button center when browser pane is visible", async () => {
    ({ app, window } = await launchUiValidationApp());

    const targetButton = window
      .getByRole("button", { name: "Load audit events" })
      .first();

    await callBrowserPaneVisible(window, true, "chatgpt");
    await window.waitForTimeout(1500);

    const overlap = await getOverlapAtElementCenter(window, targetButton);
    await takeScreenshot(window, "browser-pane-overlap-check");

    expect(overlap).toBeTruthy();
    console.log("Overlap result:", JSON.stringify(overlap));
  });
});
