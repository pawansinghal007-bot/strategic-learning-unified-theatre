import pg from "pg";
const { Pool } = pg;
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "code-index-migrations");

/**
 * Applies every .sql file in code-index-migrations/, in filename order,
 * inside a single transaction. Tracks applied migrations in a
 * schema_migrations table (created if absent) so re-running against an
 * already-migrated DB is a safe no-op rather than a hard failure.
 * A migration whose filename is not yet recorded is applied and recorded;
 * any other failure (e.g. a genuine conflicting schema change) still
 * rolls back and throws, same as before.
 */
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
    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations",
    );
    const applied = new Set(rows.map((r) => r.filename));

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skipping already-applied migration: ${file}`);
        continue;
      }
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      console.log(`Applying migration: ${file}`);
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file],
      );
      appliedCount++;
    }
    await client.query("COMMIT");
    console.log(
      `Applied ${appliedCount} new migration(s); ${files.length - appliedCount} already up to date.`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Allow running directly: npx tsx src/storage/run-migrations.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  try {
    await runMigrations(url);
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}
