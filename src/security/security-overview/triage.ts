import fs from "node:fs";
import { normalizeTriageStatus } from "./normalizer.js";
import {
  TRIAGE_STATUSES as SCHEMA_TRIAGE_STATUSES,
  type TriageStatus,
} from "./schema.js";

export const TRIAGE_STATUSES = SCHEMA_TRIAGE_STATUSES;

export type SecurityTriageStatus =
  | "open"
  | "suppressed"
  | "accepted"
  | "false_positive"
  | "resolved"
  | "fixed";

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
  const normalized = {
    ...next,
    status: normalizeTriageStatus(next.status) as SecurityTriageStatus,
  };
  const ix = entries.findIndex((e) => e.fingerprint === normalized.fingerprint);
  if (ix >= 0) {
    const updated = [...entries];
    updated[ix] = normalized;
    return updated;
  }
  return [...entries, normalized];
}

export function getSecurityTriageStatus(
  fingerprint: string | undefined,
  entries: SecurityTriageEntry[],
): SecurityTriageStatus {
  if (!fingerprint) return "open";
  return normalizeTriageStatus(
    entries.find((e) => e.fingerprint === fingerprint)?.status ?? "open",
  ) as SecurityTriageStatus;
}

export function isTriageStatusFinal(status: TriageStatus): boolean {
  return status === "fixed" || status === "resolved" || status === "suppressed";
}

/**
 * Sprint 52 — apply the same triage status to multiple fingerprints at once.
 * Skips null, undefined, and empty-string fingerprints.
 * Returns a new entries array; does not mutate the input.
 */
export function applyBulkTriage(
  entries: SecurityTriageEntry[],
  fingerprints: Array<string | null | undefined>,
  status: SecurityTriageStatus,
  reason?: string,
  updatedBy?: string,
  now: number = Date.now(),
): SecurityTriageEntry[] {
  if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
    return entries;
  }

  const normalizedStatus = normalizeTriageStatus(
    status,
  ) as SecurityTriageStatus;

  return fingerprints.reduce<SecurityTriageEntry[]>((acc, fp) => {
    if (fp == null || fp === "") return acc;
    const fingerprint = String(fp).trim();
    if (!fingerprint) return acc;
    return upsertSecurityTriageEntry(acc, {
      fingerprint,
      status: normalizedStatus,
      reason: reason ?? undefined,
      updatedAt: now,
      updatedBy: updatedBy ?? undefined,
    });
  }, entries);
}
