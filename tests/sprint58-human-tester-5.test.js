import fs from "node:fs";
import path from "node:path";

const dashboardPath = path.resolve("src/ui/provider-dashboard.html");
const launchSpecPath = path.resolve("tests/human/launch.spec.js");
const themeSpecPath = path.resolve("tests/ui/theme-readability.spec.js");
const proofSpecPath = path.resolve("tests/human/executive-proof.spec.js");
const evidenceSpecPath = path.resolve("tests/human/executive-evidence.spec.js");

describe("Sprint 58 Human Tester 5 — regression guard", () => {
  let dashboard;

  beforeAll(() => {
    dashboard = fs.readFileSync(dashboardPath, "utf8");
  });

  describe("executive proof panel hooks", () => {
    it("includes executive-proof-panel testid", () => {
      expect(dashboard).toContain('data-testid="executive-proof-panel"');
    });

    it("includes executive-proof-title testid", () => {
      expect(dashboard).toContain('data-testid="executive-proof-title"');
    });

    it("includes all four proof card values", () => {
      expect(dashboard).toContain('data-testid="proof-last-action-value"');
      expect(dashboard).toContain('data-testid="proof-governance-value"');
      expect(dashboard).toContain('data-testid="proof-security-value"');
      expect(dashboard).toContain('data-testid="proof-knowledge-value"');
    });

    it("includes capture button and proof output element", () => {
      expect(dashboard).toContain('data-testid="capture-proof-state-btn"');
      expect(dashboard).toContain('data-testid="proof-state-output"');
    });
  });

  describe("proof helper functions", () => {
    it("setProofAction function is defined", () => {
      expect(dashboard).toContain("function setProofAction(");
    });

    it("setLocalAiStatus function is preserved", () => {
      expect(dashboard).toContain("function setLocalAiStatus(");
    });

    it("setLocalAiStatus calls setProofAction", () => {
      expect(dashboard).toContain("setProofAction(");
    });

    it("DOMContentLoaded references Sprint 58", () => {
      expect(dashboard).toContain("Sprint 58 proof flow synchronized");
    });

    it("DOMContentLoaded references Human Tester 5", () => {
      expect(dashboard).toContain("Human Tester 5");
    });
  });

  describe("data-proof-surface markers", () => {
    it("routing-summary-output has proof-surface routing", () => {
      expect(dashboard).toContain('data-proof-surface="routing"');
    });

    it("timeline-output has proof-surface timeline", () => {
      expect(dashboard).toContain('data-proof-surface="timeline"');
    });

    it("knowledge-output has proof-surface knowledge", () => {
      expect(dashboard).toContain('data-proof-surface="knowledge"');
    });

    it("security-overview-panel has proof-surface security-overview", () => {
      expect(dashboard).toContain('data-proof-surface="security-overview"');
    });

    it("security-drift-panel has proof-surface security-drift", () => {
      expect(dashboard).toContain('data-proof-surface="security-drift"');
    });

    it("audit-trail-panel has proof-surface audit", () => {
      expect(dashboard).toContain('data-proof-surface="audit"');
    });
  });

  describe("Sprint 57 evidence hooks preserved", () => {
    it("executive-evidence-panel still present", () => {
      expect(dashboard).toContain('data-testid="executive-evidence-panel"');
    });

    it("local-ai-status-panel still present", () => {
      expect(dashboard).toContain('data-testid="local-ai-status-panel"');
    });

    it("data-local-ai-state still present", () => {
      expect(dashboard).toContain("data-local-ai-state");
    });
  });

  describe("compatibility strings", () => {
    it("Sprint 56 compatibility strings present", () => {
      expect(dashboard).toContain("Sprint 56");
    });

    it("Sprint 57 compatibility strings present", () => {
      expect(dashboard).toContain("Sprint 57");
    });

    it("Sprint 58 compatibility strings present", () => {
      expect(dashboard).toContain("Sprint 58");
    });
  });

  describe("Playwright spec files", () => {
    it("executive-proof.spec.js exists", () => {
      expect(fs.existsSync(proofSpecPath)).toBe(true);
    });

    it("executive-evidence.spec.js still exists (Sprint 57 preserved)", () => {
      expect(fs.existsSync(evidenceSpecPath)).toBe(true);
    });

    it("launch.spec.js exists and covers proof surfaces", () => {
      expect(fs.existsSync(launchSpecPath)).toBe(true);
      const content = fs.readFileSync(launchSpecPath, "utf8");
      expect(content).toContain("executive-proof-panel");
      expect(content).toContain("proof-state-output");
    });

    it("theme spec covers proof panels", () => {
      expect(fs.existsSync(themeSpecPath)).toBe(true);
      const content = fs.readFileSync(themeSpecPath, "utf8");
      expect(content).toContain("executive-proof-panel");
      expect(content).toContain("proof-state-output");
    });

    it("executive proof spec covers interaction evidence", () => {
      const content = fs.readFileSync(proofSpecPath, "utf8");
      expect(content).toContain("capture-proof-state-btn");
      expect(content).toContain("Proof Captured");
      expect(content).toContain("routing-summary-output");
      expect(content).toContain("knowledge-output");
      expect(content).toContain("timeline-output");
    });
  });
});
