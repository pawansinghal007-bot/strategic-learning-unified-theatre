export type SecurityFindingKind = "secret" | "risk";

export type SecuritySeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info"
  | "unknown";

export type SecurityTriageStatus =
  | "open"
  | "suppressed"
  | "accepted"
  | "false_positive"
  | "resolved";

export interface SecurityFindingSummary {
  kind: SecurityFindingKind;
  scanner: string;
  id: string;
  ruleId?: string;
  title?: string;
  description?: string;
  severity: SecuritySeverity;
  file?: string | null;
  package?: string | null;
  version?: string | null;
  fingerprint?: string;
  suppressed?: boolean;
  baselineMatched?: boolean;
  triageStatus?: SecurityTriageStatus;
  createdAt: number;
  raw?: any;
}

export interface SecurityOverviewSnapshot {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  unknown: number;
  secrets: number;
  risks: number;
  suppressed: number;
  baselineMatched: number;
  open: number;
  accepted: number;
  falsePositive: number;
  resolved: number;
  latestAt: number | null;
}

export function emptySecurityOverviewSnapshot(): SecurityOverviewSnapshot {
  return {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    unknown: 0,
    secrets: 0,
    risks: 0,
    suppressed: 0,
    baselineMatched: 0,
    open: 0,
    accepted: 0,
    falsePositive: 0,
    resolved: 0,
    latestAt: null,
  };
}

export function buildSecurityOverviewSnapshot(
  findings: SecurityFindingSummary[],
): SecurityOverviewSnapshot {
  const snap = emptySecurityOverviewSnapshot();
  for (const f of findings) {
    snap.total++;
    if (f.kind === "secret") snap.secrets++;
    if (f.kind === "risk") snap.risks++;
    const sev = (f.severity ?? "unknown") as SecuritySeverity;
    if (sev in snap) (snap as Record<string, number>)[sev]++;
    if (f.suppressed) snap.suppressed++;
    if (f.baselineMatched) snap.baselineMatched++;
    const triageStatus = f.triageStatus ?? "open";
    if (triageStatus === "accepted") snap.accepted++;
    else if (triageStatus === "false_positive") snap.falsePositive++;
    else if (triageStatus === "resolved") snap.resolved++;
    else snap.open++;
    if (
      snap.latestAt === null ||
      (f.createdAt && f.createdAt > snap.latestAt)
    ) {
      snap.latestAt = f.createdAt;
    }
  }
  return snap;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  unknown: number;
}

export interface SecurityOverviewDriftResult {
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
