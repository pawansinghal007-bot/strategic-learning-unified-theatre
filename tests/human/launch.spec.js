import { test, expect } from "@playwright/test";
import {
  launchHumanTester,
  closeHumanTester,
  expectDashboardLoaded,
} from "./helpers/electronApp.js";

test.describe("Human Tester — launch smoke", () => {
  let app;
  let window;

  test.afterEach(async () => {
    await closeHumanTester(app);
  });

  test("app launches and shows core dashboard sections", async () => {
    ({ app, window } = await launchHumanTester());
    await expectDashboardLoaded(window);

    await expect(window.getByText("Local LLM")).toBeVisible({ timeout: 10000 });
    await expect(window.getByText("Browser Automation")).toBeVisible({
      timeout: 10000,
    });
    await expect(window.getByText("Git Monitor")).toBeVisible({
      timeout: 10000,
    });
  });

  test("system status is visible on launch", async () => {
    ({ app, window } = await launchHumanTester());
    await expectDashboardLoaded(window);
    await expect(window.getByText(/passive learning (on|off)/)).toBeVisible({
      timeout: 10000,
    });
    await expect(window.getByText(/daemon - v/)).toBeVisible({
      timeout: 10000,
    });
  });
});
