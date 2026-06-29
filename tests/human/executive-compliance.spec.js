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

test.describe("Human Tester 7 — executive compliance interactions", () => {
  test("shows compliance panel with readiness markers", async () => {
    await expect(
      page.locator('[data-testid="executive-compliance-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="compliance-benchmark-value"]'),
    ).toHaveText(/Ready/i);
    await expect(
      page.locator('[data-testid="compliance-drift-value"]'),
    ).toHaveText(/Idle/i);
    await expect(
      page.locator('[data-testid="compliance-persistence-value"]'),
    ).toHaveText(/Standby/i);
  });

  test("load drift history updates drift output", async () => {
    // Manual probe: try calling the function directly if it's accessible
    const _manual = await page.evaluate(() => {
      try {
        const el = document.querySelector(
          '[data-testid="compliance-drift-value"]',
        );
        if (el) el.textContent = "MANUAL";
        return { worked: el?.textContent };
      } catch (e) {
        return { error: e.message };
      }
    });

    const result = await page.evaluate(() => {
      const btn = document.querySelector(
        '[data-testid="load-drift-history-btn"]',
      );
      if (!btn) return { found: false };
      let fired = false;
      let valDuringHandler = "NOT SET";
      btn.addEventListener(
        "click",
        () => {
          fired = true;
          valDuringHandler = document.querySelector(
            '[data-testid="compliance-drift-value"]',
          )?.textContent;
        },
        { capture: false, once: true },
      );
      btn.click();
      return {
        found: true,
        fired,
        valDuringHandler,
        valAfter: document.querySelector(
          '[data-testid="compliance-drift-value"]',
        )?.textContent,
      };
    });

    await page.locator('[data-testid="load-drift-history-btn"]').click();
    await expect(
      page.locator('[data-testid="compliance-drift-value"]'),
    ).toContainText("Loaded");
    await expect(
      page.locator('[data-testid="drift-history-output"]'),
    ).toContainText("Executive Drift Review");
    await expect(
      page.locator('[data-testid="compliance-output"]'),
    ).toContainText("Executive drift history loaded");
  });

  test("map compliance benchmarks updates compliance output", async () => {
    await page.locator('[data-testid="map-compliance-benchmarks-btn"]').click();
    await expect(
      page.locator('[data-testid="compliance-benchmark-value"]'),
    ).toContainText("Mapped");
    await expect(
      page.locator('[data-testid="compliance-output"]'),
    ).toContainText("OWASP Top 10: mapped");
    await expect(
      page.locator('[data-testid="compliance-output"]'),
    ).toContainText("CIS benchmark surface: mapped");
  });

  test("persist demo state updates persistence markers", async () => {
    await page.locator('[data-testid="persist-demo-state-btn"]').click();
    await expect(
      page.locator('[data-testid="compliance-persistence-value"]'),
    ).toContainText("Persisted");
    await expect(
      page.locator('[data-testid="walkthrough-output"]'),
    ).toContainText("Walkthrough state persisted");
  });

  test("compliance surfaces remain available for executive review", async () => {
    await expect(
      page.locator('[data-testid="audit-trail-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="security-overview-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="security-drift-panel"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="timeline-output"]')).toBeVisible();
  });
});
