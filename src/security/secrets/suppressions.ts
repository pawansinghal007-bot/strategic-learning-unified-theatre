import fs from "node:fs/promises";
import type { SecretFinding, SecretsSuppressionEntry } from "./schema.js";

export async function loadSuppressions(
  suppressionsPath?: string | null,
): Promise<SecretsSuppressionEntry[]> {
  if (!suppressionsPath) return [];
  try {
    const raw = await fs.readFile(suppressionsPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function matchSuppression(
  finding: SecretFinding,
  suppressions: SecretsSuppressionEntry[],
): SecretsSuppressionEntry | null {
  for (const row of suppressions) {
    if (row.fingerprint && row.fingerprint === finding.fingerprint) return row;
    if (
      row.file &&
      row.ruleId &&
      row.file === finding.file &&
      row.ruleId === finding.ruleId
    ) {
      return row;
    }
  }
  return null;
}
