import { spawnSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { RiskFinding } from "./schema.js";
import { normalizeDependencyCheckFinding } from "./parsers.js";

export interface RunDependencyCheckOptions {
  baselinePath?: string;
  suppressionsPath?: string;
}

export async function runDependencyCheck(
  scanTarget: string,
  options: RunDependencyCheckOptions = {},
): Promise<{
  ok: boolean;
  engine: "dependency-check";
  findings: RiskFinding[];
  raw?: unknown;
  error?: string;
}> {
  const outDir = path.join(
    os.tmpdir(),
    `depchk-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const reportFile = path.join(outDir, "dependency-check-report.json");

  try {
    fs.mkdirSync(outDir, { recursive: true });

    const args = [
      "--project",
      "project",
      "--scan",
      scanTarget,
      "--format",
      "JSON",
      "--out",
      outDir,
    ];

    spawnSync("dependency-check", args, { encoding: "utf8" });

    let parsed: any = null;
    try {
      if (fs.existsSync(reportFile)) {
        parsed = JSON.parse(fs.readFileSync(reportFile, "utf8"));
      }
    } catch {
      parsed = null;
    }

    const findings: RiskFinding[] = [];

    if (parsed?.vulnerabilities && Array.isArray(parsed.vulnerabilities)) {
      for (const v of parsed.vulnerabilities) {
        findings.push(normalizeDependencyCheckFinding(v));
      }
    } else if (
      parsed?.dependencies &&
      Array.isArray(parsed.dependencies)
    ) {
      for (const dep of parsed.dependencies) {
        if (!dep.vulnerabilities) continue;
        for (const v of dep.vulnerabilities) {
          findings.push(
            normalizeDependencyCheckFinding({
              ...v,
              packageName: dep.packageName,
              version: dep.version,
            }),
          );
        }
      }
    }

    return { ok: true, engine: "dependency-check", findings, raw: parsed };
  } catch (err) {
    return {
      ok: false,
      engine: "dependency-check",
      findings: [],
      error: String(err),
    };
  } finally {
    try {
      if (fs.existsSync(reportFile)) fs.unlinkSync(reportFile);
      fs.rmdirSync(outDir);
    } catch {
      // cleanup best-effort
    }
  }
}
