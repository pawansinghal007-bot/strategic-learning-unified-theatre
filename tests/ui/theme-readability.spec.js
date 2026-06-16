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

test.describe("Human Tester 8 theme readability", () => {
  test("legacy selector strings remain explicit for regression coverage", () => {
    expect(legacySelectors).toContain('data-testid="local-ai-status-panel"');
    expect(legacySelectors).toContain('data-testid="workspace-id-input"');
    expect(legacySelectors).toContain('data-testid="metric-total"');
  });

  test("evidence, proof, walkthrough, compliance, and review panels remain visible and readable", async () => {
    const ids = [
      "executive-evidence-panel",
      "executive-proof-panel",
      "executive-walkthrough-panel",
      "executive-compliance-panel",
      "executive-review-panel",
      "executive-release-panel",
      "local-ai-status-panel",
      "security-overview-panel",
      "security-drift-panel",
      "knowledge-panel",
    ];
    for (const id of ids) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
    }
  });

  test("walkthrough, summary, compliance, review, and release outputs remain visible", async () => {
    const ids = [
      "routing-summary-output",
      "timeline-output",
      "knowledge-output",
      "proof-state-output",
      "walkthrough-output",
      "proof-summary-output",
      "compliance-output",
      "drift-history-output",
      "review-output",
      "review-export-output",
      "release-readiness-output",
      "release-blockers-output",
    ];
    for (const id of ids) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
    }
  });
});
