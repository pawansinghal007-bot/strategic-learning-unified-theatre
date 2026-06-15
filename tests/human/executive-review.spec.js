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

test.describe("Human Tester 8 — executive review interactions", () => {
  test("shows review panel with readiness markers", async () => {
    await expect(
      page.locator('[data-testid="executive-review-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="review-drift-source-value"]'),
    ).toHaveText(/Ready/i);
    await expect(
      page.locator('[data-testid="review-benchmark-source-value"]'),
    ).toHaveText(/Ready/i);
    await expect(
      page.locator('[data-testid="review-persistence-value"]'),
    ).toHaveText(/Standby/i);
  });

  test("load live review prepares exportable evidence", async () => {
    await page.locator('[data-testid="load-live-review-btn"]').click();
    await expect(page.locator('[data-testid="review-output"]')).toContainText(
      "Live executive review evidence loaded",
    );
    await expect(
      page.locator('[data-testid="review-export-output"]'),
    ).toContainText("Executive Review Evidence");
  });

  test("export review evidence updates export state", async () => {
    await page.locator('[data-testid="export-review-evidence-btn"]').click();
    await expect(
      page.locator('[data-testid="review-export-value"]'),
    ).toContainText("Exported");
    await expect(
      page.locator('[data-testid="review-export-output"]'),
    ).toContainText("Executive Review Evidence");
  });

  test("verify persistence updates persistence check state", async () => {
    await page.locator('[data-testid="verify-review-persistence-btn"]').click();
    await expect(
      page.locator('[data-testid="review-persistence-value"]'),
    ).toContainText("Verified");
    await expect(page.locator('[data-testid="review-output"]')).toContainText(
      "Review persistence verified",
    );
  });

  test("review surfaces remain available for leadership review", async () => {
    await expect(
      page.locator('[data-testid="drift-history-output"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="compliance-output"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="proof-summary-output"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="review-export-output"]'),
    ).toBeVisible();
  });
});
