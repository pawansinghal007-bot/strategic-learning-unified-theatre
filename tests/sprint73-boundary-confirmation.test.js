import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";

const timelinePath = path.resolve("master_timeline_sprints_1_54.md");
const instructionsPath = path.resolve(
  "strategic-learning-unified-theatre-master-instructions.md",
);
const snapshotPointerPath = path.resolve("CURRENT_ACTIVE_SNAPSHOT.md");
const sprint73StablePath = path.resolve(
  "strategic-learning-unified-theatre-ai-snapshot-sprint73-stable",
);

describe("Sprint 73 boundary confirmation guard", () => {
  let timeline = "";
  let instructions = "";
  let activeSnapshotPointer = "";
  let activeSnapshotBody = "";
  let sprint73StableBody = "";

  beforeAll(() => {
    timeline = fs.readFileSync(timelinePath, "utf8");
    instructions = fs.readFileSync(instructionsPath, "utf8");
    activeSnapshotPointer = fs.readFileSync(snapshotPointerPath, "utf8").trim();
    sprint73StableBody = fs.readFileSync(sprint73StablePath, "utf8");

    const activeSnapshotPath = path.resolve(activeSnapshotPointer);
    expect(fs.existsSync(activeSnapshotPath)).toBe(true);
    activeSnapshotBody = fs.readFileSync(activeSnapshotPath, "utf8");
  });

  describe("Sprint 73 permanent boundary facts", () => {
    it("timeline records Sprint 73 as Complete", () => {
      expect(timeline).toContain("| 73");
      expect(timeline).toContain("Remaining-scope boundary confirmation");
      expect(timeline).toContain(
        "human admin decision outside automation scope",
      );
      expect(timeline).toContain(
        "Added sprint73-boundary-confirmation.test.js",
      );
      expect(timeline).toContain("| Complete |");
    });

    it("master instructions preserve Sprint 73 completion language", () => {
      expect(instructions).toContain("Sprint 73 Complete");
      expect(instructions).toContain(
        "confirmed Sprint 72 hard boundary intact",
      );
      expect(instructions).toContain(
        "outside automated-script scope phrase preserved from Sprint 72",
      );
    });

    it("master instructions show Sprint 74 closed and Sprint 75 complete", () => {
      // Sprint 74 Planned heading is replaced by Complete at sprint closure —
      // assert the heading that actually exists after closure.
      expect(instructions).toContain("## Sprint 74 Complete");
      expect(instructions).toContain("## Sprint 75 Complete");
      expect(instructions).toContain("violation-remediation");
    });
  });

  describe("Snapshot chain", () => {
    it("active snapshot pointer matches the project naming convention", () => {
      expect(activeSnapshotPointer).toMatch(
        /^strategic-learning-unified-theatre-ai-snapshot-sprint\d+/,
      );
    });

    it("active snapshot file exists and is non-empty", () => {
      expect(activeSnapshotBody.length).toBeGreaterThan(100);
    });

    it("sprint73 stable snapshot exists and is non-empty", () => {
      expect(sprint73StableBody.length).toBeGreaterThan(100);
    });

    it("CURRENT_ACTIVE_SNAPSHOT is not pinned to sprint73 forever", () => {
      // Guards must never assert transient sprint-local filenames.
      // The pointer is allowed to advance beyond sprint73.
      expect(activeSnapshotPointer).not.toBe("");
      expect(activeSnapshotPointer).not.toBe("CURRENT_ACTIVE_SNAPSHOT.md");
    });

    it("sprint73 stable snapshot body contains SPRINT 73 header", () => {
      expect(sprint73StableBody).toContain("SPRINT 73");
    });
  });

  describe("Boundary rule wording", () => {
    it("combined docs document the hard boundary as a human admin decision", () => {
      const combined = `${timeline}\n${instructions}`;
      expect(combined).toContain("human admin decision");
      expect(combined).toContain("outside automation scope");
    });

    it("no transient Next state asserted for Sprint 73 in any doc", () => {
      const combined = `${timeline}\n${instructions}`;
      // This exact string appeared in the broken guard before the lesson was applied.
      expect(combined).not.toContain(
        "| 73     | Remaining-scope boundary confirmation sprint | Next |",
      );
    });
  });
});
