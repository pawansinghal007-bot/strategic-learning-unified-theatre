import pg from "pg";
const { Pool } = pg;
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "code-index-migrations");

/**
 * Applies every .sql file in code-index-migrations/, in filename order,
 * inside a single transaction. No migration-tracking table exists yet —
 * this is a minimal runner intended for a fresh/empty database. Running
 * it twice against a DB that already has the tables will fail on the
 * second run (e.g. "relation already exists"), which is the correct,
 * safe failure mode until real migration tracking is added.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      console.log(`Applying migration: ${file}`);
      await client.query(sql);
    }
    await client.query("COMMIT");
    console.log(`Applied ${files.length} migration(s) successfully.`);
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
  runMigrations(url)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
