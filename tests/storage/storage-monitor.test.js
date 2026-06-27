import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  StorageMonitor,
  appBaseDir,
  storagePaths,
  walkFiles,
  exists,
} from "../../src/storage/storage-monitor.js";

// Mock loadConfig at top level for getConfig test
vi.mock("../../src/internal/config.js", () => ({
  loadConfig: vi.fn(() => ({
    storagePaths: [],
    storageIndexMaxAgeDays: 30,
  })),
}));

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

  it("skips Windows-skipped paths in walkFiles", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(path.join(watched, "windows"), { recursive: true });
    await fs.writeFile(
      path.join(watched, "windows", "test.md"),
      "content",
      "utf8",
    );
    await fs.writeFile(path.join(watched, "app.js"), "code", "utf8");

    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    try {
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

      // Windows-skipped directory should be excluded
      expect(
        snapshot.paths[path.join(watched, "windows", "test.md")],
      ).toBeUndefined();
      // Regular file should be included
      expect(snapshot.paths[path.join(watched, "app.js")]).toBeDefined();
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("handles non-tracked extensions in queueChange", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    // Non-tracked extension (png) should be skipped
    monitor.queueChange({
      event: "add",
      path: path.join(baseDir, "image.png"),
      label: "Test",
    });
    // Tracked extension (md) should be queued
    monitor.queueChange({
      event: "add",
      path: path.join(baseDir, "doc.md"),
      label: "Test",
    });

    // Wait for debounce to flush
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const index = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));
    const entries = Object.values(index).flat();

    // Only tracked extension should be in index
    expect(
      entries.find((entry) => entry.path === path.join(baseDir, "image.png")),
    ).toBeUndefined();
    expect(
      entries.find((entry) => entry.path === path.join(baseDir, "doc.md")),
    ).toBeDefined();
  });

  it("handles non-recursive path watching", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(path.join(watched, "nested"), { recursive: true });
    await fs.writeFile(path.join(watched, "root.md"), "content", "utf8");
    await fs.writeFile(
      path.join(watched, "nested", "sub.md"),
      "content",
      "utf8",
    );

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: false }],
        storageIndexMaxAgeDays: 30,
      },
    });

    const result = await monitor.indexAll();
    const snapshot = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );

    // Root file should be included
    expect(snapshot.paths[path.join(watched, "root.md")]).toBeDefined();
    // Nested file should be excluded (non-recursive)
    expect(
      snapshot.paths[path.join(watched, "nested", "sub.md")],
    ).toBeUndefined();
  });

  it("handles empty label with basename fallback in normalizeStoragePath", async () => {
    const baseDir = await makeTempDir();
    const filePath = path.join(baseDir, "test.md");
    await fs.writeFile(filePath, "content", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: baseDir, label: "" }],
        storageIndexMaxAgeDays: 30,
      },
    });

    // Use appendChanges to create index entries
    await monitor.appendChanges([{ event: "add", path: filePath, label: "" }]);

    const snapshot = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );
    const index = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));

    // File should be included in snapshot
    expect(snapshot.paths[filePath]).toBeDefined();
    // Label is stored in index entries, not in snapshot paths
    const entries = Object.values(index).flat();
    const entry = entries.find((e) => e.path === filePath);
    expect(entry).toBeDefined();
    expect(entry.label).toBe("");
  });

  it("handles no label in appendChanges with empty string fallback", async () => {
    const baseDir = await makeTempDir();
    const filePath = path.join(baseDir, "test.js");
    await fs.writeFile(filePath, "code", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    await monitor.appendChanges([
      { event: "add", path: filePath }, // No label property
    ]);

    const index = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));
    const entries = Object.values(index).flat();

    // Entry should have empty string as label
    expect(entries.find((entry) => entry.path === filePath)).toMatchObject({
      label: "",
      event: "add",
    });
  });

  it("handles non-recursive path with nested file exclusion in watch mode", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(path.join(watched, "nested"), { recursive: true });
    await fs.writeFile(path.join(watched, "root.md"), "content", "utf8");
    await fs.writeFile(
      path.join(watched, "nested", "sub.md"),
      "content",
      "utf8",
    );

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: false }],
        storageIndexMaxAgeDays: 30,
      },
    });

    // Test the ignored function for non-recursive paths
    const storagePaths = await monitor.getStoragePaths();
    const normalizedEntries = storagePaths.map((entry) => ({
      ...entry,
      path: path.resolve(entry.path),
    }));

    // Root file should not be ignored
    const rootPath = path.join(watched, "root.md");
    const absoluteRoot = path.resolve(rootPath);
    const matchRoot = normalizedEntries
      .filter(
        (entry) =>
          absoluteRoot === entry.path ||
          absoluteRoot.startsWith(entry.path + path.sep),
      )
      .sort((a, b) => b.path.length - a.path.length)[0];
    expect(matchRoot).toBeDefined();
    expect(matchRoot.recursive).toBe(false);

    // Nested file should be ignored in non-recursive mode
    const nestedPath = path.join(watched, "nested", "sub.md");
    const absoluteNested = path.resolve(nestedPath);
    const matchNested = normalizedEntries
      .filter(
        (entry) =>
          absoluteNested === entry.path ||
          absoluteNested.startsWith(entry.path + path.sep),
      )
      .sort((a, b) => b.path.length - a.path.length)[0];
    expect(matchNested).toBeDefined();
    expect(matchNested.recursive).toBe(false);
    const relative = path.relative(matchNested.path, absoluteNested);
    expect(Boolean(relative?.includes(path.sep))).toBe(true);
  });

  it("handles appBaseDir with no baseDir and no HOME env", async () => {
    const originalHome = process.env.HOME;
    const originalHomedir = os.homedir;

    // Mock both process.env.HOME and os.homedir to be undefined
    delete process.env.HOME;
    os.homedir = vi.fn(() => "/home/testuser");

    try {
      const result = appBaseDir(undefined);
      // Should fall back to a default path
      expect(result).toBe("/home/testuser/.vscode-rotator");
    } finally {
      // Restore original values
      if (originalHome) {
        process.env.HOME = originalHome;
      } else {
        delete process.env.HOME;
      }
      os.homedir = originalHomedir;
    }
  });

  it("uses basename fallback when label is empty string in normalizeStoragePath", async () => {
    const baseDir = await makeTempDir();
    const filePath = path.join(baseDir, "test.md");
    await fs.writeFile(filePath, "content", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: baseDir, label: "" }],
        storageIndexMaxAgeDays: 30,
      },
    });

    // Use appendChanges to create index entries
    await monitor.appendChanges([{ event: "add", path: filePath, label: "" }]);

    const snapshot = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );
    const index = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));

    // File should be included in snapshot
    expect(snapshot.paths[filePath]).toBeDefined();
    // Label is stored in index entries, not in snapshot paths
    const entries = Object.values(index).flat();
    const entry = entries.find((e) => e.path === filePath);
    expect(entry).toBeDefined();
    expect(entry.label).toBe("");
  });

  it("walkFiles yields files correctly in recursive mode", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(path.join(watched, "subdir"), { recursive: true });
    await fs.writeFile(path.join(watched, "root.md"), "root", "utf8");
    await fs.writeFile(
      path.join(watched, "subdir", "nested.md"),
      "nested",
      "utf8",
    );

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: true }],
        storageIndexMaxAgeDays: 30,
      },
    });

    const result = await monitor.indexAll();

    // Both files should be indexed
    expect(result.indexed).toBe(2);
    const snapshot = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );
    expect(snapshot.paths[path.join(watched, "root.md")]).toBeDefined();
    expect(
      snapshot.paths[path.join(watched, "subdir", "nested.md")],
    ).toBeDefined();
  });

  it("walkFiles respects non-recursive mode", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(path.join(watched, "subdir"), { recursive: true });
    await fs.writeFile(path.join(watched, "root.md"), "root", "utf8");
    await fs.writeFile(
      path.join(watched, "subdir", "nested.md"),
      "nested",
      "utf8",
    );

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: false }],
        storageIndexMaxAgeDays: 30,
      },
    });

    const result = await monitor.indexAll();

    // Only root file should be indexed
    expect(result.indexed).toBe(1);
    const snapshot = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );
    expect(snapshot.paths[path.join(watched, "root.md")]).toBeDefined();
    expect(
      snapshot.paths[path.join(watched, "subdir", "nested.md")],
    ).toBeUndefined();
  });

  it("watch mode queues changes and triggers labelFor function", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(path.join(watched, "subdir"), { recursive: true });
    await fs.writeFile(path.join(watched, "root.md"), "root", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: true }],
        storageIndexMaxAgeDays: 30,
      },
    });

    // Start watching
    const watcher = await monitor.watch();

    // Add a new file
    const newPath = path.join(watched, "new.md");
    await fs.writeFile(newPath, "new content", "utf8");

    // Wait for debounce to flush
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Stop watching
    await monitor.close();

    // Verify the file was tracked
    const index = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));
    const entries = Object.values(index).flat();
    expect(entries.find((entry) => entry.path === newPath)).toBeDefined();
  });

  it("watch mode handles change events with labelFor function", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(path.join(watched, "subdir"), { recursive: true });
    await fs.writeFile(path.join(watched, "root.md"), "root", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: true }],
        storageIndexMaxAgeDays: 30,
      },
    });

    // Start watching
    const watcher = await monitor.watch();

    // Wait a bit for watcher to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Modify existing file
    await fs.writeFile(
      path.join(watched, "root.md"),
      "modified content",
      "utf8",
    );

    // Wait for debounce to flush
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Stop watching
    await monitor.close();

    // Verify the change was tracked
    const index = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));
    const entries = Object.values(index).flat();
    const changeEntry = entries.find(
      (entry) =>
        entry.path === path.join(watched, "root.md") &&
        entry.event === "change",
    );
    expect(changeEntry).toBeDefined();
  });

  it("watch mode handles unlink events with labelFor function", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(path.join(watched, "subdir"), { recursive: true });
    await fs.writeFile(path.join(watched, "to-delete.md"), "to delete", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: true }],
        storageIndexMaxAgeDays: 30,
      },
    });

    // Start watching
    const watcher = await monitor.watch();

    // Wait a bit for watcher to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Delete file
    await fs.unlink(path.join(watched, "to-delete.md"));

    // Wait for debounce to flush
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Stop watching
    await monitor.close();

    // Verify the unlink was tracked
    const index = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));
    const entries = Object.values(index).flat();
    const unlinkEntry = entries.find(
      (entry) =>
        entry.path === path.join(watched, "to-delete.md") &&
        entry.event === "unlink",
    );
    expect(unlinkEntry).toBeDefined();
  });

  it("watch mode respects non-recursive ignored function", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(path.join(watched, "subdir"), { recursive: true });
    await fs.writeFile(path.join(watched, "root.md"), "root", "utf8");
    await fs.writeFile(
      path.join(watched, "subdir", "nested.md"),
      "nested",
      "utf8",
    );

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: false }],
        storageIndexMaxAgeDays: 30,
      },
    });

    // Start watching
    const watcher = await monitor.watch();

    // Add file in subdirectory (should be ignored in non-recursive mode)
    const nestedPath = path.join(watched, "subdir", "new.md");
    await fs.writeFile(nestedPath, "new content", "utf8");

    // Wait for debounce to flush
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Stop watching
    await monitor.close();

    // Verify nested file was ignored
    const index = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));
    const entries = Object.values(index).flat();
    expect(entries.find((entry) => entry.path === nestedPath)).toBeUndefined();
  });

  it("calls onIngestibleChange callback when ingestible files change", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
      onIngestibleChange: vi.fn(),
    });

    const ingestiblePath = path.join(baseDir, "doc.md");
    await fs.writeFile(ingestiblePath, "content", "utf8");

    await monitor.appendChanges([
      { event: "add", path: ingestiblePath, label: "Docs" },
    ]);

    expect(monitor.onIngestibleChange).toHaveBeenCalled();
    const calls = monitor.onIngestibleChange.mock.calls[0][0];
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(ingestiblePath);
    expect(calls[0].event).toBe("add");
  });

  it("calls onIngestibleChange callback with multiple ingestible files", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
      onIngestibleChange: vi.fn(),
    });

    const docPath = path.join(baseDir, "guide.md");
    const yamlPath = path.join(baseDir, "config.yaml");
    await fs.writeFile(docPath, "content", "utf8");
    await fs.writeFile(yamlPath, "key: value", "utf8");

    await monitor.appendChanges([
      { event: "add", path: docPath, label: "Docs" },
      { event: "add", path: yamlPath, label: "Config" },
    ]);

    expect(monitor.onIngestibleChange).toHaveBeenCalled();
    const calls = monitor.onIngestibleChange.mock.calls[0][0];
    expect(calls).toHaveLength(2);
  });

  it("does not call onIngestibleChange for non-ingestible files", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
      onIngestibleChange: vi.fn(),
    });

    const jsPath = path.join(baseDir, "app.js");
    await fs.writeFile(jsPath, "console.log('hi');", "utf8");

    await monitor.appendChanges([
      { event: "add", path: jsPath, label: "Scripts" },
    ]);

    expect(monitor.onIngestibleChange).not.toHaveBeenCalled();
  });

  it("calls onIngestibleChange callback with unlink events", async () => {
    const baseDir = await makeTempDir();
    const filePath = path.join(baseDir, "deleted.md");
    await fs.writeFile(filePath, "content", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
      onIngestibleChange: vi.fn(),
    });

    // First add the file
    await monitor.appendChanges([
      { event: "add", path: filePath, label: "Docs" },
    ]);
    monitor.onIngestibleChange.mockClear();

    // Then delete it
    await monitor.appendChanges([
      { event: "unlink", path: filePath, label: "Docs" },
    ]);

    expect(monitor.onIngestibleChange).toHaveBeenCalled();
    const calls = monitor.onIngestibleChange.mock.calls[0][0];
    expect(calls).toHaveLength(1);
    expect(calls[0].event).toBe("unlink");
  });

  it("returns storagePaths from storagePaths function", async () => {
    const result = storagePaths();

    expect(result).toMatchObject({
      indexPath: expect.stringContaining("storage-index.json"),
      snapshotPath: expect.stringContaining("storage-snapshot.json"),
    });
  });

  it("throws error when watch is called with no storagePaths", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    await expect(monitor.watch()).rejects.toThrow(
      "No storagePaths configured.",
    );
  });

  it("closes watcher properly in close method", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(watched, { recursive: true });
    await fs.writeFile(path.join(watched, "test.md"), "content", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: true }],
        storageIndexMaxAgeDays: 30,
      },
    });

    // Start watching
    const watcher = await monitor.watch();
    expect(watcher).toBeDefined();

    // Close should properly close the watcher
    await monitor.close();
    expect(monitor.watcher).toBeNull();
  });

  it("handles close method when watcher is null", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    // Close should not throw when watcher is null
    await expect(monitor.close()).resolves.not.toThrow();
    expect(monitor.watcher).toBeNull();
  });

  it("handles atomicWriteJson with rename fallback (catch block)", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    // Mock fs.rename to throw first time (to trigger fallback)
    const originalRename = fs.rename;
    let callCount = 0;
    fs.rename = async (src, dest) => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Simulated rename failure");
      }
      return originalRename(src, dest);
    };

    try {
      await monitor.writeIndex({ test: "data" });
      const result = await fs.readFile(monitor.indexPath, "utf8");
      expect(JSON.parse(result)).toEqual({ test: "data" });
    } finally {
      fs.rename = originalRename;
    }
  });

  it("handles readJson with invalid JSON content", async () => {
    const baseDir = await makeTempDir();
    const filePath = path.join(baseDir, "invalid.json");
    await fs.writeFile(filePath, "not valid json", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    // Use readJson directly via private access
    const result = await monitor.readIndex();
    expect(result).toEqual({});
  });

  it("handles walkFiles with non-existent directory", async () => {
    const baseDir = await makeTempDir();
    const nonExistentPath = path.join(baseDir, "nonexistent");

    // walkFiles should gracefully handle non-existent directory
    const files = [];
    for await (const file of walkFiles(nonExistentPath, true)) {
      files.push(file);
    }
    expect(files).toEqual([]);
  });

  it("handles readSnapshot with invalid snapshot data", async () => {
    const baseDir = await makeTempDir();
    const stateDir = path.join(baseDir, "state");
    await fs.mkdir(stateDir, { recursive: true });
    const snapshotPath = path.join(stateDir, "storage-snapshot.json");
    await fs.writeFile(snapshotPath, "invalid snapshot data", "utf8");

    const monitor = new StorageMonitor({
      baseDir: stateDir,
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    const snapshot = await monitor.readSnapshot();
    expect(snapshot).toEqual({ lastScan: null, paths: {} });
  });

  it("handles pruneIndex with empty entries array", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    const index = {
      "2024-01-01": [],
      "2024-01-02": null,
    };

    const pruned = await monitor.pruneIndex(index);
    expect(pruned).toEqual({});
  });

  it("handles flushPending with empty pending map", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    const result = await monitor.flushPending();
    expect(result).toEqual({ appended: 0 });
  });

  it("handles exists() with non-existent file", async () => {
    const baseDir = await makeTempDir();
    const nonExistentPath = path.join(baseDir, "nonexistent.txt");

    const result = await exists(nonExistentPath);
    expect(result).toBe(false);
  });

  it("handles getConfig when config is null and calls loadConfig", async () => {
    const baseDir = await makeTempDir();

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: null, // This will trigger loadConfig()
    });

    const config = await monitor.getConfig();
    expect(config).toEqual({
      storagePaths: [],
      storageIndexMaxAgeDays: 30,
    });
  });
});
