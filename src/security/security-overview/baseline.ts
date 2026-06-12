import fs from "node:fs";

export interface SecurityBaselineFile {
  generatedAt: number;
  findings: Array<{ fingerprint: string }>;
}

export function loadSecurityBaseline(filePath: string): Set<string> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const out = new Set<string>();
    const items = Array.isArray(parsed)
      ? (parsed as Array<{ fingerprint?: string }>)
      : Array.isArray((parsed as SecurityBaselineFile).findings)
        ? (parsed as SecurityBaselineFile).findings
        : [];
    for (const item of items) {
      if (item?.fingerprint) out.add(String(item.fingerprint));
    }
    return out;
  } catch {
    return new Set<string>();
  }
}

export function saveSecurityBaseline(
  filePath: string,
  fingerprints: string[],
): { ok: true; filePath: string; count: number } {
  const payload: SecurityBaselineFile = {
    generatedAt: Date.now(),
    findings: fingerprints.map((fingerprint) => ({ fingerprint })),
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return { ok: true, filePath, count: fingerprints.length };
}
