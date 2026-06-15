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

test.describe("Human Tester 7 launch smoke", () => {
  test("loads evidence, proof, walkthrough, and compliance surfaces", async () => {
    await expect(
      page.locator('[data-testid="executive-evidence-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="workspace-id-input"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="load-unified-view-btn"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="executive-proof-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="executive-walkthrough-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="executive-compliance-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="local-ai-status-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="security-overview-panel"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="knowledge-panel"]')).toBeVisible();
  });

  test("walkthrough flow starts in ready state", async () => {
    await expect(
      page.locator('[data-testid="proof-last-action-value"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="proof-state-output"]'),
    ).toContainText("Executive proof flow initialized");
    await expect(
      page.locator('[data-testid="walkthrough-step-value"]'),
    ).toContainText("Ready");
    await expect(
      page.locator('[data-testid="walkthrough-output"]'),
    ).toContainText("Executive walkthrough initialized");
    await expect(
      page.locator('[data-testid="proof-summary-output"]'),
    ).toContainText("No executive proof summary exported yet.");
  });

  test("compliance flow starts in ready state", async () => {
    await expect(
      page.locator('[data-testid="compliance-benchmark-value"]'),
    ).toContainText("Ready");
    await expect(
      page.locator('[data-testid="compliance-output"]'),
    ).toContainText("Compliance walkthrough initialized");
    await expect(
      page.locator('[data-testid="drift-history-output"]'),
    ).toContainText("No drift history loaded yet.");
  });
});
