import fs from "node:fs";

export function loadRiskBaseline(baselinePath: string): Set<string> {
  try {
    const raw = fs.readFileSync(baselinePath, "utf8");
    const parsed = JSON.parse(raw);
    const set = new Set<string>();
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item?.fingerprint) set.add(String(item.fingerprint));
      }
    } else if (parsed?.findings && Array.isArray(parsed.findings)) {
      for (const f of parsed.findings) {
        if (f?.fingerprint) set.add(String(f.fingerprint));
      }
    }
    return set;
  } catch {
    return new Set();
  }
}
