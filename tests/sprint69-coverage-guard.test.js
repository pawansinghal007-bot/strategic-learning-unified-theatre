import fs from "node:fs";
import path from "node:path";

const coverageTestPath = path.resolve(
  "tests/sprint69-coverage-expansion.test.js",
);
const sprint68GuardPath = path.resolve(
  "tests/sprint68-gate-path-guard.test.js",
);
const sprint67GuardPath = path.resolve(
  "tests/sprint67-measured-cleanup.test.js",
);
const sprint66GuardPath = path.resolve(
  "tests/sprint66-remediation-guard.test.js",
);
const sprint65GuardPath = path.resolve("tests/sprint65-guard-only.test.js");
const dashboardPath = path.resolve("src/ui/dashboard.js");
const htmlPath = path.resolve("src/ui/provider-dashboard.html");

describe("Sprint 69 coverage guard", () => {
  let coverageTestContent;
  let dashboardContent;
  let htmlContent;

  beforeAll(() => {
    coverageTestContent = fs.readFileSync(coverageTestPath, "utf8");
    dashboardContent = fs.readFileSync(dashboardPath, "utf8");
    htmlContent = fs.readFileSync(htmlPath, "utf8");
  });

  describe("scope boundary", () => {
    it("coverage expansion test file exists", () => {
      expect(fs.existsSync(coverageTestPath)).toBe(true);
    });

    it("coverage expansion test references browser-bridge (not user-bridge)", () => {
      expect(coverageTestContent).toContain("browser-bridge");
      expect(coverageTestContent).not.toContain("user-bridge");
    });

    it("coverage expansion test references agent-handoff", () => {
      expect(coverageTestContent).toContain("agent-handoff");
    });

    it("coverage expansion test references local-llm", () => {
      expect(coverageTestContent).toContain("local-llm");
    });

    it("coverage expansion test does not reference dashboard panel testids", () => {
      expect(coverageTestContent).not.toContain("executive-evidence-panel");
      expect(coverageTestContent).not.toContain("executive-proof-panel");
      expect(coverageTestContent).not.toContain("executive-release-panel");
    });

    it("coverage expansion test does not import from vitest", () => {
      expect(coverageTestContent).not.toMatch(
        /import\s+\{[^}]*\b(describe|it|expect|vi)\b[^}]*\}\s+from\s+['\"]vitest['\"]/,
      );
    });
  });

  describe("prior sprint guard preservation", () => {
    it("sprint65 guard file still exists", () => {
      expect(fs.existsSync(sprint65GuardPath)).toBe(true);
    });

    it("sprint66 guard file still exists", () => {
      expect(fs.existsSync(sprint66GuardPath)).toBe(true);
    });

    it("sprint67 guard file still exists", () => {
      expect(fs.existsSync(sprint67GuardPath)).toBe(true);
    });

    it("sprint68 guard file still exists", () => {
      expect(fs.existsSync(sprint68GuardPath)).toBe(true);
    });
  });

  describe("dashboard regression prevention", () => {
    it("dashboard.js still free of var declarations", () => {
      expect(dashboardContent).not.toMatch(/^\s*var\s+/m);
    });

    it("dashboard.js still has zero setAttribute data-* calls", () => {
      expect(dashboardContent).not.toContain("setAttribute('data-");
      expect(dashboardContent).not.toContain('setAttribute("data-');
    });

    it("executive panel count in HTML unchanged at 12", () => {
      const panelIds = htmlContent.match(/id="executive-[a-z]+-panel"/g) ?? [];
      expect(panelIds.length).toBe(12);
    });

    it("blocked-truth wording preserved in dashboard.js", () => {
      expect(dashboardContent).toContain("FAILED");
      expect(dashboardContent).not.toContain("Sonar verified clean");
    });
  });
});
