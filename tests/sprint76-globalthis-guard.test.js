"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Sprint 76 — globalThis cleanup guard", () => {
  let dashboard;
  let instructions;
  let timeline;

  beforeAll(() => {
    dashboard = read("src/ui/dashboard.js");
    instructions = read(
      "strategic-learning-unified-theatre-master-instructions.md",
    );
    timeline = read("master_timeline_sprints_1_54.md");
  });

  it("dashboard.js has zero window. references", () => {
    expect(dashboard).not.toContain("window.");
    expect(dashboard).toContain("globalThis.");
  });

  it("dashboard uses globalThis for audit and workspace surfaces", () => {
    expect(dashboard).toContain("globalThis.audit.verify");
    expect(dashboard).toContain("globalThis.workspaceRouting.analytics");
    expect(dashboard).toContain("globalThis.workspaceQuota.set");
  });

  it("master instructions records Sprint 76 as complete", () => {
    expect(instructions).toContain("Sprint 76 Complete");
  });

  it("master instructions contains scope boundary phrase", () => {
    expect(instructions).toContain("Do not expand dashboard features");
  });

  it("timeline contains Sprint 76 Complete marker", () => {
    expect(timeline).toContain("| 76");
    expect(timeline).toContain("Complete");
  });
});
