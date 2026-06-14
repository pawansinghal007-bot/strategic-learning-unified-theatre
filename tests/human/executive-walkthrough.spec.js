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

test.describe("Human Tester 6 — executive walkthrough interactions", () => {
  test("shows walkthrough panel with readiness markers", async () => {
    await expect(
      page.locator('[data-testid="executive-walkthrough-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="walkthrough-step-value"]'),
    ).toHaveText(/Ready/i);
    await expect(
      page.locator('[data-testid="walkthrough-demo-value"]'),
    ).toHaveText(/Standby/i);
    await expect(
      page.locator('[data-testid="walkthrough-sync-value"]'),
    ).toHaveText(/Aligned/i);
  });

  test("demo mode updates walkthrough state", async () => {
    await page.locator('[data-testid="start-demo-mode-btn"]').click();
    await expect(
      page.locator('[data-testid="walkthrough-step-value"]'),
    ).toContainText("Demo Running");
    await expect(
      page.locator('[data-testid="walkthrough-demo-value"]'),
    ).toContainText(/active/i);
  });

  test("export proof summary updates export and summary outputs", async () => {
    await page.locator('[data-testid="export-proof-summary-btn"]').click();
    await expect(
      page.locator('[data-testid="walkthrough-export-value"]'),
    ).toContainText("Exported");
    await expect(
      page.locator('[data-testid="proof-summary-output"]'),
    ).toContainText("Executive Proof Summary");
    await expect(
      page.locator('[data-testid="proof-summary-output"]'),
    ).toContainText("Governance surface: ready");
  });

  test("copy proof summary preserves exportable summary text", async () => {
    await page.locator('[data-testid="copy-proof-summary-btn"]').click();
    await expect(
      page.locator('[data-testid="walkthrough-export-value"]'),
    ).toContainText("Copied");
    await expect(
      page.locator('[data-testid="proof-summary-output"]'),
    ).toContainText("Sprint 59 walkthrough export prepared.");
  });

  test("walkthrough surfaces remain available for screenshots and demo review", async () => {
    await expect(
      page.locator('[data-testid="routing-summary-output"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="security-overview-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="security-drift-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="knowledge-output"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="timeline-output"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="audit-trail-panel"]'),
    ).toBeVisible();
  });
});
