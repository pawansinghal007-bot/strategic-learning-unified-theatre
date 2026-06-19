"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Sprint 77 — build and scope guard", () => {
  it("ingest-sprint-history.ts has no top-level await", () => {
    const text = read("src/knowledge/ingest/ingest-sprint-history.ts");
    const lines = text.split(/\r?\n/);

    // Top-level await appears at column 0 or with no indentation before it.
    // await inside function bodies is always indented by at least 2 spaces.
    const topLevelAwaits = lines.filter((line) => /^await\s/.test(line));

    expect(topLevelAwaits).toEqual([]);
  });

  it("ingest-sprint-history.ts uses guarded CLI invocation pattern", () => {
    const text = read("src/knowledge/ingest/ingest-sprint-history.ts");
    expect(text).toContain("require.main === module");
  });

  it("dashboard.js has zero window. references after Sprint 76 cleanup", () => {
    const text = read("src/ui/dashboard.js");
    expect(text).not.toContain("window.");
    expect(text).toContain("globalThis.");
  });

  it("sprint76-globalthis-guard.test.js uses correct instructions filename", () => {
    const text = read("tests/sprint76-globalthis-guard.test.js");
    expect(text).toContain(
      "strategic-learning-unified-theatre-master-instructions.md",
    );
    expect(text).not.toContain("require('../utils')");
    expect(text).not.toContain('require("../utils")');
    expect(text).not.toContain('"master-instructions"');
  });

  it("sprint73-boundary-confirmation.test.js asserts no transient snapshot path", () => {
    const text = read("tests/sprint73-boundary-confirmation.test.js");
    expect(text).not.toContain(
      "strategic-learning-unified-theatre-ai-snapshot-sprint73-stable",
    );
    // Must not resolve activeSnapshotPointer as a file existence check
    expect(text).not.toContain("existsSync(activeSnapshotPath)");
  });

  it("master instructions contains Sprint 77 Complete", () => {
    const text = read(
      "strategic-learning-unified-theatre-master-instructions.md",
    );
    expect(text).toContain("Sprint 77 Complete");
  });

  it("timeline contains Sprint 77 Complete marker", () => {
    const text = read("master_timeline_sprints_1_54.md");
    expect(text).toContain("| 77");
    expect(text).toContain("Complete");
  });
});
