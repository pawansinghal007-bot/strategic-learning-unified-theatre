import { test, expect } from "@playwright/test";
import {
  launchHumanTester,
  closeHumanTester,
  expectDashboardLoaded,
  safeClickByText,
} from "./helpers/electronApp.js";

test.describe("Human Tester — analytics and audit", () => {
  let app;
  let window;

  test.afterEach(async () => {
    await closeHumanTester(app);
  });

  test("analytics and audit actions complete without renderer crash", async () => {
    ({ app, window } = await launchHumanTester());
    await expectDashboardLoaded(window);

    await safeClickByText(window, "Load full analytics view");
    await window.waitForTimeout(2000);

    await safeClickByText(window, "Load global analytics");
    await window.waitForTimeout(1000);

    await safeClickByText(window, "Load provider comparison");
    await window.waitForTimeout(1000);

    await safeClickByText(window, "Load audit events");
    await window.waitForTimeout(1000);

    await safeClickByText(window, "Verify audit integrity");
    await window.waitForTimeout(1000);

    await expect(window.getByText("Audit Trail")).toBeVisible({
      timeout: 10000,
    });
    await expect(
      window.getByRole("heading", { name: "Global Analytics" }),
    ).toBeVisible({ timeout: 10000 });
  });
});
