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

test.describe("Human Tester 6 — executive proof interactions", () => {
  test("shows proof panel with readiness markers", async () => {
    await expect(
      page.locator('[data-testid="executive-proof-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="proof-governance-value"]'),
    ).toHaveText(/Ready/i);
    await expect(
      page.locator('[data-testid="proof-security-value"]'),
    ).toHaveText(/Ready/i);
    await expect(
      page.locator('[data-testid="proof-knowledge-value"]'),
    ).toHaveText(/Ready/i);
  });

  test("local AI status sync updates proof flow", async () => {
    await expect(
      page.locator('[data-testid="local-ai-status-panel"]'),
    ).toHaveAttribute("data-local-ai-state", /ready/i);
    await expect(
      page.locator('[data-testid="proof-last-action-value"]'),
    ).toBeVisible();
  });

  test("proof flow starts in initialized state after DOMContentLoaded", async () => {
    await expect(
      page.locator('[data-testid="proof-state-output"]'),
    ).toContainText("Executive proof flow initialized for Human Tester 5");
    await expect(
      page.locator('[data-testid="proof-last-action-value"]'),
    ).not.toHaveText("Idle");
  });

  test("capture proof state button click updates last action and output", async () => {
    await page.locator('[data-testid="capture-proof-state-btn"]').click();
    await expect(
      page.locator('[data-testid="proof-last-action-value"]'),
    ).toContainText("Proof Captured");
    await expect(
      page.locator('[data-testid="proof-state-output"]'),
    ).toContainText("Executive proof state captured");
  });

  test("proof and walkthrough surfaces stay aligned", async () => {
    await page.locator('[data-testid="start-demo-mode-btn"]').click();
    await expect(
      page.locator('[data-testid="proof-last-action-value"]'),
    ).toContainText("Demo Mode Active");
    await expect(
      page.locator('[data-testid="walkthrough-output"]'),
    ).toContainText("Executive demo mode enabled");
  });

  test("governance, security, and knowledge surfaces are screenshot-ready", async () => {
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
