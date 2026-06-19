import type { RiskFinding } from "./schema.js";

export function mapSeverityFromCvss(
  score?: number,
): "critical" | "high" | "medium" | "low" | "info" | "unknown" {
  if (typeof score !== "number") return "unknown";
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  if (score > 0) return "low";
  return "info";
}

export function normalizeDependencyCheckFinding(vuln: any): RiskFinding {
  const fingerprint =
    vuln?.source || vuln?.name || vuln?.cve || JSON.stringify(vuln);
  const pkg = vuln?.packageName ?? vuln?.package ?? null;
  const version = vuln?.version ?? vuln?.vulnerableVersions ?? null;
  const rawSeverity =
    typeof vuln?.severity === "string"
      ? (vuln.severity.toLowerCase() as RiskFinding["severity"])
      : mapSeverityFromCvss(Number(vuln?.cvssScore));

  return {
    id: `depchk:${fingerprint}`,
    scanner: "dependency-check",
    ruleId: vuln?.name ?? vuln?.cve ?? undefined,
    title: vuln?.title ?? vuln?.name ?? vuln?.cve ?? "Dependency vulnerability",
    description: vuln?.description ?? vuln?.details ?? "",
    file: vuln?.filePath ?? null,
    package: pkg,
    version,
    severity: rawSeverity ?? "unknown",
    fingerprint: String(fingerprint),
    evidence: vuln,
    createdAt: Date.now(),
    raw: vuln,
  };
}

export function normalizeTrivyFinding(vuln: any, target?: string): RiskFinding {
  const fingerprint =
    (vuln?.VulnerabilityID ?? "") +
    "|" +
    (vuln?.PkgName ?? "") +
    "|" +
    (vuln?.InstalledVersion ?? "");
  const cvss =
    vuln?.CVSS?.nvd?.V3Score ?? vuln?.CVSS?.nvd?.V2Score ?? undefined;
  const rawSeverity =
    typeof vuln?.Severity === "string"
      ? (vuln.Severity.toLowerCase() as RiskFinding["severity"])
      : mapSeverityFromCvss(Number(cvss));

  return {
    id: `trivy:${fingerprint}`,
    scanner: "trivy",
    ruleId: vuln?.VulnerabilityID,
    title: vuln?.Title ?? vuln?.VulnerabilityID ?? "Image vulnerability",
    description: vuln?.Description ?? "",
    file: target ?? null,
    package: vuln?.PkgName ?? null,
    version: vuln?.InstalledVersion ?? vuln?.FixedVersion ?? null,
    severity: rawSeverity ?? "unknown",
    fingerprint: String(fingerprint),
    evidence: vuln,
    createdAt: Date.now(),
    raw: vuln,
  };
}
