import type {
  SecurityFindingKind,
  SecuritySeverity,
  SecurityFindingSummary,
} from "./schema.js";
import { TRIAGE_STATUSES, TriageStatus } from "./schema.js";

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
  let source: Array<Record<string, unknown>> = [];
  if (Array.isArray(payload)) {
    source = payload as Record<string, unknown>[];
  } else if (
    payload != null &&
    typeof payload === "object" &&
    Array.isArray((payload as { findings?: unknown[] }).findings)
  ) {
    source = (payload as { findings: Record<string, unknown>[] }).findings;
  }

  return source.filter(Boolean).map((item) => {
    const ruleId =
      typeof item.ruleId === "string" && item.ruleId.trim()
        ? item.ruleId.trim()
        : "unknown-rule";
    const severity = normalizeSeverity(item.severity as string | undefined);
    const fingerprintParts = [
      ruleId,
      severity,
      item.file ?? "",
      item.package ?? "",
      item.version ?? "",
    ];
    const fingerprint =
      item.fingerprint != null
        ? String(item.fingerprint)
        : fingerprintParts.join("|").trim();

    const scanner =
      item.scanner != null
        ? String(item.scanner)
        : kind === "secret"
          ? "gitleaks"
          : "dependency-check";
    const id = String(item.id ?? fingerprint ?? `${kind}:${Date.now()}`);
    const title = item.title != null ? String(item.title) : undefined;
    const description =
      item.description != null ? String(item.description) : undefined;
    const file = item.file != null ? String(item.file) : null;
    const packageField = item.package != null ? String(item.package) : null;
    const version = item.version != null ? String(item.version) : null;

    return {
      kind,
      scanner,
      id,
      ruleId: ruleId === "unknown-rule" ? undefined : ruleId,
      title,
      description,
      severity,
      file,
      package: packageField,
      version,
      fingerprint: fingerprint || undefined,
      createdAt:
        typeof item.createdAt === "number" ? item.createdAt : Date.now(),
    };
  });
}

export function normalizeTriageStatus(raw: unknown): TriageStatus {
  if (typeof raw !== "string" || !raw.trim()) return "open";
  const lower = raw.trim().toLowerCase() as TriageStatus;
  return (TRIAGE_STATUSES as readonly string[]).includes(lower)
    ? lower
    : "open";
}
