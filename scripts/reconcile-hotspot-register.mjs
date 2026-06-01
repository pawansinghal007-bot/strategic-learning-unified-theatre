import fs from "fs/promises";

const WAIVERS_PATH = "./docs/security/hotspots/waivers.json";
const HOTSPOTS_PATH = "./reports/sonar/hotspots.json";
const METADATA_PATH = "./reports/sonar/metadata.json";
const OUT_PATH = "./reports/sonar/reconciliation-audit.json";

function extractKeyFromHotspot(h) {
  return (
    h.hotspotKey ||
    h.key ||
    h.rule ||
    h.component ||
    h.hash ||
    JSON.stringify(h)
  );
}

async function main() {
  try {
    const [waiversRaw, hotspotsRaw, metadataRaw] = await Promise.all([
      fs.readFile(WAIVERS_PATH, "utf8"),
      fs.readFile(HOTSPOTS_PATH, "utf8").catch(() => "{}"),
      fs.readFile(METADATA_PATH, "utf8").catch(() => "{}"),
    ]);

    const waivers = JSON.parse(waiversRaw || "[]");
    const hotspotsData = JSON.parse(hotspotsRaw || "{}");
    const metadata = JSON.parse(metadataRaw || "{}");

    const waiverKeys = waivers.map((w) => w.hotspotKey).filter(Boolean);
    const waiverSet = new Set(waiverKeys);

    const hotspots = hotspotsData.hotspots || [];
    const sonarKeys = hotspots.map(extractKeyFromHotspot).filter(Boolean);
    const sonarSet = new Set(sonarKeys);

    const missingInRegister = sonarKeys.filter((k) => !waiverSet.has(k));
    const staleInRegister = waiverKeys.filter((k) => !sonarSet.has(k));

    const audit = {
      analyzedAt: new Date().toISOString(),
      projectKey: metadata.projectKey || metadata.project || "unknown",
      branch: metadata.branch || metadata.ref || "unknown",
      sonarKeysCount: sonarKeys.length,
      waiverKeysCount: waiverKeys.length,
      missingInRegister,
      staleInRegister,
      reconciliationPassed:
        missingInRegister.length === 0 && staleInRegister.length === 0,
      provenance: {
        executedBy: process.env.USER || process.env.LOGNAME || "local",
        nodeVersion: process.version,
        env: {
          GITHUB_RUN_ID: process.env.GITHUB_RUN_ID || null,
          GITHUB_RUN_NUMBER: process.env.GITHUB_RUN_NUMBER || null,
        },
      },
    };

    await fs.mkdir("./reports/sonar", { recursive: true });
    await fs.writeFile(OUT_PATH, JSON.stringify(audit, null, 2), "utf8");

    console.log("Reconciliation audit written to", OUT_PATH);
    process.exit(0);
  } catch (err) {
    console.error(
      "Error running reconciliation:",
      err?.message ? err.message : err,
    );
    process.exit(2);
  }
}

main();
