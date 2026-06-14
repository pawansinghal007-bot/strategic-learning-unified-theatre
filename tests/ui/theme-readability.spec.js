import { test, expect } from "@playwright/test";
import { launchElectronApp, closeElectronApp } from "../helpers/electronApp.js";

let app;
let page;

const legacySelectors = [
  'data-testid="local-ai-status-panel"',
  'data-testid="workspace-id-input"',
  'data-testid="metric-total"',
];

test.beforeAll(async () => {
  ({ app, page } = await launchElectronApp());
});

test.afterAll(async () => {
  await closeElectronApp(app);
});

test.describe("theme readability — evidence surfaces", () => {
  test("legacy selector strings remain explicit for regression coverage", () => {
    expect(legacySelectors).toContain('data-testid="local-ai-status-panel"');
    expect(legacySelectors).toContain('data-testid="workspace-id-input"');
    expect(legacySelectors).toContain('data-testid="metric-total"');
  });

  test("critical evidence panels render visibly in current theme", async () => {
    const ids = [
      "executive-evidence-panel",
      "local-ai-status-panel",
      "security-overview-panel",
      "security-drift-panel",
      "knowledge-panel",
    ];
    for (const id of ids) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
    }
  });

  test("critical metrics and outputs remain readable", async () => {
    const ids = [
      "metric-total",
      "metric-success-rate",
      "metric-error-rate",
      "routing-summary-output",
      "timeline-output",
      "knowledge-output",
    ];
    for (const id of ids) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
    }
  });
});
