import fs from "node:fs";

export type SecurityTriageStatus =
  | "open"
  | "suppressed"
  | "accepted"
  | "false_positive"
  | "resolved";

export interface SecurityTriageEntry {
  fingerprint: string;
  status: SecurityTriageStatus;
  reason?: string;
  updatedAt: number;
  updatedBy?: string;
}

export function loadSecurityTriage(filePath: string): SecurityTriageEntry[] {
  if (!filePath) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSecurityTriage(
  filePath: string,
  entries: SecurityTriageEntry[],
): { ok: true; filePath: string; count: number } {
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), "utf8");
  return { ok: true, filePath, count: entries.length };
}

export function upsertSecurityTriageEntry(
  entries: SecurityTriageEntry[],
  next: SecurityTriageEntry,
): SecurityTriageEntry[] {
  const ix = entries.findIndex((e) => e.fingerprint === next.fingerprint);
  if (ix >= 0) {
    const updated = [...entries];
    updated[ix] = next;
    return updated;
  }
  return [...entries, next];
}

export function getSecurityTriageStatus(
  fingerprint: string | undefined,
  entries: SecurityTriageEntry[],
): SecurityTriageStatus {
  if (!fingerprint) return "open";
  return entries.find((e) => e.fingerprint === fingerprint)?.status ?? "open";
}
