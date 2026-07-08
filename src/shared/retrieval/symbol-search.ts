import pg from "pg";
const { Pool } = pg;

export interface SymbolSearchResult {
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Looks up exact symbol name matches in the symbols table.
 *
 * @returns matching SymbolSearchResult rows, empty array if none found.
 * @throws if the database query itself fails (connection error, syntax
 *         error) — does NOT throw on zero matches, that returns [].
 */
export async function findSymbolDefinition(
  query: string,
): Promise<SymbolSearchResult[]> {
  const result = await pool.query(
    `select name, kind, file_path, start_line, end_line, signature
     from symbols where name = $1`,
    [query],
  );
  return result.rows.map((r: any) => ({
    name: r.name,
    kind: r.kind,
    filePath: r.file_path,
    startLine: r.start_line,
    endLine: r.end_line,
    signature: r.signature ?? undefined,
  }));
}
