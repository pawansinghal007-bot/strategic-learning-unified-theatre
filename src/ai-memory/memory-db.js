import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "memory.sql");
const originalHomeDir = os.homedir();

function homeDir() {
  return process.env.HOME || os.homedir();
}

function defaultBaseDir(baseDir) {
  if (baseDir) return path.resolve(baseDir);
  if (process.env.VITEST && (!process.env.HOME || process.env.HOME === originalHomeDir)) {
    return path.join(os.tmpdir(), `vscode-rotator-test-${process.pid}`);
  }
  return path.join(homeDir(), ".vscode-rotator");
}

export class MemoryDb {
  constructor({ baseDir, dbPath } = {}) {
    this.baseDir = defaultBaseDir(baseDir);

    this.dbPath =
      dbPath ||
      process.env.DB_PATH ||
      path.join(this.baseDir, "ai-memory.db");

    this.db = null;
  }

  async init() {
    await fs.mkdir(this.baseDir, {
      recursive: true,
      mode: 0o700,
    });

    const rawSchema = await fs.readFile(schemaPath, "utf8");

    this.db = new Database(this.dbPath);

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    this.db.exec(rawSchema);

    return this;
  }

  getDb() {
    if (!this.db) {
      throw new Error("MemoryDb is not initialized.");
    }

    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Shared singleton used by tests + runtime modules
// ---------------------------------------------------------------------------

export const memoryDb = new MemoryDb({
  dbPath: process.env.DB_PATH,
});

await memoryDb.init();

export const db = memoryDb.getDb();
