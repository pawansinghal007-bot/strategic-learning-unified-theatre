const fs = require("node:fs");
const path = require("node:path");

const runbookPath = path.resolve(
  __dirname,
  "../docs/chaos-resilience-runbook.md",
);
const runbook = fs.readFileSync(runbookPath, "utf8");

describe("Chaos resilience runbook", () => {
  it("includes the required runbook sections and references", () => {
    expect(runbook).toContain("SLO Targets");
    expect(
      (runbook.match(/automatic recovery/g) || []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      (runbook.match(/manual intervention/g) || []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(runbook).toContain("npm run test:chaos");
    expect(runbook).toContain(".github/workflows/chaos.yml");
  });
});
