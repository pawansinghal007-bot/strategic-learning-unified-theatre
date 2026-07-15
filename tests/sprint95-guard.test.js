import fs from "node:fs";
import path from "node:path";

const instructionsPath = path.resolve(
  "strategic-learning-unified-theatre-master-instructions.md",
);
const snapshotPointerPath = path.resolve("CURRENT_ACTIVE_SNAPSHOT.md");

describe("Sprint 95 guard test", () => {
  let instructions;
  let snapshotPointer;

  beforeAll(() => {
    instructions = fs.readFileSync(instructionsPath, "utf8");
    snapshotPointer = fs.readFileSync(snapshotPointerPath, "utf8").trim();
  });

  describe("Snapshot pointer verification", () => {
    it("CURRENT_ACTIVE_SNAPSHOT.md points to sprint95 or later", () => {
      // Dynamic numeric check — works for sprint95, sprint100+ without
      // ever needing updating again.
      const match = snapshotPointer.match(
        /^strategic-learning-unified-theatre-ai-snapshot-sprint(\d+)/,
      );
      expect(match).not.toBeNull();
      const sprintNumber = parseInt(match[1], 10);
      expect(sprintNumber).toBeGreaterThanOrEqual(95);
    });
  });

  describe("Master instructions verification", () => {
    it("master-instructions documents Sprint 82 through Sprint 94 (backfilled history)", () => {
      for (const n of [82, 83, 84, 85, 86, 89, 90, 91, 92, 93, 94]) {
        expect(instructions, `Missing Sprint ${n} block`).toMatch(
          new RegExp(`^## Sprint ${n}\\b`, "m"),
        );
      }
      // Sprints 87 and 88 were executed and documented together.
      expect(instructions).toMatch(/^## Sprint 87\/88\b/m);
    });

    it("master-instructions contains Sprint 95 Planned block", () => {
      expect(instructions).toContain("## Sprint 95");
      expect(instructions).toContain("Status: Planned");
    });
  });

  describe("Repo hygiene verification", () => {
    it("src/local-llm.js (stale pre-migration duplicate) no longer exists", () => {
      expect(fs.existsSync(path.resolve("src/local-llm.js"))).toBe(false);
    });

    it("vitest.config.ts no longer excludes deleted Milvus files", () => {
      const config = fs.readFileSync(path.resolve("vitest.config.ts"), "utf8");
      expect(config).not.toContain("milvus-client");
      expect(config).not.toContain("ingest-sprint-history.ts");
    });

    it("repo root contains no stray garbage files from the broken-paste incident", () => {
      const root = process.cwd();
      const suspects = [
        "LocalLlmInference,",
        "actionsCount",
        "sha256:",
        "tinyllama:",
        "let",
        "import",
        "}",
        "},",
      ];
      for (const name of suspects) {
        expect(
          fs.existsSync(path.join(root, name)),
          `Stray file should not exist: ${name}`,
        ).toBe(false);
      }
    });
  });
});
