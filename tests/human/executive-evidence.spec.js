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

test.describe("Human Tester 4 — executive evidence flows", () => {
  test("renders executive evidence panel and local AI readiness", async () => {
    await expect(
      page.locator('[data-testid="executive-evidence-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="executive-evidence-title"]'),
    ).toContainText("Executive Evidence");
    await expect(
      page.locator('[data-testid="local-ai-status-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="local-ai-status-value"]'),
    ).toBeVisible();
  });

  test("shows governance and traceability surfaces", async () => {
    await expect(
      page.locator('[data-testid="routing-summary-output"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="timeline-output"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="audit-trail-panel"]'),
    ).toBeVisible();
  });

  test("shows security posture surfaces", async () => {
    await expect(
      page.locator('[data-testid="security-overview-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="security-drift-panel"]'),
    ).toBeVisible();
  });

  test("shows knowledge capability surfaces", async () => {
    await expect(page.locator('[data-testid="knowledge-panel"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="knowledge-query-input"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="knowledge-search-btn"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="knowledge-output"]'),
    ).toBeVisible();
  });

  test("core executive metrics remain visible", async () => {
    await expect(page.locator('[data-testid="metric-total"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="metric-success-rate"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="metric-error-rate"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="metric-latency"]')).toBeVisible();
    await expect(page.locator('[data-testid="metric-latest"]')).toBeVisible();
  });
});
