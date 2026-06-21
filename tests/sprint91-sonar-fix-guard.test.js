import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("Sprint 91 Sonar fix guard", () => {
  describe("agent-loop-guard.js S4043 fix", () => {
    it("uses spread copy before sort, not in-place sort", () => {
      const content = read("src/llm/agent-loop-guard.js");
      expect(content).toContain("sortedKept");
      expect(content).toMatch(/\[\.\.\.kept\]/);
    });

    it("no longer chains sort directly on kept", () => {
      const content = read("src/llm/agent-loop-guard.js");
      expect(content).not.toMatch(/kept\s*\n?\s*\.sort\s*\(/);
    });
  });

  describe("ingest-sprint-history.js S1128 fix", () => {
    it("does not import pathToFileURL", () => {
      const content = read("src/knowledge/ingest/ingest-sprint-history.js");
      expect(content).not.toContain("{ pathToFileURL }");
    });
  });

  describe("ingest-repository.js S3776/S7785 fix", () => {
    it("exports ingestRepository function", () => {
      const content = read("src/knowledge/ingest/ingest-repository.js");
      expect(content).toContain("export async function ingestRepository");
    });

    it("has helper functions extracted from main orchestrator", () => {
      const content = read("src/knowledge/ingest/ingest-repository.js");
      expect(content).toContain("async function discoverSupportedFiles");
      expect(content).toContain("async function buildChunksForBatch");
      expect(content).toContain("async function attachVectors");
      expect(content).toContain("async function insertChunkBatch");
    });

    it("uses isDirectRun guard for conditional execution", () => {
      const content = read("src/knowledge/ingest/ingest-repository.js");
      expect(content).toContain("function isDirectRun");
      expect(content).toContain("if (isDirectRun())");
    });

    it("guards main() against VITEST environment", () => {
      const content = read("src/knowledge/ingest/ingest-repository.js");
      expect(content).toContain("process.env.VITEST");
    });
  });

  describe("test assertion quality fixes", () => {
    it("scheduler.test.js no longer has expect(true).toBe(true)", () => {
      const content = read("tests/scheduler.test.js");
      expect(content).not.toContain("expect(true).toBe(true)");
      expect(content).not.toContain("expect(false).toBe(true)");
    });

    it("scheduler.test.js uses stat.isDirectory()", () => {
      const content = read("tests/scheduler.test.js");
      expect(content).toContain("isDirectory()");
    });

    it("storageStatus.test.js has proper async test assertions", () => {
      const content = read("tests/storage/storageStatus.test.js");
      expect(content).toContain("async () =>");
      expect(content).toContain("expect(result.status).toBe");
    });

    it("sprint85-guard uses not.toThrow instead of fail()", () => {
      const content = read("tests/sprint85-guard.test.js");
      expect(content).toContain("not.toThrow");
      expect(content).not.toContain("fail(");
    });
  });

  describe("sprint90 coverage thresholds now met", () => {
    it("coverage-summary.json statements >= 74%", () => {
      const summaryPath = path.join(ROOT, "coverage/coverage-summary.json");
      if (!fs.existsSync(summaryPath)) {
        throw new Error(
          "coverage-summary.json missing — run npm run coverage first",
        );
      }
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      expect(summary.total.statements.pct).toBeGreaterThanOrEqual(74);
    });

    it("coverage-summary.json branches >= 60%", () => {
      const summaryPath = path.join(ROOT, "coverage/coverage-summary.json");
      if (!fs.existsSync(summaryPath)) {
        throw new Error(
          "coverage-summary.json missing — run npm run coverage first",
        );
      }
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      expect(summary.total.branches.pct).toBeGreaterThanOrEqual(60);
    });
  });
});
