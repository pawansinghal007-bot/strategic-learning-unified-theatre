import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const STORAGE_SNAPSHOT_FILE = path.join(
  process.env.ROTATOR_STATE_DIR || process.cwd(),
  ".vscode-rotator",
  "storage-snapshot.json",
);

function normalizeMaxAgeMinutes(value) {
  const configured = Number(value);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return 30;
}

export async function getStorageMonitorStatus(config = {}) {
  const snapshotFile = STORAGE_SNAPSHOT_FILE;
  const maxAgeMinutes = normalizeMaxAgeMinutes(
    config.storageSnapshotMaxAgeMinutes,
  );

  try {
    const stat = await fs.stat(snapshotFile);
    if (!stat.isFile()) {
      return {
        status: "ERROR",
        lastSnapshotAt: null,
        snapshotFile,
        reason: `Snapshot path exists but is not a file: ${snapshotFile}`,
      };
    }

    const lastSnapshotAt = stat.mtime.toISOString();
    const ageMs = Date.now() - stat.mtime.getTime();
    const ageMinutes = ageMs / 60000;

    if (ageMinutes <= maxAgeMinutes) {
      return {
        status: "OK",
        lastSnapshotAt,
        snapshotFile,
        reason: null,
      };
    }

    return {
      status: "DEGRADED",
      lastSnapshotAt,
      snapshotFile,
      reason: `Snapshot is older than ${maxAgeMinutes} minutes.`,
    };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return {
        status: "DEGRADED",
        lastSnapshotAt: null,
        snapshotFile,
        reason: `Snapshot file missing: ${snapshotFile}`,
      };
    }

    return {
      status: "ERROR",
      lastSnapshotAt: null,
      snapshotFile,
      reason: String(err?.message ?? err),
    };
  }
}
