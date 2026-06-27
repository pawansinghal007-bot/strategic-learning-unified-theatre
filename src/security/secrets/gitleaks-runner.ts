import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { loadBaselineFingerprints } from "./baseline.js";
import { loadSuppressions, matchSuppression } from "./suppressions.js";
import type {
  SecretFinding,
  SecretsScanResult,
  SecretsScanSummary,
  SecretSeverity,
} from "./schema.js";

export interface RunSecretsScanOptions {
  repoPath: string;
  baselinePath?: string | null;
  suppressionsPath?: string | null;
  configPath?: string | null;
  redact?: boolean;
}

function mapSeverity(ruleId: string, description: string): SecretSeverity {
  const x = `${ruleId} ${description}`.toLowerCase();
  if (
    x.includes("private") ||
    x.includes("aws") ||
    x.includes("anthropic") ||
    x.includes("openai")
  ) {
    return "critical";
  }
  if (x.includes("token") || x.includes("secret")) return "high";
  if (x.includes("key")) return "medium";
  return "low";
}

function mapCategory(ruleId: string): SecretFinding["category"] {
  const x = String(ruleId || "").toLowerCase();
  if (x.includes("private")) return "private_key";
  if (x.includes("token")) return "token";
  if (x.includes("secret") || x.includes("password")) return "credential";
  if (x.includes("key")) return "generic";
  return "unknown";
}

function previewSecret(secret: unknown): string | null {
  if (typeof secret !== "string" || !secret) return null;
  if (secret.length <= 8) return "*".repeat(secret.length);
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function normalizeFinding(row: any): SecretFinding {
  const file = row?.File || row?.file || "";
  const ruleId = row?.RuleID || row?.ruleID || row?.ruleId || "unknown";
  const description = row?.Description || row?.description || ruleId;
  const startLine = Number(row?.StartLine || row?.startLine || 0);
  const endLine = Number(row?.EndLine || row?.endLine || startLine);
  const startColumn = Number(row?.StartColumn || row?.startColumn || 0);
  const endColumn = Number(row?.EndColumn || row?.endColumn || 0);
  const fingerprint =
    row?.Fingerprint ||
    row?.fingerprint ||
    crypto
      .createHash("sha256")
      .update(`${file}:${ruleId}:${startLine}:${endLine}`)
      .digest("hex");

  return {
    id: crypto.createHash("sha256").update(String(fingerprint)).digest("hex"),
    ruleId,
    description,
    severity: mapSeverity(ruleId, description),
    category: mapCategory(ruleId),
    file,
    startLine,
    endLine,
    startColumn,
    endColumn,
    commit: row?.Commit || row?.commit || null,
    author: row?.Author || row?.author || null,
    email: row?.Email || row?.email || null,
    date: row?.Date || row?.date || null,
    fingerprint,
    secretPreview: previewSecret(row?.Secret || row?.secret),
    match: row?.Match || row?.match || null,
    tags: Array.isArray(row?.Tags) ? row.Tags : [],
    baselineMatched: false,
    suppressed: false,
    suppressionReason: null,
  };
}

function buildSummary(
  scannedPath: string,
  findings: SecretFinding[],
): SecretsScanSummary {
  const bySeverity: Record<SecretSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const byRule: Record<string, number> = {};
  let suppressed = 0;
  let baselineMatched = 0;

  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byRule[finding.ruleId] = (byRule[finding.ruleId] || 0) + 1;
    if (finding.suppressed) suppressed += 1;
    if (finding.baselineMatched) baselineMatched += 1;
  }

  return {
    scannedPath,
    findings: findings.length,
    unsuppressed: findings.filter((f) => !f.suppressed && !f.baselineMatched)
      .length,
    suppressed,
    baselineMatched,
    bySeverity,
    byRule,
    completedAt: Date.now(),
  };
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf) => {
      stdout += String(buf);
    });
    child.stderr.on("data", (buf) => {
      stderr += String(buf);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || code === 1) {
        resolve(stdout || stderr || "[]");
        return;
      }
      reject(new Error(`gitleaks exited with code ${code}: ${stderr}`));
    });
  });
}

export async function runSecretsScan(
  options: RunSecretsScanOptions,
): Promise<SecretsScanResult> {
  const reportPath = path.join(
    os.tmpdir(),
    `gitleaks-report-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.json`,
  );

  const args: string[] = [
    "detect",
    "--source",
    options.repoPath,
    "--report-format",
    "json",
    "--report-path",
    reportPath,
    "--no-git",
  ];

  if (options.configPath) {
    args.push("--config", options.configPath);
  }
  if (options.redact !== false) {
    args.push("--redact");
  }

  await runCommand("gitleaks", args, options.repoPath);

  let parsed: any[] = [];
  try {
    const raw = await readFile(reportPath, "utf8");
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  } finally {
    await rm(reportPath, { force: true });
  }

  const baselineFingerprints = await loadBaselineFingerprints(
    options.baselinePath,
  );
  const suppressions = await loadSuppressions(options.suppressionsPath);

  const findings = parsed.map(normalizeFinding).map((finding) => {
    if (baselineFingerprints.has(finding.fingerprint)) {
      finding.baselineMatched = true;
    }
    const suppression = matchSuppression(finding, suppressions);
    if (suppression) {
      finding.suppressed = true;
      finding.suppressionReason = suppression.reason;
    }
    return finding;
  });

  return {
    ok: true,
    engine: "gitleaks",
    command: ["gitleaks", ...args],
    summary: buildSummary(options.repoPath, findings),
    findings,
    raw: parsed,
  };
}
