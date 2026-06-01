import fs from "fs/promises";
import Ajv from "ajv";

const CONFIG_PATH = "./config/security-governance.json";
const WAIVERS_PATH = "./docs/security/hotspots/waivers.json";

function parseDateYMD(s) {
  // Expect YYYY-MM-DD
  const p = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  return p ? new Date(s + "T00:00:00Z") : null;
}

async function main() {
  try {
    const [cfgRaw, waiversRaw] = await Promise.all([
      fs.readFile(CONFIG_PATH, "utf8"),
      fs.readFile(WAIVERS_PATH, "utf8"),
    ]);

    const config = JSON.parse(cfgRaw);
    const waivers = JSON.parse(waiversRaw);

    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(
      config.hotspotWaiverSchema || { type: "object" },
    );

    const errors = [];
    const today = new Date();

    for (const [i, w] of waivers.entries()) {
      const valid = validate(w);
      if (!valid) {
        errors.push({ index: i, errors: validate.errors });
        continue;
      }

      // expiry check
      const exp = parseDateYMD(w.expires);
      if (!exp) {
        errors.push({ index: i, message: "expires must be YYYY-MM-DD" });
        continue;
      }

      if (exp < today && w.status === "ACTIVE") {
        // mark as expired in message (do not mutate file)
        errors.push({
          index: i,
          message: `waiver expired on ${w.expires} but status is ACTIVE`,
        });
      }

      // renewal limit
      const maxRenewals =
        config.acknowledgedWaiver?.maxRenewals ||
        0;
      if (typeof w.renewalCount === "number" && w.renewalCount > maxRenewals) {
        errors.push({
          index: i,
          message: `renewalCount ${w.renewalCount} exceeds maxRenewals ${maxRenewals}`,
        });
      }
    }

    if (errors.length) {
      console.error("Waiver validation failed:");
      console.error(JSON.stringify(errors, null, 2));
      process.exit(1);
    }

    console.log("Waiver validation passed.");
    process.exit(0);
  } catch (err) {
    console.error("Error validating waivers:", err.message || err);
    process.exit(2);
  }
}

  await main();
