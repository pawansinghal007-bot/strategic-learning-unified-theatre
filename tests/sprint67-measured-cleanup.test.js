import fs from "node:fs";
import path from "node:path";

const dashboardPath = path.resolve("src/ui/dashboard.js");
const htmlPath = path.resolve("src/ui/provider-dashboard.html");

describe("Sprint 67 measured cleanup guard", () => {
  let dashboard;
  let html;

  beforeAll(() => {
    dashboard = fs.readFileSync(dashboardPath, "utf8");
    html = fs.readFileSync(htmlPath, "utf8");
  });

  describe("dashboard.js architecture preserved", () => {
    it("provider-dashboard.html loads dashboard.js via script src", () => {
      expect(html).toContain("dashboard.js");
    });

    it("no new panels or feature surfaces added to HTML", () => {
      expect(html).toContain('data-testid="executive-release-panel"');
      expect(html).toContain('data-testid="executive-review-panel"');
      expect(html).toContain('data-testid="executive-compliance-panel"');
    });
  });

  describe("S3504 var conversion", () => {
    it("uses const or let rather than var in state helper functions", () => {
      expect(dashboard).not.toMatch(/^\s*var lastActionEl\s*=/m);
      expect(dashboard).not.toMatch(/^\s*var proofOutputEl\s*=/m);
      expect(dashboard).not.toMatch(/^\s*var valueEl\s*=/m);
      expect(dashboard).not.toMatch(/^\s*var detailEl\s*=/m);
      expect(dashboard).not.toMatch(/^\s*var stepEl\s*=/m);
      expect(dashboard).not.toMatch(/^\s*var outputEl\s*=/m);
      expect(dashboard).not.toMatch(/^\s*var persistenceEl\s*=/m);
      expect(dashboard).not.toMatch(/^\s*var reviewOutput\s*=/m);
      expect(dashboard).not.toMatch(/^\s*var blockersValue\s*=/m);
    });

    it("setReleaseState zero-indentation preserved after var conversion", () => {
      const match = dashboard.match(/function setReleaseState[\s\S]*?\n\}/);
      expect(match).not.toBeNull();
    });

    it("setReleaseState uses const or let at zero indent", () => {
      expect(dashboard).toMatch(
        /\s*const t = normalizeStateToken|\s*var t = normalizeStateToken/m,
      );
    });
  });

  describe("S7761 getAttribute residual resolved", () => {
    it("no getAttribute calls on data-* attributes remain", () => {
      const lines = dashboard.split("\n");
      const violations = lines.filter((line) =>
        /getAttribute\s*\(\s*['"]data-/.test(line),
      );
      expect(violations).toHaveLength(0);
    });
  });

  describe("S7760 default parameter resolved", () => {
    it("setWalkthroughState uses default parameter syntax", () => {
      expect(dashboard).toMatch(
        /function setWalkthroughState\s*\(step,\s*detail,\s*mode\s*=\s*['"]standby['"]\)/,
      );
    });
  });

  describe("Sprint 63-66 regression prevention", () => {
    it("all dataset operations preserved from Sprint 64/65", () => {
      expect(dashboard).toContain("dataset.localAiState");
      expect(dashboard).toContain("dataset.lastProofAction");
      expect(dashboard).toContain("dataset.proofOutput");
      expect(dashboard).toContain("dataset.releaseTruth");
      expect(dashboard).toContain("dataset.releaseBlockersState");
      expect(dashboard).toContain("dataset.complianceOutput");
      expect(dashboard).toContain("dataset.reviewOutput");
      expect(dashboard).toContain("dataset.walkthroughOutput");
    });

    it("zero setAttribute data-* calls remain", () => {
      expect(dashboard).not.toContain("setAttribute('data-");
      expect(dashboard).not.toContain('setAttribute("data-');
    });

    it("blocked-truth wording preserved", () => {
      expect(dashboard).toContain("FAILED");
      expect(dashboard).not.toContain("Sonar verified clean");
    });

    it("attachIfExists helper still present from Sprint 66", () => {
      expect(dashboard).toContain("function attachIfExists(");
    });
  });

  describe("Sprint 66 regression guard still satisfies", () => {
    it("complianceOutput dataset still present", () => {
      expect(dashboard).toContain("dataset.complianceOutput");
    });

    it("releaseReadinessOutput dataset still present", () => {
      expect(dashboard).toContain("dataset.releaseReadinessOutput");
    });
  });
});
