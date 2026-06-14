import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function exists(rel) {
  return existsSync(join(root, rel));
}

describe("Sprint 55 — timeline reconciliation and Playwright scaffold guard", () => {
  it("master timeline marks Sprint 54 and Sprint 55 as Complete", () => {
    const text = read("master_timeline_sprints_1_54.md");
    expect(text).toContain("54");
    expect(text).toContain("55");
    expect(text).toContain("Complete");
  });

  it("master timeline lists Sprint 56 as the next active sprint", () => {
    const text = read("master_timeline_sprints_1_54.md");
    expect(text).toContain("56");
    expect(text).toContain("Selector hardening");
  });

  it("playwright.human.config.cjs exists and is the canonical human config", () => {
    expect(exists("playwright.human.config.cjs")).toBe(true);
  });

  it("playwright.ui.config.cjs exists and is the canonical UI config", () => {
    expect(exists("playwright.ui.config.cjs")).toBe(true);
  });

  it("package.json test:human scripts reference .cjs config", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["test:human"]).toContain("playwright.human.config.cjs");
    expect(pkg.scripts["test:human:smoke"]).toContain(
      "playwright.human.config.cjs",
    );
  });

  it("package.json test:ui scripts reference .cjs config", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["test:ui"]).toContain("playwright.ui.config.cjs");
    expect(pkg.scripts["test:ui:theme"]).toContain("playwright.ui.config.cjs");
  });

  it("Human Tester spec files exist under tests/human/", () => {
    const files = [
      "tests/human/helpers/electronApp.js",
      "tests/human/launch.spec.js",
      "tests/human/analytics-audit.spec.js",
      "tests/human/quota-security.spec.js",
    ];
    for (const f of files) {
      expect(exists(f), `${f} should exist`).toBe(true);
    }
  });

  it("UI validation spec files exist under tests/ui/", () => {
    const files = [
      "tests/ui/helpers/electronUi.js",
      "tests/ui/theme-readability.spec.js",
      "tests/ui/browser-pane-overlap.spec.js",
      "tests/ui/browser-pane-hide.spec.js",
      "tests/ui/local-ai-status.spec.js",
    ];
    for (const f of files) {
      expect(exists(f), `${f} should exist`).toBe(true);
    }
  });

  it("Sprint 54 auto-scan backend files exist", () => {
    expect(exists("src/security/security-overview/auto-scan.ts")).toBe(true);
    expect(exists("src/security/security-overview/drift-history.ts")).toBe(
      true,
    );
  });

  it("security-overview index.ts exports auto-scan and drift-history", () => {
    const content = read("src/security/security-overview/index.ts");
    expect(content).toContain("./auto-scan");
    expect(content).toContain("./drift-history");
  });

  it("preload exposes autoScan and listDriftHistory on workspaceSecurity", () => {
    const content = read("electron-ui/preload.cjs");
    expect(content).toContain("autoScan");
    expect(content).toContain("listDriftHistory");
  });

  it("master-instructions mentions Sprint 54 and Sprint 55 Complete", () => {
    const content = read(
      "strategic-learning-unified-theatre-master-instructions.md",
    );
    expect(content).toContain("Sprint 54 Complete");
    expect(content).toContain("Sprint 55 Complete");
  });

  it("CURRENT_ACTIVE_SNAPSHOT.md points to sprint55-stable", () => {
    const text = read("CURRENT_ACTIVE_SNAPSHOT.md").trim();
    expect(text).toBe(
      "strategic-learning-unified-theatre-ai-snapshot-sprint55-stable",
    );
  });
});
