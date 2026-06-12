export type RiskScanner = "dependency-check" | "trivy" | "unknown";

export interface RiskFinding {
  id: string;
  scanner: RiskScanner;
  ruleId?: string;
  title?: string;
  description?: string;
  file?: string | null;
  package?: string | null;
  version?: string | null;
  severity: "critical" | "high" | "medium" | "low" | "info" | "unknown";
  fingerprint?: string;
  evidence?: any;
  createdAt: number;
  raw?: any;
}
