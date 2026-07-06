import * as path from "node:path";

/**
 * Single source of truth for project root path.
 *
 * Uses PROJECT_ROOT environment variable if set, otherwise falls back to
 * resolving the current working directory. This constant is exported so that
 * all modules use the same root computation, preventing drift between call sites.
 */
export const PROJECT_ROOT =
  process.env.PROJECT_ROOT ?? path.resolve(process.cwd());
