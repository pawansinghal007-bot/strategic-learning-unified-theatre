import fs from "node:fs/promises";

const CONFIG_PATH = "./config/security-governance.json";
const QG_PATH = "./reports/sonar/quality-gate.json";
const HOTSPOTS_PATH = "./reports/sonar/hotspots.json";

async function loadJson(p) {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[check-sonar-readiness] failed to load JSON", p, e);
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

function deriveBranchProtection(config) {
  const isProtectedEnv = (
    process.env.IS_PROTECTED_BRANCH || "false"
  ).toLowerCase();
  return (
    isProtectedEnv === "true" ||
    (config.sonar &&
      Array.isArray(config.sonar.protectedBranches) &&
      config.sonar.protectedBranches.includes(process.env.BRANCH_NAME))
  );
}

function accumulateFailureReasons(status, conditions, unresolvedHotspots) {
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
  return reasons;
}

function handleProtectedBranch(reasons) {
  if (reasons.length) {
    console.error("Sonar readiness check failed (protected branch):");
    for (const r of reasons) console.error("- " + r);
    process.exit(1);
  } else {
    console.log("Sonar readiness check passed.");
    process.exit(0);
  }
}

function handleNonProtectedBranch(reasons) {
  if (reasons.length) {
    console.warn("Sonar readiness check warnings (non-protected branch):");
    for (const r of reasons) console.warn("- " + r);
  } else {
    console.log("Sonar readiness check passed.");
  }
  process.exit(0);
}

async function main() {
  try {
    const config = (await loadJson(CONFIG_PATH)) || {};
    const qg = (await loadJson(QG_PATH)) || {
      projectStatus: { status: "UNKNOWN", conditions: [] },
    };
    const hotspots = (await loadJson(HOTSPOTS_PATH)) || { hotspots: [] };

    const isProtectedBranch = deriveBranchProtection(config);

    const status = qg.projectStatus?.status || "UNKNOWN";
    const conditions = summarizeConditions(qg.projectStatus?.conditions);

    const unresolvedHotspots = (hotspots.hotspots || []).length;
    const reasons = accumulateFailureReasons(
      status,
      conditions,
      unresolvedHotspots,
    );

    if (isProtectedBranch) {
      handleProtectedBranch(reasons);
    } else {
      handleNonProtectedBranch(reasons);
    }
  } catch (err) {
    console.error(
      "Error during Sonar readiness check:",
      err?.message ? err.message : err,
    );
    process.exit(2);
  }
}

await main();
