import { createHash } from "node:crypto";
import { PROJECT_ROOT } from "../config/paths";

/**
 * Deterministic repository_id for the symbols table, derived from
 * PROJECT_ROOT. Same repo path always yields the same UUID — no new
 * config or manual assignment needed, since this tool only ever
 * operates on a single local repository per PROJECT_ROOT.
 *
 * Uses a UUID-v5-style deterministic derivation (SHA-1 based, RFC 4122
 * layout) so repeated calls/restarts always produce the identical ID.
 */
const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // standard DNS namespace UUID, reused as a fixed seed

export function getRepositoryId(): string {
  const hash = createHash("sha1")
    .update(NAMESPACE)
    .update(PROJECT_ROOT)
    .digest("hex");
  // Format as UUID (v5-shaped): 8-4-4-4-12
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "5" + hash.slice(13, 16), // version 5
    ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join("-");
}
