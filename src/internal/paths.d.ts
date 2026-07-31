/**
 * Type declarations for src/internal/paths.js
 * Allows TypeScript modules (e.g. src/installer/hw-probe/hwProbe.ts) to
 * import from this plain-JS module without requiring allowJs compilation.
 */

/**
 * Returns a copy of `env` with PATH restricted to known-safe directories,
 * suitable for passing to child_process spawn options.
 */
export function sanitizeEnvForSpawn(
  env?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;

export function sanitizePathEntries(pathEnv: string, sep?: string): string[];

export function resolveBinary(
  binName: string,
  extraCandidates?: string[],
): string | null;

export function resolveAuthPath(
  agentType: string,
  options?: { profileName?: string | null; preferExisting?: boolean },
): Promise<string>;

export function resolveVSCodeBin(): Promise<string>;
