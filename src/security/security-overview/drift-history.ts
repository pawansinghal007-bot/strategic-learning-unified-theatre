import fs from "node:fs";

export type DriftClassification =
  | "clean"
  | "regressed"
  | "improved"
  | "mixed"
  | "unknown";

export interface DriftHistoryEntry {
  id: string;
  createdAt: number;
  workspaceId?: string | null;
  baselinePath?: string | null;
  snapshotPath?: string | null;
  historyPath?: string | null;
  classification: DriftClassification;
  counts?: {
    current?: number;
    baseline?: number;
    introduced?: number;
    persistent?: number;
    resolved?: number;
  };
  note?: string;
}

/**
 * Load drift history entries from a JSON file.
 * Returns an empty array if historyPath is missing, empty, or file is invalid.
 */
export function loadDriftHistory(
  historyPath: string | null | undefined,
): DriftHistoryEntry[] {
  if (!historyPath?.trim()) return [];
  try {
    const raw = fs.readFileSync(historyPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DriftHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Overwrite the history file with the given entries array.
 */
export function saveDriftHistory(
  historyPath: string,
  entries: DriftHistoryEntry[],
): { ok: true; filePath: string; count: number } {
  fs.writeFileSync(historyPath, JSON.stringify(entries, null, 2), "utf8");
  return { ok: true, filePath: historyPath, count: entries.length };
}

/**
 * Append one entry to the existing history file (or create it if missing).
 */
export function appendDriftHistory(
  historyPath: string,
  entry: DriftHistoryEntry,
): { ok: true; filePath: string; count: number } {
  const existing = loadDriftHistory(historyPath);
  const next = [...existing, entry];
  return saveDriftHistory(historyPath, next);
}
