# V13 — Storage Engine Identity

**Engine**: Missing Database Design section
**Question**: What is the actual database engine (SQLite, flat JSON, better-sqlite3, or other)? Are schemas per-domain or one shared store?

---

## Commands Run

```bash
# 1. Read src/storage/run-migrations.ts (full file)
cat src/storage/run-migrations.ts

# 2. Read src/ai-memory/memory-db.js (full file)
cat src/ai-memory/memory-db.js

# 3. Read src/ai-memory/memory.sql (full file)
cat src/ai-memory/memory.sql

# 4. Read src/llm/experience-db.js (full file)
cat src/llm/experience-db.js

# 5. List migration files
ls src/storage/code-index-migrations/

# 6. Read migration schema
cat src/storage/code-index-migrations/001_symbols_table.sql

# 7. Search for all Database imports across src/
grep -rn "import.*Database|from.*better-sqlite3|from.*sqlite3|new Database|new sqlite3" src/**/*.{js,ts}

# 8. Search for all database engine references
grep -rn "better-sqlite3|sqlite3|openDatabase|Database|sql\.open|betterSqlite3|SqliteDb" src/**/*.{js,ts}

# 9. Search for PostgreSQL references
grep -rn "import.*pg|from.*pg|Pool|DATABASE_URL" src/**/*.{js,ts}

# 10. Search for JSON file-based storage patterns
grep -rn "writeJson.*state|readJson.*state|\.db.*JSON|JSON\.stringify.*state" src/llm/experience-db.js
```

## Terminal Output

**Command 7 — Database imports:**

```
src/ai-memory/memory-db.js:5:import Database from "better-sqlite3";
src/ai-memory/memory-db.js:43:    this.db = new Database(this.dbPath);
src/commands/bc2-sync.js:5:import Database from "better-sqlite3";
src/commands/bc2-sync.js:50:  const db = new Database(captureDbPath, {
src/governance/workspace-context.ts:1:import Database from "better-sqlite3";
src/governance/workspace-context.ts:13:  const db = new Database(getDbPath());
```

**Command 8 — All database engine references:**

```
src/ai-memory/memory-db.js:5:import Database from "better-sqlite3";
src/ai-memory/memory-db.js:43:    this.db = new Database(this.dbPath);
src/commands/bc2-sync.js:5:import Database from "better-sqlite3";
src/commands/bc2-sync.js:50:  const db = new Database(captureDbPath, {
src/governance/workspace-context.ts:1:import Database from "better-sqlite3";
src/governance/workspace-context.ts:13:  const db = new Database(getDbPath());
src/storage/run-migrations.ts:18:export async function runMigrations(databaseUrl: string): Promise<void> {
src/storage/run-migrations.ts:19:  const pool = new Pool({ connectionString: databaseUrl });
src/storage/run-migrations.ts:68:  const url = process.env.DATABASE_URL;
src/storage/run-indexer.ts:3:const url = process.env.DATABASE_URL;
src/shared/retrieval/symbol-search.ts:13:const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

**Command 9 — PostgreSQL references:**

```
src/storage/run-migrations.ts:1:import pg from "pg";
src/storage/run-migrations.ts:2:const { Pool } = pg;
src/storage/run-migrations.ts:19:  const pool = new Pool({ connectionString: databaseUrl });
src/shared/retrieval/symbol-search.ts:1:import pg from "pg";
src/shared/retrieval/symbol-search.ts:2:const { Pool } = pg;
src/shared/retrieval/symbol-search.ts:13:const pool = new Pool({ connectionString: process.env.DATABASE_URL });
src/storage/run-indexer.ts:3:const url = process.env.DATABASE_URL;
src/storage/run-migrations.ts:68:  const url = process.env.DATABASE_URL;
```

**Command 10 — JSON storage in experience-db.js:**

```
src/llm/experience-db.js:53:async function readJson(filePath, fallback) {
src/llm/experience-db.js:62:async function writeJson(filePath, value) {
src/llm/experience-db.js:64:  await fs.writeFile(tmp, JSON.stringify(value, null, 2), {
src/llm/experience-db.js:163:      const loaded = await readJson(this.dbPath, null);
src/llm/experience-db.js:179:      await this._serializeWrite(() => writeJson(this.dbPath, this.state));
src/llm/experience-db.js:184:    await this._serializeWrite(() => writeJson(this.dbPath, this.state));
```

## Code Evidence

### `src/storage/run-migrations.ts` — PostgreSQL migration runner (lines 1-65)

```typescript
import pg from "pg";
const { Pool } = pg;
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "code-index-migrations");

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // ... applies .sql files in order, tracks in schema_migrations ...
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
```

**Engine**: PostgreSQL (via `pg` node driver). **Schema**: Code index only (`symbols` table). **File**: `experience.db` — misleading name, actually JSON.

### `src/storage/code-index-migrations/001_symbols_table.sql` — PostgreSQL schema

```sql
create table symbols (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null,
  file_path text not null,
  name text not null,
  kind text not null,
  start_line int not null,
  end_line int not null,
  signature text,
  indexed_at timestamptz default now()
);
create index symbols_name_idx on symbols(name);
create index symbols_file_path_idx on symbols(file_path);
```

**Observation**: PostgreSQL-specific types (`uuid`, `gen_random_uuid()`, `timestamptz`). Single table: `symbols`. Connected via `DATABASE_URL` env var.

### `src/ai-memory/memory-db.js` — better-sqlite3 (lines 1-75)

```javascript
import Database from "better-sqlite3";
// ...
export class MemoryDb {
  constructor({ baseDir, dbPath } = {}) {
    this.baseDir = defaultBaseDir(baseDir);
    this.dbPath =
      dbPath || process.env.DB_PATH || path.join(this.baseDir, "ai-memory.db");
    this.db = null;
  }

  async init() {
    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    const rawSchema = await fs.readFile(schemaPath, "utf8");
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(rawSchema);
    return this;
  }
}

export const memoryDb = new MemoryDb({ dbPath: process.env.DB_PATH });
await memoryDb.init();
export const db = memoryDb.getDb();
```

**Engine**: SQLite via `better-sqlite3`. **File**: `~/.vscode-rotator/ai-memory.db`. **Schema**: Defined in `src/ai-memory/memory.sql` (7 tables). WAL mode.

### `src/ai-memory/memory.sql` — AI Memory schema (7 tables)

```sql
CREATE TABLE IF NOT EXISTS sprint_state (...);
CREATE TABLE IF NOT EXISTS architectural_decisions (...);
CREATE TABLE IF NOT EXISTS implementation_memory (...);
CREATE TABLE IF NOT EXISTS handoff_state (...);
CREATE TABLE IF NOT EXISTS test_baselines (...);
CREATE TABLE IF NOT EXISTS important_commands (...);
CREATE TABLE IF NOT EXISTS ai_lessons_learned (...);
CREATE TABLE IF NOT EXISTS session_resume_metadata (...);
CREATE TABLE IF NOT EXISTS session_continuation_state (...);
```

**Observation**: 9 tables total. All AI memory / sprint tracking domain. Foreign key from `session_continuation_state` → `session_resume_metadata`.

### `src/llm/experience-db.js` — Flat JSON file (lines 1-220)

```javascript
// No Database import. No sqlite3 import.
// Uses readJson/writeJson for all persistence.

export class ExperienceDb {
  constructor({ baseDir, dbPath } = {}) {
    this.baseDir = appBaseDir(baseDir);
    this.dbPath = dbPath ?? path.join(this.baseDir, "experience.db");
    this.state = null;
    this._writeLock = null;
  }

  async open() {
    try {
      const loaded = await readJson(this.dbPath, null); // ← JSON file
      this.state =
        loaded && typeof loaded === "object"
          ? { ...defaultState(), ...loaded }
          : defaultState();
      return this;
    } catch (err) {
      if (isCorruptDbError(err)) {
        quarantineCorruptDb(this.dbPath);
        return this._initSchema();
      }
      throw err;
    }
  }

  async close() {
    if (this.state)
      await this._serializeWrite(() => writeJson(this.dbPath, this.state));
  }

  async save() {
    if (!this.state) await this.open();
    await this._serializeWrite(() => writeJson(this.dbPath, this.state));
  }
}
```

**Engine**: Flat JSON file. **File**: `~/.vscode-rotator/experience.db` (`.db` extension is misleading — it's a JSON file). **Schema**: In-memory JS object with 7 collections: `sprints`, `mistakes`, `rubric_rules`, `documents`, `ingestion_log`, `prompt_history`, `conversation_threads`. Writes are serialized via `_writeLock`.

### `src/governance/workspace-context.ts` — better-sqlite3 (lines 1-13)

```typescript
import Database from "better-sqlite3";
// ...
const db = new Database(getDbPath());
```

**Engine**: SQLite via `better-sqlite3`. **Domain**: Workspace governance / quotas.

### `src/commands/bc2-sync.js` — better-sqlite3 (lines 5, 50)

```javascript
import Database from "better-sqlite3";
// ...
const db = new Database(captureDbPath, {
```

**Engine**: SQLite via `better-sqlite3`. **Domain**: Browser Capture v2 chat sync (reads from external capture DB, writes to experience DB).

### `src/shared/retrieval/symbol-search.ts` — PostgreSQL (lines 1, 13)

```typescript
import pg from "pg";
const { Pool } = pg;
// ...
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

**Engine**: PostgreSQL. **Domain**: Symbol search (reads from `symbols` table created by migrations).

## Verdict

**Confirmed built** (three distinct engines, per-domain schemas)

## Notes

The codebase uses **three distinct storage engines** across **per-domain schemas** — no shared store:

| Engine     | Library                  | File/Connection                                          | Domain                                            | Tables/Collections                                                                                                                                                                                                    |
| ---------- | ------------------------ | -------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | `pg` (node-postgres)     | `DATABASE_URL` env var                                   | Code index (symbols)                              | `symbols`, `schema_migrations`                                                                                                                                                                                        |
| SQLite     | `better-sqlite3`         | `~/.vscode-rotator/ai-memory.db`                         | AI memory, sprint tracking                        | 9 tables (`sprint_state`, `architectural_decisions`, `implementation_memory`, `handoff_state`, `test_baselines`, `important_commands`, `ai_lessons_learned`, `session_resume_metadata`, `session_continuation_state`) |
| SQLite     | `better-sqlite3`         | (path from `getDbPath()`)                                | Workspace governance                              | (schema not in scope)                                                                                                                                                                                                 |
| Flat JSON  | (none — `fs` read/write) | `~/.vscode-rotator/experience.db` (misleading `.db` ext) | Experience: mistakes, rubrics, documents, threads | 7 in-memory collections serialized to JSON                                                                                                                                                                            |

**Key observations:**

- `experience.db` has a `.db` extension but is a JSON file — the `isCorruptDbError` check even catches `SyntaxError` (JSON parse failure) alongside `SQLITE_CORRUPT`.
- PostgreSQL is only used for the code symbol index (migrations + symbol-search). Requires `DATABASE_URL` env var.
- `better-sqlite3` is used by three independent modules (memory-db, workspace-context, bc2-sync) — each opens its own connection to its own file.
- No shared database pool or cross-domain queries. Each domain is fully isolated.
- Qdrant (vector store) is a fourth "engine" but uses REST API, not a local file/DB.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Confirmed built (multi-engine, per-domain).**

Confirmed engines from source:
- PostgreSQL via `pg` in `src/storage/run-migrations.ts` (`DATABASE_URL`)
- SQLite via `better-sqlite3` in `src/ai-memory/memory-db.js`
- Flat JSON (misleading `.db` extension) in `src/llm/experience-db.js`

Per-domain isolation claim is consistent. Note for roadmap authors: Standing Rules say “PostgreSQL is the only supported relational store,” while better-sqlite3 is also in use for AI memory — architectural drift outside this verification file’s scope.
