import { loadDashboardSurface } from "./dashboard-loader.js";
import fs from "node:fs";
import path from "node:path";

const launchSpecPath = path.resolve("tests/human/launch.spec.js");
const themeSpecPath = path.resolve("tests/ui/theme-readability.spec.js");
const evidenceSpecPath = path.resolve("tests/human/executive-evidence.spec.js");

describe("Sprint 57 Human Tester 4 — regression guard", () => {
  let dashboard;

  beforeAll(() => {
    dashboard = loadDashboardSurface();
  });

  describe("executive evidence panel hooks", () => {
    it("includes executive-evidence-panel testid", () => {
      expect(dashboard).toContain('data-testid="executive-evidence-panel"');
    });

    it("includes executive-evidence-title testid", () => {
      expect(dashboard).toContain('data-testid="executive-evidence-title"');
    });

    it("includes all four evidence card values", () => {
      expect(dashboard).toContain('data-testid="evidence-governance-value"');
      expect(dashboard).toContain('data-testid="evidence-security-value"');
      expect(dashboard).toContain('data-testid="evidence-knowledge-value"');
      expect(dashboard).toContain('data-testid="evidence-local-ai-value"');
    });
  });

  describe("local AI status hooks preserved and extended", () => {
    it("preserves local-ai-status-panel and value elements", () => {
      expect(dashboard).toContain('data-testid="local-ai-status-panel"');
      expect(dashboard).toContain('data-testid="local-ai-status-value"');
      expect(dashboard).toContain('data-testid="local-ai-status-detail"');
    });

    it("setLocalAiStatus syncs evidence-local-ai-value", () => {
      expect(dashboard).toContain("evidence-local-ai-value");
      expect(dashboard).toContain("data-local-ai-state");
      expect(dashboard).toContain("setLocalAiStatus(");
    });

    it("DOMContentLoaded references Sprint 57", () => {
      expect(dashboard).toContain("Sprint 57 evidence surface active");
    });
  });

  describe("evidence-critical panels", () => {
    it("security-overview-panel has evidence-surface attribute", () => {
      expect(dashboard).toContain('data-testid="security-overview-panel"');
      expect(dashboard).toContain('data-evidence-surface="security"');
    });

    it("security-drift-panel has evidence-surface attribute", () => {
      expect(dashboard).toContain('data-testid="security-drift-panel"');
      expect(dashboard).toContain('data-evidence-surface="security-drift"');
    });

    it("knowledge-panel has evidence-surface attribute", () => {
      expect(dashboard).toContain('data-testid="knowledge-panel"');
      expect(dashboard).toContain('data-evidence-surface="knowledge"');
    });

    it("audit-trail-panel has evidence-surface attribute", () => {
      expect(dashboard).toContain('data-testid="audit-trail-panel"');
      expect(dashboard).toContain('data-evidence-surface="audit"');
    });
  });

  describe("evidence-critical outputs", () => {
    it("routing-summary-output has evidence-category governance", () => {
      expect(dashboard).toContain('data-testid="routing-summary-output"');
      expect(dashboard).toContain('data-evidence-category="governance"');
    });

    it("timeline-output has evidence-category traceability", () => {
      expect(dashboard).toContain('data-testid="timeline-output"');
      expect(dashboard).toContain('data-evidence-category="traceability"');
    });

    it("knowledge-output has evidence-category knowledge", () => {
      expect(dashboard).toContain('data-testid="knowledge-output"');
      expect(dashboard).toContain('data-evidence-category="knowledge"');
    });
  });

  describe("Sprint 25-56 compatibility strings preserved", () => {
    it("retains Sprint 56 compatibility entry", () => {
      expect(dashboard).toContain("Sprint 56");
    });

    it("contains Sprint 57 compatibility entries", () => {
      expect(dashboard).toContain("Sprint 57");
    });
  });

  describe("Playwright spec files exist and use evidence selectors", () => {
    it("executive-evidence.spec.js exists", () => {
      expect(fs.existsSync(evidenceSpecPath)).toBe(true);
    });

    it("launch.spec.js exists and uses executive-evidence-panel", () => {
      expect(fs.existsSync(launchSpecPath)).toBe(true);
      const content = fs.readFileSync(launchSpecPath, "utf8");
      expect(content).toContain('[data-testid="executive-evidence-panel"]');
      expect(content).toContain('[data-testid="local-ai-status-panel"]');
    });

    it("theme spec covers evidence surfaces", () => {
      expect(fs.existsSync(themeSpecPath)).toBe(true);
      const content = fs.readFileSync(themeSpecPath, "utf8");
      expect(content).toContain("executive-evidence-panel");
      expect(content).toContain("security-overview-panel");
      expect(content).toContain("knowledge-panel");
    });

    it("executive evidence spec covers pitch-critical surfaces", () => {
      const content = fs.readFileSync(evidenceSpecPath, "utf8");
      expect(content).toContain("routing-summary-output");
      expect(content).toContain("timeline-output");
      expect(content).toContain("security-drift-panel");
      expect(content).toContain("knowledge-output");
    });
  });
});
