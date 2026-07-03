/**
 * src/shared/retrieval/code-search.ts
 *
 * Shared retrieval layer — ripgrep-backed code search.
 *
 * Used by both:
 *   - src/agents/tools/search-code.ts  (harness tool surface)
 *   - src/mcp/server.ts                (MCP tool surface)
 *
 * ripgrep (`rg`) must be available in PATH. Confirmed present at /usr/bin/rg
 * (v13.0.0) in the runtime environment.
 */

import * as path from "node:path";
import * as childProcess from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../logging/logger.js";

const execFile = promisify(childProcess.execFile);

// ─── configuration (from environment) ────────────────────────────────────────

// Follows the same convention as read-file.ts (PROJECT_ROOT) and
// orchestrator.ts (process.cwd() as project base).
const REPO_ROOT = path.resolve(
  process.env.REPO_ROOT ?? process.cwd(),
);

// ─── types ────────────────────────────────────────────────────────────────────

export interface CodeSearchHit {
  file: string;   // path relative to REPO_ROOT
  line: number;
  text: string;
}

// ─── resolveGlob ──────────────────────────────────────────────────────────────

/**
 * Resolves a glob pattern relative to REPO_ROOT, throwing if the resolved
 * path would escape REPO_ROOT (path-traversal guard).
 *
 * When glob is undefined or empty, returns REPO_ROOT itself (search whole repo).
 */
export function resolveGlob(glob?: string): string {
  if (!glob) {
    return REPO_ROOT;
  }

  const resolved = path.resolve(REPO_ROOT, glob);

  // Ensure the resolved path stays inside REPO_ROOT
  const repoRootWithSep = REPO_ROOT.endsWith(path.sep)
    ? REPO_ROOT
    : REPO_ROOT + path.sep;

  if (!resolved.startsWith(repoRootWithSep) && resolved !== REPO_ROOT) {
    throw new Error(
      `resolveGlob: path "${glob}" escapes REPO_ROOT (${REPO_ROOT})`,
    );
  }

  return resolved;
}

// ─── searchCode ───────────────────────────────────────────────────────────────

const MAX_RESULTS = 50;

/**
 * Searches the codebase using ripgrep (`rg`) with JSON output.
 *
 * @param pattern - Regex pattern passed to `rg`
 * @param glob    - Optional path glob resolved relative to REPO_ROOT
 *
 * @returns Up to 50 `CodeSearchHit` objects, file paths relative to REPO_ROOT.
 *
 * @throws on rg exit-code > 1 (actual error), or on JSON parse failure.
 *         Exit code 1 with empty stdout = zero matches = returns [].
 */
export async function searchCode(
  pattern: string,
  glob?: string,
): Promise<CodeSearchHit[]> {
  const searchPath = resolveGlob(glob);

  const args = [
    "--json",
    "--max-count", "50",
    "--glob", "!node_modules",
    "--glob", "!.git",
    pattern,
    searchPath,
  ];

  let stdout = "";
  try {
    const result = await execFile("rg", args, { maxBuffer: 10 * 1024 * 1024 });
    stdout = result.stdout;
  } catch (err) {
    const execErr = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };

    // rg exits with code 1 when there are no matches — not a real error.
    // execFile surfaces the exit code as the string "1" on ErrnoException.code.
    const exitCode = String(execErr.code ?? "");
    if (exitCode === "1" && !execErr.stdout?.trim()) {
      logger.info("retrieval.code-search", {
        pattern,
        glob,
        hits: 0,
      });
      return [];
    }

    throw new Error(
      `searchCode: rg failed (code ${exitCode}): ${execErr.stderr ?? String(err)}`,
    );
  }

  // Parse rg --json output: each line is a JSON object; we only care about
  // lines with type === "match".
  const hits: CodeSearchHit[] = [];

  for (const line of stdout.split("\n")) {
    if (hits.length >= MAX_RESULTS) break;

    const trimmed = line.trim();
    if (!trimmed) continue;

    let record: {
      type: string;
      data?: {
        path?: { text?: string };
        line_number?: number;
        lines?: { text?: string };
      };
    };

    try {
      record = JSON.parse(trimmed) as typeof record;
    } catch {
      // Skip malformed lines (e.g. rg summary lines)
      continue;
    }

    if (record.type !== "match" || !record.data) continue;

    const absoluteFile = record.data.path?.text ?? "";
    const relativeFile = path.relative(REPO_ROOT, absoluteFile);
    const lineNumber = record.data.line_number ?? 0;
    const text = (record.data.lines?.text ?? "").trim();

    hits.push({ file: relativeFile, line: lineNumber, text });
  }

  logger.info("retrieval.code-search", {
    pattern,
    glob,
    hits: hits.length,
  });

  return hits;
}
