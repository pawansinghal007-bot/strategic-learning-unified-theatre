import { test, expect } from "@playwright/test";
import {
  launchHumanTester,
  closeHumanTester,
  expectDashboardLoaded,
  safeClickByText,
} from "./helpers/electronApp.js";

test.describe("Human Tester — quota and security overview", () => {
  let app;
  let window;

  test.afterEach(async () => {
    await closeHumanTester(app);
  });

  test("quota controls interact without renderer crash", async () => {
    ({ app, window } = await launchHumanTester());
    await expectDashboardLoaded(window);

    await safeClickByText(window, "Load workspace quota");
    await window.waitForTimeout(1000);

    await safeClickByText(window, "Load quota rollup");
    await window.waitForTimeout(1000);

    await safeClickByText(window, "Evaluate quota");
    await window.waitForTimeout(1000);

    await safeClickByText(window, "Load quota notifications");
    await window.waitForTimeout(1000);

    await expect(window.getByText("Workspace Quotas")).toBeVisible({
      timeout: 10000,
    });
  });

  test("security overview refresh does not crash the renderer", async () => {
    ({ app, window } = await launchHumanTester());
    await expectDashboardLoaded(window);

    await safeClickByText(window, "Refresh Overview");
    await window.waitForTimeout(2000);

    await expect(window.getByText("Security Overview")).toBeVisible({
      timeout: 10000,
    });
  });
});
