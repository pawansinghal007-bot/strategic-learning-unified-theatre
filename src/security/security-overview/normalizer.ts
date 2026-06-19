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

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ?? undefined;
}

function asNullableString(value: unknown): string | null {
  const text = asTrimmedString(value);
  return text ?? null;
}

function buildFallbackFingerprint(parts: unknown[]): string {
  return parts
    .map((part) => asTrimmedString(part) ?? "")
    .join("|")
    .trim();
}

function defaultScannerForKind(kind: SecurityFindingKind): string {
  if (kind === "secret") return "gitleaks";
  return "dependency-check";
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
    const ruleId = asTrimmedString(item.ruleId) ?? "unknown-rule";
    const severity = normalizeSeverity(
      typeof item.severity === "string" ? item.severity : undefined,
    );

    const fingerprint = asTrimmedString(item.fingerprint);
    const fallbackFingerprint = buildFallbackFingerprint([
      ruleId,
      severity,
      item.file,
      item.package,
      item.version,
    ]);

    const scanner =
      asTrimmedString(item.scanner) ?? defaultScannerForKind(kind);
    const id =
      (asTrimmedString(item.id) ??
        fingerprint ??
        fallbackFingerprint) ||
      `${kind}:${Date.now()}`;

    const title = asTrimmedString(item.title);
    const description = asTrimmedString(item.description);
    const file = asNullableString(item.file);
    const packageField = asNullableString(item.package);
    const version = asNullableString(item.version);

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
      fingerprint: (fingerprint ?? fallbackFingerprint) || undefined,
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
