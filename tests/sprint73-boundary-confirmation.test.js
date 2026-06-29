import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const timelinePath = path.resolve("master_timeline_sprints_1_97.md");
const instructionsPath = path.resolve(
  "strategic-learning-unified-theatre-master-instructions.md",
);

describe("Sprint 73 boundary confirmation guard", () => {
  let timeline = "";
  let instructions = "";

  beforeAll(() => {
    timeline = fs.readFileSync(timelinePath, "utf8");
    instructions = fs.readFileSync(instructionsPath, "utf8");
  });

  it("CURRENT_ACTIVE_SNAPSHOT.md exists and contains a sprint reference", () => {
    const pointer = fs
      .readFileSync("CURRENT_ACTIVE_SNAPSHOT.md", "utf8")
      .trim();
    expect(pointer.length).toBeGreaterThan(0);
    expect(pointer).toContain("sprint");
  });

  it("master instructions preserve Sprint 73 Complete block", () => {
    expect(instructions).toContain("## Sprint 73 Complete");
    expect(instructions).toContain("outside automated-script scope");
    expect(instructions).toContain("Sprint 72 hard boundary intact");
  });

  it("master instructions preserve Sprint 74 Complete block", () => {
    expect(instructions).toContain("## Sprint 74 Complete");
    expect(instructions).toContain("violation-remediation");
  });

  it("master instructions preserve Sprint 75 Complete block", () => {
    expect(instructions).toContain("## Sprint 75 Complete");
  });
});
