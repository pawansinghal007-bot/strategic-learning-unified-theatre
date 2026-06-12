import fs from "node:fs";

export interface SecuritySuppression {
  fingerprint?: string;
  kind?: "secret" | "risk" | "any";
  file?: string;
  ruleId?: string;
  reason?: string;
  createdAt?: number;
}

export function loadSecuritySuppressions(
  filePath: string,
): SecuritySuppression[] {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SecuritySuppression[]) : [];
  } catch {
    return [];
  }
}

export function saveSecuritySuppressions(
  filePath: string,
  suppressions: SecuritySuppression[],
): { ok: true; filePath: string; count: number } {
  fs.writeFileSync(filePath, JSON.stringify(suppressions, null, 2), "utf8");
  return { ok: true, filePath, count: suppressions.length };
}

export function isSecuritySuppressed(
  finding: {
    fingerprint?: string;
    file?: string;
    ruleId?: string;
    kind?: string;
  },
  suppressions: SecuritySuppression[],
): boolean {
  for (const s of suppressions) {
    if (s.kind && s.kind !== "any" && finding.kind && s.kind !== finding.kind) {
      continue;
    }
    if (
      s.fingerprint &&
      finding.fingerprint &&
      s.fingerprint === finding.fingerprint
    ) {
      return true;
    }
    if (
      s.file &&
      s.ruleId &&
      s.file === finding.file &&
      s.ruleId === finding.ruleId
    ) {
      return true;
    }
  }
  return false;
}
