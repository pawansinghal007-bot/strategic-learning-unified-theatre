import fs from "node:fs/promises";
import path from "node:path";
import { vi } from "vitest";

const testDir = "/home/pawan/vscodeagent/Solution/tests/fixtures/storage";
const testSnapshotFile = path.join(testDir, "storage-snapshot.json");

let getStorageMonitorStatus;

describe("storageStatus", () => {
  describe("getStorageMonitorStatus", () => {
    beforeEach(async () => {
      await fs.mkdir(testDir, { recursive: true });
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));
      // Reset modules to ensure mocks are applied
      vi.resetModules();
      // Set env var before importing the module
      vi.stubEnv("ROTATOR_STATE_DIR", testDir);
      const mod = await import("../../src/storage/storageStatus.js");
      getStorageMonitorStatus = mod.getStorageMonitorStatus;
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true });
      } catch (e) {
        // ignore if already removed
      }
      vi.useRealTimers();
      vi.resetAllMocks();
      delete process.env.ROTATOR_STATE_DIR;
    });

    it("returns ERROR when snapshot path exists but is not a file", async () => {
      const snapshotDir = path.join(testDir, ".vscode-rotator");
      await fs.mkdir(snapshotDir, { recursive: true });
      const notAFile = path.join(snapshotDir, "storage-snapshot.json");
      await fs.mkdir(notAFile, { recursive: true });

      const result = await getStorageMonitorStatus({
        storageSnapshotMaxAgeMinutes: 30,
      });

      expect(result.status).toBe("ERROR");
      expect(result.reason).toContain("not a file");
    });

    it("returns DEGRADED when snapshot file is missing", async () => {
      const result = await getStorageMonitorStatus({
        storageSnapshotMaxAgeMinutes: 30,
      });

      expect(result.status).toBe("DEGRADED");
      expect(result.lastSnapshotAt).toBeNull();
      expect(result.reason).toContain("missing");
    });

    it("returns OK when snapshot file exists and is recent", async () => {
      const snapshotDir = path.join(testDir, ".vscode-rotator");
      await fs.mkdir(snapshotDir, { recursive: true });
      const snapshotFile = path.join(snapshotDir, "storage-snapshot.json");
      await fs.writeFile(snapshotFile, "{}");
      // Set mtime to now (1 minute ago to ensure it's recent)
      const now = new Date();
      await fs.utimes(snapshotFile, now, now);

      const result = await getStorageMonitorStatus({
        storageSnapshotMaxAgeMinutes: 30,
      });

      expect(result.status).toBe("OK");
      expect(result.lastSnapshotAt).not.toBeNull();
      expect(result.reason).toBeNull();
    });

    it("returns DEGRADED when snapshot is too old", async () => {
      const snapshotDir = path.join(testDir, ".vscode-rotator");
      await fs.mkdir(snapshotDir, { recursive: true });
      const snapshotFile = path.join(snapshotDir, "storage-snapshot.json");
      await fs.writeFile(snapshotFile, "{}");
      // Set mtime to 60 minutes ago
      const oldTime = new Date(Date.now() - 60 * 60000);
      await fs.utimes(snapshotFile, oldTime, oldTime);

      const result = await getStorageMonitorStatus({
        storageSnapshotMaxAgeMinutes: 30,
      });

      expect(result.status).toBe("DEGRADED");
      expect(result.lastSnapshotAt).not.toBeNull();
      expect(result.reason).toContain("older than 30 minutes");
    });

    it("returns ERROR for other file system errors", async () => {
      const snapshotDir = path.join(testDir, ".vscode-rotator");
      await fs.mkdir(snapshotDir, { recursive: true });
      const snapshotFile = path.join(snapshotDir, "storage-snapshot.json");
      await fs.writeFile(snapshotFile, "{}");
      // Make file unreadable
      // Note: chmod 000 doesn't work in WSL2 for owner reads, so we skip this test on WSL
      const isWSL =
        process.platform === "linux" &&
        /microsoft/i.test(require("node:os").release());
      if (isWSL) {
        console.log("Skipping chmod test on WSL2 (known limitation)");
        return;
      }
      await fs.chmod(snapshotFile, 0o000);

      const result = await getStorageMonitorStatus({
        storageSnapshotMaxAgeMinutes: 30,
      });

      expect(result.status).toBe("ERROR");
      expect(result.reason).not.toBeNull();

      // restore permissions for cleanup
      await fs.chmod(snapshotFile, 0o644);
    });
  });
});
