import { test, expect } from "@playwright/test";
import {
  launchUiValidationApp,
  closeUiValidationApp,
  takeScreenshot,
  getStyleSnapshot,
} from "./helpers/electronUi.js";

test.describe("UI validation — theme and readability", () => {
  let app;
  let window;

  test.afterEach(async () => {
    await closeUiValidationApp(app);
  });

  test("dashboard renders major sections and is not unreadably dark", async () => {
    ({ app, window } = await launchUiValidationApp());

    await expect(window.getByText("Strategic Learning Theatre")).toBeVisible();
    await expect(
      window.getByRole("heading", { name: "Active Account" }),
    ).toBeVisible();
    await expect(
      window.getByRole("heading", { name: "Recent Events" }),
    ).toBeVisible();

    const styles = await getStyleSnapshot(window);
    expect(styles.backgroundColor).toBeTruthy();
    expect(styles.color).toBeTruthy();

    await takeScreenshot(window, "theme-readability-dashboard");
  });
});
