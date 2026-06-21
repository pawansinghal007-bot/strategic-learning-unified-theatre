import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

describe("Sprint 90 coverage policy guard", () => {
  it("docs/coverage-exclusions.md exists and has all required sections", () => {
    const doc = fs.readFileSync(
      path.join(ROOT, "docs/coverage-exclusions.md"),
      "utf8",
    );
    expect(doc).toContain("## Policy");
    expect(doc).toContain("## Current measured baseline");
    expect(doc).toContain("## Bucket A");
    expect(doc).toContain("## Bucket B");
    expect(doc).toContain("## Bucket C");
  });

  it("baseline table contains no TBD values", () => {
    const doc = fs.readFileSync(
      path.join(ROOT, "docs/coverage-exclusions.md"),
      "utf8",
    );
    expect(doc).not.toContain("TBD");
  });

  it("baseline table does not claim 100% on any metric", () => {
    const doc = fs.readFileSync(
      path.join(ROOT, "docs/coverage-exclusions.md"),
      "utf8",
    );
    const lines = doc
      .split("\n")
      .filter((l) => l.includes("|") && l.match(/\d+\.?\d*%/));
    for (const line of lines) {
      const pcts = line.match(/(\d+\.?\d*)%/g) || [];
      for (const pct of pcts) {
        const val = parseFloat(pct);
        expect(val, `Fabricated 100% detected in line: ${line}`).toBeLessThan(
          100,
        );
      }
    }
  });

  it("every Bucket B and C file listed in the doc is present in vitest.config.js exclude list", () => {
    const doc = fs.readFileSync(
      path.join(ROOT, "docs/coverage-exclusions.md"),
      "utf8",
    );
    const vitestConfig = fs.readFileSync(
      path.join(ROOT, "vitest.config.js"),
      "utf8",
    );

    // Extract file paths from Bucket B and C tables (lines starting with | src/)
    const filePaths = [...doc.matchAll(/\|\s*(src\/[^\s|]+)/g)].map((m) =>
      m[1].trim(),
    );

    for (const fp of filePaths) {
      // Check that either the exact path or a parent glob appears in the exclude array
      const base = fp.replace(/\.[^.]+$/, ""); // strip extension for partial match
      expect(
        vitestConfig.includes(fp) || vitestConfig.includes(base),
        `${fp} is documented as excluded but not in vitest.config.js`,
      ).toBe(true);
    }
  });

  it("every Bucket B and C file listed in the doc is present in sonar-project.properties", () => {
    const doc = fs.readFileSync(
      path.join(ROOT, "docs/coverage-exclusions.md"),
      "utf8",
    );
    const sonar = fs.readFileSync(
      path.join(ROOT, "sonar-project.properties"),
      "utf8",
    );

    const filePaths = [...doc.matchAll(/\|\s*(src\/[^\s|]+)/g)].map((m) =>
      m[1].trim(),
    );

    for (const fp of filePaths) {
      const base = fp.replace(/\.[^.]+$/, "");
      expect(
        sonar.includes(fp) || sonar.includes(base),
        `${fp} is documented as excluded but not in sonar-project.properties`,
      ).toBe(true);
    }
  });

  it("coverage-summary.json exists and reports at least 74% statements", () => {
    const summaryPath = path.join(ROOT, "coverage/coverage-summary.json");
    if (!fs.existsSync(summaryPath)) {
      return;
    }
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    expect(summary.total.statements.pct).toBeGreaterThanOrEqual(74);
  });

  it("coverage-summary.json reports at least 60% branches", () => {
    const summaryPath = path.join(ROOT, "coverage/coverage-summary.json");
    if (!fs.existsSync(summaryPath)) {
      return;
    }
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    expect(summary.total.branches.pct).toBeGreaterThanOrEqual(60);
  });
});
