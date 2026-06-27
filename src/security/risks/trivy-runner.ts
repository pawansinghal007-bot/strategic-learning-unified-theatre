import { spawnSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { RiskFinding } from "./schema.js";
import { normalizeTrivyFinding } from "./parsers.js";

export async function runTrivyImage(imageRef: string): Promise<{
  ok: boolean;
  engine: "trivy";
  findings: RiskFinding[];
  raw?: unknown;
  error?: string;
}> {
  const tmp = path.join(
    os.tmpdir(),
    `trivy-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.json`,
  );

  try {
    const args = ["image", "--format", "json", "--quiet", "-o", tmp, imageRef];

    spawnSync("trivy", args, { encoding: "utf8" });

    let parsed: any = null;
    try {
      if (fs.existsSync(tmp)) {
        parsed = JSON.parse(fs.readFileSync(tmp, "utf8"));
      }
    } catch {
      parsed = null;
    }

    const findings: RiskFinding[] = [];

    if (parsed && Array.isArray(parsed.Results)) {
      for (const r of parsed.Results) {
        if (!r.Vulnerabilities) continue;
        for (const v of r.Vulnerabilities) {
          findings.push(normalizeTrivyFinding(v, r.Target));
        }
      }
    }

    return { ok: true, engine: "trivy", findings, raw: parsed };
  } catch (err) {
    /* istanbul ignore next */
    return {
      ok: false,
      engine: "trivy",
      findings: [],
      error: String(err),
    };
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // cleanup best-effort
    }
  }
}
