import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import chokidar from "chokidar";

import { loadConfig } from "./config.js";

export const INGESTIBLE_EXTENSIONS = new Set([".md", ".txt", ".pdf", ".docx", ".yaml", ".yml"]);
export const DEV_CHANGE_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".py",
  ".json",
  ".sh",
  ".ps1",
  ".cs",
  ".java",
  ".go",
  ".rs",
  ".cpp",
  ".h"
]);

const TRACKED_EXTENSIONS = new Set([...INGESTIBLE_EXTENSIONS, ...DEV_CHANGE_EXTENSIONS]);
const WINDOWS_SKIP_NAMES = new Set([
  "windows",
  "program files",
  "program files (x86)",
  "$recycle.bin",
  "pagefile.sys"
]);

function appBaseDir(baseDir) {
  return baseDir ?? path.join(process.env.HOME || os.homedir(), ".vscode-rotator");
}

function dateKey(ts) {
  return String(ts).slice(0, 10);
}

function normalizeExt(filePath) {
  return path.extname(filePath).toLowerCase();
}

function isTrackedExtension(filePath) {
  return TRACKED_EXTENSIONS.has(normalizeExt(filePath));
}

function isIngestible(filePath) {
  return INGESTIBLE_EXTENSIONS.has(normalizeExt(filePath));
}

function isWindowsSkipped(filePath) {
  if (process.platform !== "win32") return false;
  const parsed = path.parse(path.resolve(filePath));
  const rest = path.resolve(filePath).slice(parsed.root.length);
  return rest
    .split(/[\\/]+/)
    .filter(Boolean)
    .some((part) => WINDOWS_SKIP_NAMES.has(part.toLowerCase()));
}

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), {
    encoding: "utf8",
    mode: 0o600
  });
  try {
    await fs.rename(tmp, filePath);
  } catch {
    try {
      await fs.unlink(filePath);
    } catch {}
    await fs.rename(tmp, filePath);
  }
}

async function fileSize(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

function normalizeStoragePath(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (!entry.path) return null;
  const absolutePath = path.resolve(String(entry.path));
  return {
    path: absolutePath,
    label: entry.label ? String(entry.label) : path.basename(absolutePath) || absolutePath,
    recursive: entry.recursive !== false
  };
}

async function* walkFiles(root, recursive) {
  let dir;
  try {
    dir = await fs.opendir(root);
  } catch {
    return;
  }

  for await (const dirent of dir) {
    const filePath = path.join(root, dirent.name);
    if (isWindowsSkipped(filePath)) continue;
    if (dirent.isDirectory()) {
      if (recursive) yield* walkFiles(filePath, recursive);
      continue;
    }
    if (dirent.isFile()) yield filePath;
  }
}

export class StorageMonitor {
  constructor({ baseDir, config, onIngestibleChange } = {}) {
    this.baseDir = appBaseDir(baseDir);
    this.config = config ?? null;
    this.indexPath = path.join(this.baseDir, "storage-index.json");
    this.snapshotPath = path.join(this.baseDir, "storage-snapshot.json");
    this.debounceMs = 2000;
    this.pending = new Map();
    this.timer = null;
    this.watcher = null;
    this.onIngestibleChange = onIngestibleChange ?? null;
  }

  async getConfig() {
    if (this.config) return this.config;
    return loadConfig();
  }

  async getStoragePaths() {
    const config = await this.getConfig();
    return Array.isArray(config.storagePaths)
      ? config.storagePaths.map(normalizeStoragePath).filter(Boolean)
      : [];
  }

  async maxAgeDays() {
    const config = await this.getConfig();
    return typeof config.storageIndexMaxAgeDays === "number" ? config.storageIndexMaxAgeDays : 30;
  }

  shouldTrack(filePath) {
    return !isWindowsSkipped(filePath) && isTrackedExtension(filePath);
  }

  async readIndex() {
    const index = await readJson(this.indexPath, {});
    return index && typeof index === "object" && !Array.isArray(index) ? index : {};
  }

  async writeIndex(index) {
    await atomicWriteJson(this.indexPath, index);
  }

  async readSnapshot() {
    const snapshot = await readJson(this.snapshotPath, null);
    if (!snapshot || typeof snapshot !== "object" || typeof snapshot.paths !== "object") {
      return { lastScan: null, paths: {} };
    }
    return snapshot;
  }

  async writeSnapshot(snapshot) {
    await atomicWriteJson(this.snapshotPath, snapshot);
  }

  async pruneIndex(index, now = new Date()) {
    const maxAgeDays = await this.maxAgeDays();
    const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
    const pruned = {};
    for (const [key, entries] of Object.entries(index)) {
      if (!Array.isArray(entries)) continue;
      const keep = entries.filter((entry) => {
        const ts = Date.parse(entry?.ts);
        return Number.isFinite(ts) && ts >= cutoff;
      });
      if (keep.length > 0) pruned[key] = keep;
    }
    return pruned;
  }

  async appendChanges(changes) {
    const tracked = changes.filter((change) => this.shouldTrack(change.path));
    if (tracked.length === 0) return { appended: 0 };

    const index = await this.pruneIndex(await this.readIndex());
    const snapshot = await this.readSnapshot();
    const nowIso = new Date().toISOString();

    for (const change of tracked) {
      const absolutePath = path.resolve(change.path);
      const ts = change.ts ?? nowIso;
      const size = change.event === "unlink" ? 0 : change.size ?? await fileSize(absolutePath);
      const entry = {
        ts,
        path: absolutePath,
        event: change.event,
        size,
        ext: normalizeExt(absolutePath),
        label: change.label ?? "",
        ingestible: isIngestible(absolutePath)
      };

      const key = dateKey(ts);
      index[key] = index[key] ?? [];
      index[key].push(entry);

      if (change.event === "unlink") {
        delete snapshot.paths[absolutePath];
      } else {
        snapshot.paths[absolutePath] = {
          size,
          ts,
          ingestible: entry.ingestible
        };
      }
    }

    snapshot.lastScan = nowIso;
    await this.writeIndex(index);
    await this.writeSnapshot(snapshot);
    const ingestibleChanges = tracked.filter((change) => isIngestible(change.path));
    if (this.onIngestibleChange && ingestibleChanges.length > 0) {
      await this.onIngestibleChange(ingestibleChanges);
    }
    return { appended: tracked.length };
  }

  queueChange(change) {
    if (!this.shouldTrack(change.path)) return;
    const key = path.resolve(change.path);
    this.pending.set(key, { ...change, path: key, ts: new Date().toISOString() });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flushPending().catch(() => {});
    }, this.debounceMs);
  }

  async flushPending() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const changes = Array.from(this.pending.values());
    this.pending.clear();
    if (changes.length === 0) return { appended: 0 };
    return this.appendChanges(changes);
  }

  async indexAll() {
    const storagePaths = await this.getStoragePaths();
    const snapshot = {
      lastScan: new Date().toISOString(),
      paths: {}
    };
    let indexed = 0;

    for (const storagePath of storagePaths) {
      if (!(await exists(storagePath.path))) continue;
      for await (const filePath of walkFiles(storagePath.path, storagePath.recursive)) {
        if (!this.shouldTrack(filePath)) continue;
        const size = await fileSize(filePath);
        snapshot.paths[path.resolve(filePath)] = {
          size,
          ts: snapshot.lastScan,
          ingestible: isIngestible(filePath)
        };
        indexed++;
      }
    }

    await this.writeSnapshot(snapshot);
    await this.writeIndex(await this.pruneIndex(await this.readIndex()));
    return { indexed, snapshotPath: this.snapshotPath };
  }

  async recentChanges(limit = 20) {
    const index = await this.readIndex();
    return Object.values(index)
      .flat()
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, limit);
  }

  async watch() {
    const storagePaths = await this.getStoragePaths();
    const roots = storagePaths.map((entry) => entry.path);
    if (roots.length === 0) {
      throw new Error("No storagePaths configured.");
    }

    const normalizedEntries = storagePaths.map((entry) => ({
      ...entry,
      path: path.resolve(entry.path)
    }));
    const labels = new Map(normalizedEntries.map((entry) => [entry.path, entry.label]));
    const ignored = (filePath) => {
      if (isWindowsSkipped(filePath)) return true;
      const absolute = path.resolve(filePath);
      const match = normalizedEntries
        .filter((entry) => absolute === entry.path || absolute.startsWith(entry.path + path.sep))
        .sort((a, b) => b.path.length - a.path.length)[0];
      if (!match || match.recursive) return false;
      const relative = path.relative(match.path, absolute);
      return Boolean(relative && relative.includes(path.sep));
    };
    this.watcher = chokidar.watch(roots, {
      ignoreInitial: false,
      persistent: true,
      ignored,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    const labelFor = (filePath) => {
      const absolute = path.resolve(filePath);
      const match = Array.from(labels.keys())
        .filter((root) => absolute === root || absolute.startsWith(root + path.sep))
        .sort((a, b) => b.length - a.length)[0];
      return match ? labels.get(match) : "";
    };

    for (const event of ["add", "change", "unlink"]) {
      this.watcher.on(event, (filePath) => {
        this.queueChange({ event, path: filePath, label: labelFor(filePath) });
      });
    }

    return this.watcher;
  }

  async close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.flushPending();
    if (this.watcher) await this.watcher.close();
    this.watcher = null;
  }
}

export function storagePaths() {
  const base = appBaseDir();
  return {
    indexPath: path.join(base, "storage-index.json"),
    snapshotPath: path.join(base, "storage-snapshot.json")
  };
}
