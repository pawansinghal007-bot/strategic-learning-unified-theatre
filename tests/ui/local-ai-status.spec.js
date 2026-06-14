import { test, expect } from "@playwright/test";
import {
  launchUiValidationApp,
  closeUiValidationApp,
  takeScreenshot,
  readLocalAiStatus,
} from "./helpers/electronUi.js";

test.describe("UI validation — local AI status detection", () => {
  let app;
  let window;

  test.afterEach(async () => {
    await closeUiValidationApp(app);
  });

  test("local AI status is accessible via preload bridge", async () => {
    ({ app, window } = await launchUiValidationApp());

    const status = await readLocalAiStatus(window);
    await takeScreenshot(window, "local-ai-status");

    expect(status.llmStatus !== null || status.error !== null).toBe(true);

    console.log("Local AI status result:", JSON.stringify(status));
  });
});
