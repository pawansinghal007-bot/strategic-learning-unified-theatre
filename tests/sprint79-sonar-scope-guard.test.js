"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Sprint 79 — Sonar scope guard", () => {
  it("ingest-sprint-history.js uses top-level await pattern (Sprint 79 closure)", () => {
    const text = read("src/knowledge/ingest/ingest-sprint-history.js");
    // The .js file uses: if (process.argv[1] === __filename) { await main(); }
    // This is a synchronous module detection with top-level await inside the guard.
    expect(text).toContain("if (process.argv[1] === __filename)");
    expect(text).toContain("await main();");
    // Should NOT have async IIFE
    expect(text).not.toContain("(async () => {");
    expect(text).not.toContain("})();");
  });

  it("ingest-sprint-history.js has no async IIFE (Sprint 79 closure)", () => {
    const text = read("src/knowledge/ingest/ingest-sprint-history.js");
    expect(text).not.toContain("(async () => {");
    expect(text).not.toContain("})();");
  });

  it("master_timeline_sprints_1_97.md has Sprint 79 Complete row", () => {
    const text = read("master_timeline_sprints_1_97.md");
    expect(text).toContain("| 79     |");
    expect(text).toContain("S7785 async IIFE remediation");
    expect(text).toContain("sprint-79-complete");
  });

  it("strategic-learning-unified-theatre-master-instructions.md has Sprint 79 Complete section", () => {
    const text = read(
      "strategic-learning-unified-theatre-master-instructions.md",
    );
    expect(text).toContain("## Sprint 79 Complete");
    expect(text).toContain("S7785 async IIFE remediation sprint");
  });

  it("sonar.newCode.referenceBranch=main preserved (Sprint 78/79 scope boundary)", () => {
    const text = read("sonar-project.properties");
    expect(text).toContain("sonar.newCode.referenceBranch=main");
  });

  it("sprint77-build-and-scope-guard.test.js retained (Sprint 78/79 regression guard)", () => {
    const text = read("tests/sprint77-build-and-scope-guard.test.js");
    expect(text).toContain("Sprint 77 — build and scope guard");
    expect(text).toContain(
      "ingest-sprint-history.js uses top-level await pattern",
    );
    expect(text).toContain("dashboard.js has zero window. references");
  });
});
