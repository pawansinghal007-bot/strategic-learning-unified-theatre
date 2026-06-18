import fs from "node:fs";
import path from "node:path";

const timelinePath = path.resolve("master_timeline_sprints_1_54.md");
const instructionsPath = path.resolve(
  "strategic-learning-unified-theatre-master-instructions.md",
);
const snapshotPointerPath = path.resolve("CURRENT_ACTIVE_SNAPSHOT.md");
const sprint73GuardPath = path.resolve(
  "tests/sprint73-boundary-confirmation.test.js",
);
const storageMonitorTestPath = path.resolve(
  "tests/storage/storage-monitor.test.js",
);

describe("Sprint 75 guard test", () => {
  let timeline;
  let instructions;
  let snapshotPointer;
  let sprint73Guard;
  let storageMonitorTest;

  beforeAll(() => {
    timeline = fs.readFileSync(timelinePath, "utf8");
    instructions = fs.readFileSync(instructionsPath, "utf8");
    snapshotPointer = fs.readFileSync(snapshotPointerPath, "utf8").trim();
    sprint73Guard = fs.readFileSync(sprint73GuardPath, "utf8");
    storageMonitorTest = fs.readFileSync(storageMonitorTestPath, "utf8");
  });

  describe("Sprint 73 guard fix verification", () => {
    it("sprint73-boundary-confirmation.test.js does not contain transient sprint73-stable pin", () => {
      // The old broken guard had: toBe("strategic-learning-unified-theatre-ai-snapshot-sprint73-stable")
      // This should no longer appear in the test file.
      expect(sprint73Guard).not.toContain(
        'toBe(\n        "strategic-learning-unified-theatre-ai-snapshot-sprint73-stable"',
      );
    });

    it("sprint73-boundary-confirmation.test.js contains corrected Sprint 74 Complete assertion", () => {
      expect(sprint73Guard).toContain("## Sprint 74 Complete");
    });

    it("sprint73-boundary-confirmation.test.js contains corrected Sprint 75 Complete assertion", () => {
      expect(sprint73Guard).toContain("## Sprint 75 Complete");
    });
  });

  describe("Storage-monitor deletion test fix verification", () => {
    it("storage-monitor.test.js contains semantic deletion check", () => {
      // The fix should contain a semantic check like Object.keys(snapshot2.paths).length or similar
      expect(storageMonitorTest).toContain("Object.keys(snapshot2.paths).length");
    });
  });

  describe("Snapshot pointer verification", () => {
    it("CURRENT_ACTIVE_SNAPSHOT.md points to sprint75 or later", () => {
      // The pointer should match sprint75 or later, not be pinned to sprint73 or sprint74
      expect(snapshotPointer).toMatch(
        /^strategic-learning-unified-theatre-ai-snapshot-sprint7[5-9]/,
      );
    });
  });

  describe("Timeline verification", () => {
    it("timeline contains Sprint 75 Complete row", () => {
      expect(timeline).toContain("| 75");
      expect(timeline).toContain("Sprint 75");
      expect(timeline).toContain("Complete");
    });
  });

  describe("Master instructions verification", () => {
    it("master-instructions contains Sprint 75 Complete block", () => {
      expect(instructions).toContain("## Sprint 75 Complete");
    });

    it("master-instructions contains Sprint 76 Planned block", () => {
      expect(instructions).toContain("## Sprint 76 Planned");
    });
  });
});
