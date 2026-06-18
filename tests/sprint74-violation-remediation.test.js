import fs from "node:fs";
import path from "node:path";

const timelinePath = path.resolve("master_timeline_sprints_1_54.md");
const instructionsPath = path.resolve(
  "strategic-learning-unified-theatre-master-instructions.md",
);
const sprint73StablePath = path.resolve(
  "strategic-learning-unified-theatre-ai-snapshot-sprint73-stable",
);
const sprint73GuardPath = path.resolve(
  "tests/sprint73-boundary-confirmation.test.js",
);
const sonarPropsPath = path.resolve("sonar-project.properties");

describe("Sprint 74 violation-remediation guard", () => {
  let timeline;
  let instructions;
  let sprint73Stable;
  let sonarProps;

  beforeAll(() => {
    timeline = fs.readFileSync(timelinePath, "utf8");
    instructions = fs.readFileSync(instructionsPath, "utf8");
    sprint73Stable = fs.readFileSync(sprint73StablePath, "utf8");
    sonarProps = fs.readFileSync(sonarPropsPath, "utf8");
  });

  describe("Sprint 73 closure preserved", () => {
    it("timeline contains Sprint 73 as Complete", () => {
      expect(timeline).toContain("| 73 ");
      expect(timeline).toContain("Remaining-scope boundary confirmation");
      expect(timeline).toContain("| Complete |");
    });

    it("master-instructions contains Sprint 73 Complete block", () => {
      expect(instructions).toContain("## Sprint 73 Complete");
    });

    it("master-instructions contains Sprint 74 Planned block", () => {
      expect(instructions).toContain("## Sprint 74 Planned");
    });

    it("sprint73 guard file still exists", () => {
      expect(fs.existsSync(sprint73GuardPath)).toBe(true);
    });
  });

  describe("sonar.newCode.referenceBranch preserved", () => {
    it("sonar-project.properties contains referenceBranch=main", () => {
      expect(sonarProps).toContain("sonar.newCode.referenceBranch=main");
    });
  });

  describe("violation-remediation scope boundary", () => {
    it("master-instructions Sprint 74 Planned records do-not-reset constraint", () => {
      expect(instructions).toContain("do NOT reset new-code-period");
    });

    it("sprint73 stable confirms new-code-period reset is human admin decision", () => {
      expect(sprint73Stable).toContain("human admin decision");
    });

    it("sprint73 stable records no source file changes", () => {
      expect(sprint73Stable).toContain("NO SOURCE FILE CHANGES THIS SPRINT");
    });
  });

  describe("timeline Sprint 74 entry", () => {
    it("timeline contains Sprint 74 row", () => {
      expect(timeline).toContain("| 74 ");
    });

    it("timeline Sprint 74 row references violation remediation", () => {
      expect(timeline).toContain("new_violations");
    });
  });
});
