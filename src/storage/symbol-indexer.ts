import pg from "pg";
const { Pool } = pg;
import { getRepositoryId } from "../shared/retrieval/repository-id.js";
import { walkSourceFiles, extractSymbolsFromFile, ExtractedSymbol } from "./symbol-extractor.js";

/**
 * Replaces all symbol rows for this repository with freshly-extracted
 * ones. Delete-then-insert (not upsert) because a file's symbols can be
 * removed or renamed between runs, and there's no reliable stable ID to
 * upsert against yet — full replacement per run is simplest and correct
 * as long as it happens inside one transaction.
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

    for (const sym of allSymbols) {
      await client.query(
        `INSERT INTO symbols
           (repository_id, file_path, name, kind, start_line, end_line, signature)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          repositoryId,
          sym.filePath,
          sym.name,
          sym.kind,
          sym.startLine,
          sym.endLine,
          sym.signature ?? null,
        ],
      );
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
