import { createRequire } from "module";
const require = createRequire(import.meta.url);
const slo = require("../../scripts/chaos/slo.js");

describe("chaos SLO configuration", () => {
  it("exports valid numeric recovery and load thresholds", () => {
    expect(typeof slo.daemonCrashRecoveryMs).toBe("number");
    expect(slo.daemonCrashRecoveryMs).toBeGreaterThan(0);

    expect(typeof slo.configCorruptionRecoveryMs).toBe("number");
    expect(slo.configCorruptionRecoveryMs).toBeGreaterThan(0);

    expect(typeof slo.burstLoadMaxErrorPct).toBe("number");
    expect(slo.burstLoadMaxErrorPct).toBeGreaterThanOrEqual(0);
    expect(slo.burstLoadMaxErrorPct).toBeLessThanOrEqual(100);

    expect(typeof slo.healthPollIntervalMs).toBe("number");
    expect(slo.healthPollIntervalMs).toBeGreaterThan(0);

    expect(typeof slo.postBurstHealthTimeoutMs).toBe("number");
    expect(slo.postBurstHealthTimeoutMs).toBeGreaterThan(0);

    expect(slo.burstLoad).toBeDefined();
    expect(typeof slo.burstLoad.functionalRuns).toBe("number");
    expect(slo.burstLoad.functionalRuns).toBeGreaterThanOrEqual(1);
    expect(typeof slo.burstLoad.regressionRuns).toBe("number");
    expect(slo.burstLoad.regressionRuns).toBeGreaterThanOrEqual(1);
  });
});
