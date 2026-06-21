import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

describe("Sprint 87/88 security gate guard", () => {
  it("no Math.random() in security-tooling files", () => {
    const files = [
      "src/llm/routing-history.ts",
      "src/security/risks/dependency-check-runner.ts",
      "src/security/risks/trivy-runner.ts",
      "src/security/secrets/gitleaks-runner.ts",
    ];
    for (const f of files) {
      const content = read(f);
      expect(content, `Math.random() must not appear in ${f}`).not.toMatch(
        /Math\.random\(\)/,
      );
    }
  });

  it("no SHA-1 in gitleaks-runner.ts", () => {
    const content = read("src/security/secrets/gitleaks-runner.ts");
    expect(content).not.toMatch(/createHash\(['"]sha1['"]\)/i);
  });

  it("hotspot log has no TO_REVIEW entries", () => {
    const log = read("docs/security-hotspot-log.md");
    expect((log.match(/\bTO_REVIEW\b/g) || []).length).toBe(0);
  });

  it("hotspot log has no stale zero-count summary", () => {
    const log = read("docs/security-hotspot-log.md");
    expect(log).not.toMatch(/\*\*Reviewed\*\*: 0/);
    expect(log).not.toMatch(/\*\*To Review\*\*: 16/);
  });

  it("all PATH hotspot entries are ACKNOWLEDGED, not SAFE", () => {
    const log = read("docs/security-hotspot-log.md");
    const pathBlocks = log
      .split("### ")
      .slice(1)
      .filter(
        (b) =>
          b.includes("S4036") ||
          b.includes("Path Traversal") ||
          b.includes("PATH variable"),
      );
    expect(pathBlocks.length, "Expected 6 PATH hotspot entries").toBe(6);
    for (const block of pathBlocks) {
      expect(block, "PATH hotspot must be ACKNOWLEDGED, not SAFE").toMatch(
        /Status\*\*: ACKNOWLEDGED/,
      );
      expect(
        block,
        "ACKNOWLEDGED entry must reference unit test file",
      ).toContain("sanitize-env-spawn.test.js");
    }
  });

  it("PATH sanitizer unit test file exists", () => {
    expect(
      fs.existsSync(path.join(root, "tests/sanitize-env-spawn.test.js")),
    ).toBe(true);
  });

  it("security confidence summary does not overclaim", () => {
    const summary = read("docs/security-confidence-summary.md");
    expect(summary).not.toMatch(/security.?complete/i);
    expect(summary).not.toMatch(/all issues resolved/i);
    expect(summary).not.toMatch(/sonar verified clean/i);
    // Check for "100% coverage" in summary section (not in metrics table)
    const summarySection = summary.split("## Summary")[1] || "";
    expect(summarySection).not.toMatch(/100% coverage/i);
  });

  it("hotspot log has 16 verdict entries with Reviewer field", () => {
    const log = read("docs/security-hotspot-log.md");
    const blocks = log
      .split("### ")
      .slice(1)
      .filter((b) => /^\d+\./.test(b.trim()));
    expect(blocks.length, "Expected 16 hotspot entries").toBe(16);
    const withReviewer = blocks.filter((b) => b.includes("- **Reviewer**:"));
    expect(withReviewer.length, "Every entry must have a Reviewer field").toBe(
      16,
    );
  });
});
