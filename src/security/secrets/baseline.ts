import fs from "node:fs/promises";

function getFingerprint(row: any): string | null {
  const value = row?.Fingerprint ?? row?.fingerprint ?? null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function loadBaselineFingerprints(
  baselinePath?: string | null,
): Promise<Set<string>> {
  if (!baselinePath) return new Set();
  try {
    const raw = await fs.readFile(baselinePath, "utf8");
    const parsed = JSON.parse(raw);
    let rows: unknown[] = [];
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (parsed != null && typeof parsed === "object" && Array.isArray((parsed as { findings?: unknown[] }).findings)) {
    rows = (parsed as { findings: unknown[] }).findings;
  }
    const out = new Set<string>();
    for (const row of rows) {
      const fp = getFingerprint(row);
      if (fp) out.add(fp);
    }
    return out;
  } catch {
    return new Set();
  }
}
