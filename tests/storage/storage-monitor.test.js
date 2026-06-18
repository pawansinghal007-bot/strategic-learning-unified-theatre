import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { StorageMonitor } from "../../src/storage/storage-monitor.js";

async function makeTempDir(prefix = "storage-monitor-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("StorageMonitor", () => {
  it("indexes tracked files into the Sprint 5 snapshot schema", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(path.join(watched, "nested"), { recursive: true });
    await fs.writeFile(path.join(watched, "README.md"), "# Docs", "utf8");
    await fs.writeFile(
      path.join(watched, "app.js"),
      "console.log('hi');",
      "utf8",
    );
    await fs.writeFile(
      path.join(watched, "nested", "notes.txt"),
      "notes",
      "utf8",
    );
    await fs.writeFile(path.join(watched, "image.png"), "ignored", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: true }],
        storageIndexMaxAgeDays: 30,
      },
    });

    const result = await monitor.indexAll();
    const snapshot = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );

    expect(result.indexed).toBe(3);
    expect(snapshot.lastScan).toBeDefined();
    expect(snapshot.paths[path.join(watched, "README.md")]).toMatchObject({
      ingestible: true,
    });
    expect(snapshot.paths[path.join(watched, "app.js")]).toMatchObject({
      ingestible: false,
    });
    expect(
      snapshot.paths[path.join(watched, "nested", "notes.txt")],
    ).toMatchObject({
      ingestible: true,
    });
    expect(snapshot.paths[path.join(watched, "image.png")]).toBeUndefined();
  });

  it("appends date-keyed index entries and updates snapshot paths", async () => {
    const baseDir = await makeTempDir();
    const docPath = path.join(baseDir, "guide.md");
    const scriptPath = path.join(baseDir, "task.ps1");
    await fs.writeFile(docPath, "# Guide", "utf8");
    await fs.writeFile(scriptPath, "Write-Host ok", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    const result = await monitor.appendChanges([
      { event: "add", path: docPath, label: "Docs" },
      { event: "change", path: scriptPath, label: "Scripts" },
      { event: "add", path: path.join(baseDir, "photo.jpg"), label: "Ignored" },
    ]);

    const index = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));
    const entries = Object.values(index).flat();
    const snapshot = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );

    expect(result.appended).toBe(2);
    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.path === docPath)).toMatchObject({
      event: "add",
      ext: ".md",
      label: "Docs",
      ingestible: true,
    });
    expect(entries.find((entry) => entry.path === scriptPath)).toMatchObject({
      ext: ".ps1",
      ingestible: false,
    });
    expect(snapshot.paths[docPath].ingestible).toBe(true);
    expect(snapshot.paths[scriptPath].ingestible).toBe(false);
  });

  it("removes deleted files from the snapshot", async () => {
    const baseDir = await makeTempDir();
    const filePath = path.join(baseDir, "deleted.yaml");
    await fs.writeFile(filePath, "ok: true", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    // Write file, take initial snapshot, confirm file is present
    await monitor.appendChanges([
      { event: "add", path: filePath, label: "Config" },
    ]);
    const snapshot1 = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );
    expect(snapshot1.paths[filePath]).toBeDefined();

    // Delete the file from disk
    await fs.unlink(filePath);

    // Take a NEW snapshot
    await monitor.appendChanges([
      { event: "unlink", path: filePath, label: "Config" },
    ]);
    const snapshot2 = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );

    // Confirm the file is ABSENT from the new snapshot's file list
    // Semantic check: verify file is not present in snapshot paths
    expect(snapshot2.paths[filePath]).toBeUndefined();
    // Verify snapshot paths object is empty after deletion
    expect(Object.keys(snapshot2.paths).length).toBe(0);
  });

  it("prunes index entries older than the configured max age", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    const oldTs = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const freshTs = new Date().toISOString();
    const pruned = await monitor.pruneIndex({
      [oldTs.slice(0, 10)]: [{ ts: oldTs, path: "old.md" }],
      [freshTs.slice(0, 10)]: [{ ts: freshTs, path: "fresh.md" }],
    });

    expect(Object.values(pruned).flat()).toEqual([
      { ts: freshTs, path: "fresh.md" },
    ]);
  });
});
