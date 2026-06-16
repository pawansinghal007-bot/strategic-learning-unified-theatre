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

test.describe("Sprint 63 executive release interactions", () => {
  test("shows release panel with truth-state markers", async () => {
    await expect(
      page.locator('[data-testid="executive-release-panel"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="release-scan-value"]')).toHaveText(
      /Executed/i,
    );
    await expect(page.locator('[data-testid="release-gate-value"]')).toHaveText(
      /Failed/i,
    );
    await expect(
      page.locator('[data-testid="release-issues-value"]'),
    ).toContainText("89");
    await expect(
      page.locator('[data-testid="release-coverage-value"]'),
    ).toHaveText(/LCOV Present/i);
  });

  test("load release readiness shows blocked status truthfully", async () => {
    await page.locator('[data-testid="load-release-readiness-btn"]').click();
    await expect(
      page.locator('[data-testid="release-readiness-output"]'),
    ).toContainText("Quality gate currently FAILED");
  });

  test("verify blockers keeps release in blocked state", async () => {
    await page.locator('[data-testid="verify-release-blockers-btn"]').click();
    await expect(
      page.locator('[data-testid="release-blockers-output"]'),
    ).toContainText("quality gate FAILED");
  });

  test("refresh sonar truth preserves blocked release state", async () => {
    await page.locator('[data-testid="refresh-sonar-truth-btn"]').click();
    await expect(
      page.locator('[data-testid="executive-release-panel"]'),
    ).toHaveAttribute("data-release-readiness", /failed|blocked/i);
    await expect(
      page.locator('[data-testid="release-readiness-output"]'),
    ).toContainText("Release remains blocked");
  });

  test("review and release surfaces stay aligned for screenshot use", async () => {
    await expect(page.locator('[data-testid="review-output"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="review-export-output"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="release-readiness-output"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="release-blockers-output"]'),
    ).toBeVisible();
  });
});
