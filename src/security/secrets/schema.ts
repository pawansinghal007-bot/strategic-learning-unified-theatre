export type SecretSeverity = "low" | "medium" | "high" | "critical";

export interface SecretFinding {
  id: string;
  ruleId: string;
  description: string;
  severity: SecretSeverity;
  category: "credential" | "token" | "private_key" | "generic" | "unknown";
  file: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  commit?: string | null;
  author?: string | null;
  email?: string | null;
  date?: string | null;
  fingerprint: string;
  secretPreview: string | null;
  match: string | null;
  tags: string[];
  baselineMatched: boolean;
  suppressed: boolean;
  suppressionReason: string | null;
}

export interface SecretsScanSummary {
  scannedPath: string;
  findings: number;
  unsuppressed: number;
  suppressed: number;
  baselineMatched: number;
  bySeverity: Record<SecretSeverity, number>;
  byRule: Record<string, number>;
  completedAt: number;
}

export interface SecretsScanResult {
  ok: true;
  engine: "gitleaks";
  command: string[];
  summary: SecretsScanSummary;
  findings: SecretFinding[];
  raw?: unknown;
}

export interface SecretsSuppressionEntry {
  fingerprint?: string;
  file?: string;
  ruleId?: string;
  reason: string;
  createdAt: number;
  createdBy?: string | null;
}
