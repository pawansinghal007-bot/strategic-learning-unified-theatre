import fs from "fs/promises";

const CONFIG_PATH = "./config/security-governance.json";
const QG_PATH = "./reports/sonar/quality-gate.json";
const HOTSPOTS_PATH = "./reports/sonar/hotspots.json";

async function loadJson(p) {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function summarizeConditions(conditions) {
  if (!Array.isArray(conditions)) return [];
  return conditions.map((c) => ({
    metric: c.metricKey || c.metric || c.key || "unknown",
    status: c.status || "UNKNOWN",
    actual: c.actualValue || c.value || null,
  }));
}

async function main() {
  try {
    const config = (await loadJson(CONFIG_PATH)) || {};
    const qg = (await loadJson(QG_PATH)) || {
      projectStatus: { status: "UNKNOWN", conditions: [] },
    };
    const hotspots = (await loadJson(HOTSPOTS_PATH)) || { hotspots: [] };

    const isProtectedEnv = (
      process.env.IS_PROTECTED_BRANCH || "false"
    ).toLowerCase();
    const isProtectedBranch =
      isProtectedEnv === "true" ||
      (config.sonar &&
        Array.isArray(config.sonar.protectedBranches) &&
        config.sonar.protectedBranches.includes(process.env.BRANCH_NAME));

    const status = (qg.projectStatus && qg.projectStatus.status) || "UNKNOWN";
    const conditions = summarizeConditions(
      qg.projectStatus && qg.projectStatus.conditions,
    );

    const unresolvedHotspots = (hotspots.hotspots || []).length;

    // Collect reasons
    const reasons = [];
    if (status !== "OK") {
      reasons.push(`Quality Gate status: ${status}`);
    }
    for (const c of conditions) {
      if (c.status && c.status !== "OK")
        reasons.push(
          `Condition ${c.metric} status ${c.status} (actual: ${c.actual})`,
        );
    }
    if (unresolvedHotspots > 0) {
      reasons.push(`${unresolvedHotspots} unresolved hotspot(s) reported`);
    }

    if (isProtectedBranch) {
      if (reasons.length) {
        console.error("Sonar readiness check failed (protected branch):");
        for (const r of reasons) console.error("- " + r);
        process.exit(1);
      } else {
        console.log("Sonar readiness check passed.");
        process.exit(0);
      }
    } else {
      if (reasons.length) {
        console.warn("Sonar readiness check warnings (non-protected branch):");
        for (const r of reasons) console.warn("- " + r);
      } else {
        console.log("Sonar readiness check passed.");
      }
      process.exit(0);
    }
  } catch (err) {
    console.error(
      "Error during Sonar readiness check:",
      err && err.message ? err.message : err,
    );
    process.exit(2);
  }
}

main();
