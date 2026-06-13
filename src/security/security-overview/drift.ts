import fs from "node:fs";

function safeFindings(
  snapshot: unknown,
): Array<{ fingerprint?: string; severity?: string }> {
  if (!snapshot || typeof snapshot !== "object") return [];
  const s = snapshot as Record<string, unknown>;
  return Array.isArray(s.findings)
    ? (s.findings as Array<{ fingerprint?: string; severity?: string }>)
    : [];
}

function collectFingerprints(
  findings: Array<{ fingerprint?: string }>,
): Set<string> {
  const set = new Set<string>();
  for (const f of findings) {
    const fp = typeof f?.fingerprint === "string" ? f.fingerprint.trim() : "";
    if (fp) set.add(fp);
  }
  return set;
}

function summarizeBySeverity(
  findings: Array<{ severity?: string }>,
): SeverityCounts {
  const out: SeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    unknown: 0,
  };
  for (const f of findings) {
    const sev = String(f?.severity ?? "unknown").toLowerCase();
    if (sev in out) (out as Record<string, number>)[sev]++;
    else out.unknown++;
  }
  return out;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  unknown: number;
}

export interface SecurityDriftResult {
  ok: true;
  baselineLoaded: boolean;
  counts: {
    current: number;
    baseline: number;
    introduced: number;
    persistent: number;
    resolved: number;
  };
  bySeverity: {
    introduced: SeverityCounts;
    persistent: SeverityCounts;
    resolved: SeverityCounts;
  };
  introduced: Array<Record<string, unknown>>;
  persistent: Array<Record<string, unknown>>;
  resolved: Array<Record<string, unknown>>;
}

export function loadSecurityBaselineSnapshot(
  baselinePath?: string | null,
): Record<string, unknown> | null {
  if (!baselinePath || !String(baselinePath).trim()) return null;
  if (!fs.existsSync(baselinePath)) return null;
  try {
    const raw = fs.readFileSync(baselinePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function buildFindingFingerprintSet(
  findings: Array<{ fingerprint?: string }>,
): Set<string> {
  return collectFingerprints(findings);
}

export function compareSecurityOverviewWithBaseline(
  currentSnapshot: unknown,
  baselineSnapshot: unknown,
): SecurityDriftResult {
  const currentFindings = safeFindings(currentSnapshot);
  const baselineFindings = safeFindings(baselineSnapshot);
  const baselineSet = collectFingerprints(baselineFindings);
  const currentSet = collectFingerprints(currentFindings);

  const introduced: Array<Record<string, unknown>> = [];
  const persistent: Array<Record<string, unknown>> = [];
  const resolved: Array<Record<string, unknown>> = [];

  for (const f of currentFindings) {
    const fp = typeof f?.fingerprint === "string" ? f.fingerprint.trim() : "";
    if (!fp) continue;
    if (baselineSet.has(fp)) {
      persistent.push(f as Record<string, unknown>);
    } else {
      introduced.push(f as Record<string, unknown>);
      if (!("triageStatus" in f) || f.triageStatus == null) {
        (f as Record<string, unknown>).triageStatus = "open";
      }
    }
  }

  for (const f of baselineFindings) {
    const fp = typeof f?.fingerprint === "string" ? f.fingerprint.trim() : "";
    if (!fp) continue;
    if (!currentSet.has(fp)) {
      resolved.push(f as Record<string, unknown>);
      if (!("resolvedAt" in f) || f.resolvedAt == null) {
        (f as Record<string, unknown>).resolvedAt = new Date().toISOString();
      }
    }
  }

  return {
    ok: true,
    baselineLoaded: baselineSnapshot != null,
    counts: {
      current: currentFindings.length,
      baseline: baselineFindings.length,
      introduced: introduced.length,
      persistent: persistent.length,
      resolved: resolved.length,
    },
    bySeverity: {
      introduced: summarizeBySeverity(introduced),
      persistent: summarizeBySeverity(persistent),
      resolved: summarizeBySeverity(resolved),
    },
    introduced,
    persistent,
    resolved,
  };
}

export function classifyDriftSeverity(drift: {
  introduced: unknown[];
  resolved: unknown[];
  persistent: unknown[];
}): "clean" | "regressed" | "improved" | "mixed" {
  const hasIntroduced = drift.introduced.length > 0;
  const hasResolved = drift.resolved.length > 0;
  if (!hasIntroduced && !hasResolved) return "clean";
  if (hasIntroduced && !hasResolved) return "regressed";
  if (!hasIntroduced && hasResolved) return "improved";
  return "mixed";
}
