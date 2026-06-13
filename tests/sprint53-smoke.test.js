import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Sprint 53 smoke tests — test harness regression", () => {
  it("Sprint 44-45 security test files are present", () => {
    const files = [
      "tests/sprint44-smoke.test.js",
      "tests/secrets-runner.test.js",
      "tests/sprint45-smoke.test.js",
      "tests/risks-runner.test.js",
    ];
    for (const file of files) {
      expect(exists(file), `${file} should exist`).toBe(true);
    }
  });

  it("Sprint 46-48 security overview test files are present", () => {
    const files = [
      "tests/security-overview.test.js",
      "tests/security-overview-drift.test.js",
      "tests/sprint46-smoke.test.js",
      "tests/sprint47-smoke.test.js",
      "tests/sprint48-smoke.test.js",
    ];
    for (const file of files) {
      expect(exists(file), `${file} should exist`).toBe(true);
    }
  });

  it("Sprint 49-52 security test files are present", () => {
    const files = [
      "tests/sprint50-t1.test.js",
      "tests/sprint50-t2.test.js",
      "tests/sprint50-smoke.test.js",
      "tests/sprint51-security-overview.test.js",
      "tests/sprint51-smoke.test.js",
      "tests/sprint52-bulk-triage.test.js",
      "tests/sprint52-smoke.test.js",
    ];
    for (const file of files) {
      expect(exists(file), `${file} should exist`).toBe(true);
    }
  });

  it("core security backend folders exist with index.ts", () => {
    const indexes = [
      "src/security/secrets/index.ts",
      "src/security/risks/index.ts",
      "src/security/security-overview/index.ts",
      "src/knowledge/index.ts",
    ];
    for (const file of indexes) {
      expect(exists(file), `${file} should exist`).toBe(true);
    }
  });

  it("security overview has all 7 module files", () => {
    const modules = [
      "src/security/security-overview/schema.ts",
      "src/security/security-overview/baseline.ts",
      "src/security/security-overview/suppressions.ts",
      "src/security/security-overview/normalizer.ts",
      "src/security/security-overview/triage.ts",
      "src/security/security-overview/drift.ts",
      "src/security/security-overview/ai-explain.ts",
    ];
    for (const file of modules) {
      expect(exists(file), `${file} should exist`).toBe(true);
    }
  });

  it("CURRENT_ACTIVE_SNAPSHOT.md points to sprint52-stable before this sprint updates it", () => {
    const text = read("CURRENT_ACTIVE_SNAPSHOT.md").trim();
    expect(text.includes("sprint52") || text.includes("sprint53")).toBe(true);
  });

  it("master_timeline_sprints_1_54.md exists and lists Sprint 52", () => {
    expect(exists("master_timeline_sprints_1_54.md")).toBe(true);
    const content = read("master_timeline_sprints_1_54.md");
    expect(content).toContain("Sprint 52");
    expect(content).toContain("Bulk triage");
    expect(content).toContain("Sprint 53");
  });

  it("master-instructions mentions Sprint 51 and Sprint 52 Complete", () => {
    const content = read(
      "strategic-learning-unified-theatre-master-instructions.md",
    );
    expect(content).toContain("Sprint 51 Complete");
    expect(content).toContain("Sprint 52 Complete");
  });

  it("architecture baseline files exist from recent sprints", () => {
    const files = fs.readdirSync(root);
    const baselines = files.filter((file) =>
      file.startsWith("PROJECT_ARCHITECTURE_BASELINE-2026"),
    );
    expect(baselines.length).toBeGreaterThan(0);
  });
});
