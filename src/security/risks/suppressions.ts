import fs from "node:fs";

export interface RiskSuppression {
  fingerprint?: string;
  file?: string;
  ruleId?: string;
  reason?: string;
  expiresAt?: number | null;
}

export function loadRiskSuppressions(filePath: string): RiskSuppression[] {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isSuppressed(
  f: { fingerprint?: string; file?: string; ruleId?: string },
  suppressions: RiskSuppression[],
): boolean {
  if (!suppressions || suppressions.length === 0) return false;
  for (const s of suppressions) {
    if (s.fingerprint && f.fingerprint && s.fingerprint === f.fingerprint) {
      return true;
    }
    if (s.file && s.ruleId && s.file === f.file && s.ruleId === f.ruleId) {
      return true;
    }
  }
  return false;
}
