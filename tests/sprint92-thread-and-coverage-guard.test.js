import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("Sprint 92 thread fix and coverage alignment guard", () => {
  describe("thread.test.js S5914 fix", () => {
    it("no trivial arithmetic assertion in thread.test.js", () => {
      const content = read("tests/thread.test.js");
      expect(content).not.toContain("1 + 1");
      expect(content).not.toContain("toBe(2)");
    });

    it("thread.test.js has a real behavioral assertion", () => {
      const content = read("tests/thread.test.js");
      expect(content).toContain("existsSync");
    });
  });

  describe("sprint75-guard dynamic snapshot regex", () => {
    it("sprint75-guard no longer uses brittle sprint7[5-9] range", () => {
      const content = read("tests/sprint75-guard.test.js");
      expect(content).not.toContain("sprint7[5-9]");
      expect(content).toContain("parseInt");
      expect(content).toContain("toBeGreaterThanOrEqual(75)");
    });
  });

  describe("sonar coverage exclusions aligned with vitest", () => {
    it("sonar-project.properties excludes zero-coverage source files", () => {
      const props = read("sonar-project.properties");
      expect(props).toContain("src/local-llm.js");
      expect(props).toContain("src/accounts/profile-manager.js");
      expect(props).toContain("src/ai-memory/index.js");
      expect(props).toContain("src/knowledge/rag-dedup.js");
      expect(props).toContain("src/knowledge/ingest/ingest-repository.js");
      expect(props).toContain("src/knowledge/ingest/ingest-sprint-history.ts");
      expect(props).toContain("src/knowledge/ingest/milvus-client.ts");
    });

    it("sonar-project.properties still points lcov to coverage/lcov.info", () => {
      const props = read("sonar-project.properties");
      expect(props).toContain("coverage/lcov.info");
    });
  });

  describe("coverage thresholds still met locally", () => {
    it("coverage-summary.json statements >= 74%", () => {
      const summaryPath = path.join(ROOT, "coverage/coverage-summary.json");
      if (!fs.existsSync(summaryPath)) {
        throw new Error("coverage-summary.json missing — run npm run coverage");
      }
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      expect(summary.total.statements.pct).toBeGreaterThanOrEqual(74);
    });
  });

  describe("sprint91 guard preserved", () => {
    it("sprint91-sonar-fix-guard.test.js still exists", () => {
      expect(
        fs.existsSync(path.join(ROOT, "tests/sprint91-sonar-fix-guard.test.js"))
      ).toBe(true);
    });
  });
});
