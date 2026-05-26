import fs from "node:fs";
import path from "node:path";

describe("test protection dashboard", () => {
  const dashboardPath = path.resolve("docs", "test-protection-dashboard.md");
  const dashboard = fs.readFileSync(dashboardPath, "utf8");

  it("documents the required protection sections", () => {
    expect(dashboard).toContain("Enterprise Flows");
    expect(dashboard).toContain("Coverage Gate");
    expect(dashboard).toContain("Regression Encoding Policy");
  });

  it("contains at least eight markdown table rows", () => {
    const tableRows = dashboard
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("|") && line.includes("|"));

    expect(tableRows.length).toBeGreaterThanOrEqual(8);
  });
});
