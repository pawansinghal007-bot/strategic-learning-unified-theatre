import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("chokidar", () => {
  const watch = vi.fn();
  return { default: { watch }, watch };
});

import chokidar from "chokidar";
import { StorageMonitor } from "../../src/storage/storage-monitor.js";

async function makeTempDir(prefix = "storage-monitor-cov2-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("normalizeStoragePath label fallback (line 127)", () => {
  it("falls back to the absolute path itself when basename is empty and no label is given", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        // path.basename("/") === "" — no separators left to derive a name
        // from, and no explicit label, so the `|| absolutePath` fallback
        // on line 127 must be used.
        storagePaths: [{ path: "/" }],
        storageIndexMaxAgeDays: 30,
      },
    });

    const paths = await monitor.getStoragePaths();
    expect(paths).toHaveLength(1);
    expect(paths[0].label).toBe(paths[0].path);
    expect(paths[0].path).toBe("/");
  });
});

describe("walkFiles skips entries that are neither files nor directories (line 147)", () => {
  it("does not index a symlink (lstat-based dirent is neither isFile() nor isDirectory())", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    await fs.mkdir(watched, { recursive: true });
    await fs.writeFile(path.join(watched, "real.md"), "# real", "utf8");
    // Point the symlink at a target that doesn't exist — opendir's Dirent
    // reflects lstat info, so isFile()/isDirectory() are both false for a
    // symlink regardless of whether its target exists.
    await fs.symlink(
      path.join(watched, "missing-target.md"),
      path.join(watched, "dangling-link.md"),
    );

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: true }],
        storageIndexMaxAgeDays: 30,
      },
    });

    const result = await monitor.indexAll();
    // Only real.md should be indexed; the symlink is silently skipped.
    expect(result.indexed).toBe(1);

    const snapshot = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );
    expect(snapshot.paths[path.join(watched, "real.md")]).toBeDefined();
    expect(
      snapshot.paths[path.join(watched, "dangling-link.md")],
    ).toBeUndefined();
  });
});

describe("isWindowsSkipped via shouldTrack() on win32 (lines 67-72)", () => {
  let originalPlatform;

  beforeEach(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("skips files under a reserved Windows directory segment", () => {
    const monitor = new StorageMonitor({
      baseDir: "C:\\fake\\state",
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    expect(
      monitor.shouldTrack("C:\\Windows\\System32\\drivers\\notes.md"),
    ).toBe(false);
    expect(monitor.shouldTrack("C:\\Program Files\\App\\config.json")).toBe(
      false,
    );
    expect(monitor.shouldTrack("C:\\$Recycle.Bin\\old.txt")).toBe(false);
  });

  it("still tracks ordinary files with a tracked extension on win32", () => {
    const monitor = new StorageMonitor({
      baseDir: "C:\\fake\\state",
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    expect(monitor.shouldTrack("C:\\Users\\dev\\project\\readme.md")).toBe(
      true,
    );
  });
});

describe("atomicWriteJson rename retry (lines 103-106)", () => {
  it("unlinks the destination and retries rename when the first rename fails", async () => {
    const baseDir = await makeTempDir();
    const monitor = new StorageMonitor({
      baseDir,
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });

    // Seed an existing index file so there's something to unlink/replace.
    await monitor.writeIndex({
      "2024-01-01": [{ ts: "2024-01-01T00:00:00Z", path: "a.md" }],
    });

    const originalRename = fs.rename;
    let callCount = 0;
    const renameSpy = vi
      .spyOn(fs, "rename")
      .mockImplementation(async (...args) => {
        callCount += 1;
        if (callCount === 1) {
          const err = new Error("simulated EXDEV/EPERM on first rename");
          err.code = "EPERM";
          throw err;
        }
        return originalRename(...args);
      });

    try {
      await monitor.writeIndex({
        "2024-02-01": [{ ts: "2024-02-01T00:00:00Z", path: "b.md" }],
      });
    } finally {
      renameSpy.mockRestore();
    }

    expect(callCount).toBeGreaterThanOrEqual(2);
    const written = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));
    expect(written).toHaveProperty("2024-02-01");
    expect(written).not.toHaveProperty("2024-01-01");
  });
});

describe("walkFiles opendir failure (line 137)", () => {
  it("gracefully yields nothing when the 'directory' is actually a file", async () => {
    const baseDir = await makeTempDir();
    const notADir = path.join(baseDir, "looks-like-a-dir");
    await fs.writeFile(notADir, "i am a file, not a directory", "utf8");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: notADir, label: "Broken", recursive: true }],
        storageIndexMaxAgeDays: 30,
      },
    });

    // exists() succeeds (stat works on a file), but opendir() on a file
    // throws ENOTDIR, which walkFiles must swallow and simply stop yielding.
    const result = await monitor.indexAll();
    expect(result.indexed).toBe(0);

    const snapshot = JSON.parse(
      await fs.readFile(monitor.snapshotPath, "utf8"),
    );
    expect(Object.keys(snapshot.paths)).toHaveLength(0);
  });
});

describe("debounce timer firing flushPending() (line 291)", () => {
  it("automatically flushes the queued change once the debounce timer elapses", async () => {
    const baseDir = await makeTempDir();
    const trackedFile = path.join(baseDir, "auto-flush.md");

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: { storagePaths: [], storageIndexMaxAgeDays: 30 },
    });
    // Shrink the debounce window so the test doesn't need to wait 2s, and
    // use real timers throughout — mixing fake timers with real fs I/O
    // completion callbacks is unreliable across the libuv/microtask boundary.
    monitor.debounceMs = 20;

    monitor.queueChange({ event: "add", path: trackedFile, label: "Auto" });
    expect(monitor.pending.size).toBe(1);

    // Real wall-clock wait, comfortably past the (shrunk) debounce window,
    // so the setTimeout callback (line 291) actually fires and its
    // flushPending().catch(() => {}) call completes.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(monitor.pending.size).toBe(0);

    const index = JSON.parse(await fs.readFile(monitor.indexPath, "utf8"));
    const entries = Object.values(index).flat();
    expect(entries.some((e) => e.path === trackedFile)).toBe(true);
  });
});

describe("watch() ignored()/labelFor() sort comparators with overlapping roots (lines 366, 387)", () => {
  let capturedOptions;
  let handlers;
  let fakeWatcher;

  beforeEach(() => {
    capturedOptions = undefined;
    handlers = {};
    fakeWatcher = {
      on: vi.fn((event, cb) => {
        handlers[event] = cb;
        return fakeWatcher;
      }),
      close: vi.fn(async () => {}),
    };
    chokidar.watch.mockReset();
    chokidar.watch.mockImplementation((roots, options) => {
      capturedOptions = options;
      return fakeWatcher;
    });
  });

  it("picks the most specific (longest) matching root for both ignored() and labelFor()", async () => {
    const baseDir = await makeTempDir();
    const parent = path.join(baseDir, "parent");
    const child = path.join(parent, "child");
    await fs.mkdir(child, { recursive: true });

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [
          { path: parent, label: "Parent", recursive: true },
          { path: child, label: "Child", recursive: false },
        ],
        storageIndexMaxAgeDays: 30,
      },
    });

    await monitor.watch();
    expect(capturedOptions).toBeDefined();
    expect(typeof capturedOptions.ignored).toBe("function");

    const nestedFile = path.join(child, "deep.md");

    // ignored(): both "parent" and "child" entries match (child starts with
    // parent + sep), forcing the .sort() comparator (line 366) to run and
    // pick "child" (the longer/more specific path) since it's non-recursive.
    const isIgnored = capturedOptions.ignored(nestedFile);
    // child is non-recursive and nestedFile is directly inside it (no
    // further subdirectory), so relative has no path separator -> not ignored.
    expect(isIgnored).toBe(false);

    const deeperFile = path.join(child, "nested-dir", "deep.md");
    expect(capturedOptions.ignored(deeperFile)).toBe(true);

    // labelFor(): triggered synchronously inside the registered "add"
    // handler. Two label-map keys overlap the same way, forcing the
    // second .sort() comparator (line 387) to run and pick "Child".
    expect(typeof handlers.add).toBe("function");
    handlers.add(nestedFile);

    expect(monitor.pending.size).toBe(1);
    const queued = Array.from(monitor.pending.values())[0];
    expect(queued.label).toBe("Child");

    await monitor.close();
  });

  it("ignored() short-circuits to true on win32 reserved paths (line 358)", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    try {
      const baseDir = await makeTempDir();
      const watched = path.join(baseDir, "project");
      await fs.mkdir(watched, { recursive: true });

      const monitor = new StorageMonitor({
        baseDir: path.join(baseDir, "state"),
        config: {
          storagePaths: [{ path: watched, label: "Project", recursive: true }],
          storageIndexMaxAgeDays: 30,
        },
      });

      await monitor.watch();
      expect(typeof capturedOptions.ignored).toBe("function");

      // Reserved Windows segment -> isWindowsSkipped() short-circuits
      // ignored() to true before any root-matching logic runs.
      const winPath = path.join(watched, "Program Files", "app.md");
      expect(capturedOptions.ignored(winPath)).toBe(true);

      await monitor.close();
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("labelFor() returns an empty string when no configured root matches (line 388)", async () => {
    const baseDir = await makeTempDir();
    const watched = path.join(baseDir, "project");
    const elsewhere = path.join(baseDir, "elsewhere");
    await fs.mkdir(watched, { recursive: true });
    await fs.mkdir(elsewhere, { recursive: true });

    const monitor = new StorageMonitor({
      baseDir: path.join(baseDir, "state"),
      config: {
        storagePaths: [{ path: watched, label: "Project", recursive: true }],
        storageIndexMaxAgeDays: 30,
      },
    });

    await monitor.watch();
    expect(typeof handlers.add).toBe("function");

    // A file outside every configured storage root -> no match -> labelFor
    // falls back to "" instead of throwing on a null/undefined lookup.
    const outsideFile = path.join(elsewhere, "unrelated.md");
    handlers.add(outsideFile);

    expect(monitor.pending.size).toBe(1);
    const queued = Array.from(monitor.pending.values())[0];
    expect(queued.label).toBe("");

    await monitor.close();
  });
});
