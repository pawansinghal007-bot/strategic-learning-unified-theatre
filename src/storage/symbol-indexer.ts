import pg from "pg";
const { Pool } = pg;
import { getRepositoryId } from "../shared/retrieval/repository-id.js";
import { walkSourceFiles, extractSymbolsFromFile, ExtractedSymbol } from "./symbol-extractor.js";

/**
 * Number of symbol rows per batched INSERT statement.
 * 7 parameters per row × 500 rows = 3 500 parameters per batch,
 * well under Postgres's hard limit of 65 535 bound parameters.
 */
export const INSERT_CHUNK_SIZE = 500;

/**
 * Builds a single multi-row INSERT for `chunk` and executes it.
 * Each row maps to 7 positional parameters ($1…$7, $8…$14, …).
 */
async function insertChunk(
  client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  repositoryId: string,
  chunk: ExtractedSymbol[],
): Promise<void> {
  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];

  chunk.forEach((sym, i) => {
    const base = i * 7;
    rowPlaceholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
    );
    values.push(
      repositoryId,
      sym.filePath,
      sym.name,
      sym.kind,
      sym.startLine,
      sym.endLine,
      sym.signature ?? null,
    );
  });

  await client.query(
    `INSERT INTO symbols
       (repository_id, file_path, name, kind, start_line, end_line, signature)
     VALUES ${rowPlaceholders.join(", ")}`,
    values,
  );
}

/**
 * Replaces all symbol rows for this repository with freshly-extracted
 * ones. Delete-then-insert (not upsert) because a file's symbols can be
 * removed or renamed between runs, and there's no reliable stable ID to
 * upsert against yet — full replacement per run is simplest and correct
 * as long as it happens inside one transaction.
 *
 * Symbols are inserted in batches of INSERT_CHUNK_SIZE rows each to
 * reduce round-trips from ~1300+ individual statements to a handful of
 * multi-row INSERTs, while staying safely under Postgres's 65 535
 * bound-parameter limit.
 */
export async function indexSymbols(
  databaseUrl: string,
  projectRoot: string = process.cwd(),
): Promise<{ filesProcessed: number; symbolsInserted: number }> {
  const pool = new Pool({ connectionString: databaseUrl });
  const repositoryId = getRepositoryId();
  const files = walkSourceFiles(projectRoot);

  const allSymbols: ExtractedSymbol[] = [];
  for (const f of files) {
    allSymbols.push(...extractSymbolsFromFile(f, projectRoot));
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM symbols WHERE repository_id = $1", [
      repositoryId,
    ]);

    for (let i = 0; i < allSymbols.length; i += INSERT_CHUNK_SIZE) {
      await insertChunk(client, repositoryId, allSymbols.slice(i, i + INSERT_CHUNK_SIZE));
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  return { filesProcessed: files.length, symbolsInserted: allSymbols.length };
}
