import type {
  SecurityFindingKind,
  SecuritySeverity,
  SecurityFindingSummary,
} from "./schema.js";

function normalizeSeverity(raw: string | undefined): SecuritySeverity {
  const s = String(raw ?? "").toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "medium" || s === "moderate") return "medium";
  if (s === "low") return "low";
  if (s === "info" || s === "informational" || s === "note") return "info";
  return "unknown";
}

export function flattenFindings(
  payload: unknown,
  kind: SecurityFindingKind,
): Array<Omit<SecurityFindingSummary, "suppressed" | "baselineMatched">> {
  const source = Array.isArray(payload)
    ? (payload as Record<string, unknown>[])
    : Array.isArray((payload as { findings?: unknown[] })?.findings)
      ? (payload as { findings: Record<string, unknown>[] }).findings
      : [];

  return source.filter(Boolean).map((item) => ({
    kind,
    scanner: String(
      item.scanner ?? (kind === "secret" ? "gitleaks" : "dependency-check"),
    ),
    id: String(item.id ?? item.fingerprint ?? `${kind}:${Date.now()}`),
    ruleId: item.ruleId != null ? String(item.ruleId) : undefined,
    title: item.title != null ? String(item.title) : undefined,
    description:
      item.description != null ? String(item.description) : undefined,
    severity: normalizeSeverity(item.severity as string | undefined),
    file: item.file != null ? String(item.file) : null,
    package: item.package != null ? String(item.package) : null,
    version: item.version != null ? String(item.version) : null,
    fingerprint:
      item.fingerprint != null ? String(item.fingerprint) : undefined,
    createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
  }));
}
