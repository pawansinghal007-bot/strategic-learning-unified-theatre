import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const dashboardJsPath = path.resolve("src/ui/dashboard.js");
const dashboardHtmlPath = path.resolve("src/ui/provider-dashboard.html");
const gatewayPath = path.resolve("src/llm/gateway.ts");
const ingestPath = path.resolve(
  "src/knowledge/ingest/ingest-sprint-history.ts",
);

function read(p) {
  return fs.readFileSync(p, "utf8");
}

describe("Sprint 66 remediation guard: no regression of Sprint 65 fixes", () => {
  const js = read(dashboardJsPath);

  it("zero setAttribute( calls remain in dashboard.js", () => {
    const matches = js.match(/setAttribute\(/g) || [];
    expect(matches.length).toBe(0);
  });

  it("the 3 Sprint 65 dataset fixes are still present in dashboard.js", () => {
    expect(js).toContain("dataset.complianceOutput");
    expect(js).toContain("dataset.releaseReadinessOutput");
    expect(js).toContain("dataset.releaseReadiness");
  });

  it("release-readiness-output wording locked by Sprint 65 is unchanged in HTML", () => {
    const html = read(dashboardHtmlPath);
    // Verified actual wording in provider-dashboard.html as of Sprint 65
    expect(html).toContain(
      "Release is currently blocked by a failed Sonar quality gate",
    );
    expect(html).toContain("89 open");
  });

  it("release-output idle wording locked by Sprint 65 is unchanged in HTML", () => {
    const html = read(dashboardHtmlPath);
    expect(html).toContain("Release truth idle.");
  });

  it("release-blockers-output wording locked by Sprint 65 is unchanged in HTML", () => {
    const html = read(dashboardHtmlPath);
    expect(html).toContain("Release blockers not yet verified");
  });
});

describe("Sprint 66 remediation guard: complexity extraction work", () => {
  const js = read(dashboardJsPath);

  it("extracted helper function attachIfExists exists with correct signature", () => {
    expect(js).toContain("function attachIfExists(selector, handler)");
  });

  it("extracted helper is properly implemented", () => {
    const match = js.match(
      /function attachIfExists\(selector, handler\)\s*\{[\s\S]*?const btn = document\.querySelector\(selector\);[\s\S]*?if \(btn\)\s*\{[\s\S]*?btn\.addEventListener\("click", handler\);[\s\S]*?\}/,
    );
    expect(match).not.toBeNull();
  });

  it("extracted helper is called from IIFE for multiple button handlers", () => {
    const callCount = (js.match(/attachIfExists\(/g) || []).length;
    // Helper definition + multiple calls from IIFE
    expect(callCount).toBeGreaterThan(1);
  });

  it("original IIFE still contains button event handler logic refactored to use helper", () => {
    // Verify some expected refactored patterns
    expect(js).toContain(
      "attachIfExists('[data-testid=\"capture-proof-state-btn\"]',",
    );
    expect(js).toContain(
      "attachIfExists('[data-testid=\"load-drift-history-btn\"]',",
    );
    expect(js).toContain(
      "attachIfExists('[data-testid=\"persist-demo-state-btn\"]',",
    );
  });

  it("all text strings in refactored handlers preserved unchanged", () => {
    // Sample critical strings from handlers that were refactored
    expect(js).toContain("Executive proof state captured across governance");
    expect(js).toContain("Drift review aligned with executive walkthrough");
    expect(js).toContain(
      "Demo and walkthrough state marked as persisted for restart-safe review",
    );
  });
});

describe("Sprint 66 remediation guard: TypeScript fixes", () => {
  it("gateway.ts applied nullish coalescing operator (??=) per S6606", () => {
    const ts = read(gatewayPath);
    // Verify the specific pattern at line ~570
    const match = ts.match(/_gateway\s*\?\?=\s*new Gateway\(\);/);
    expect(match).not.toBeNull();
  });

  it("gateway.ts does not use old if (!_gateway) pattern", () => {
    const ts = read(gatewayPath);
    // Verify the old pattern is gone
    expect(ts).not.toContain("if (!_gateway)");
  });

  it("ingest-sprint-history.ts converted to top-level await per async/await best practice", () => {
    const ts = read(ingestPath);
    // Verify top-level await/try/catch pattern
    const match = ts.match(
      /try\s*\{\s*await ingestSprintHistory\(\s*\{\s*baseDir\s*\}\s*\);/,
    );
    expect(match).not.toBeNull();
  });

  it("ingest-sprint-history.ts does not use .catch() pattern for top-level call", () => {
    const ts = read(ingestPath);
    // Verify the old .catch() pattern is gone from the file
    // (there might be other .catch() elsewhere, so be specific to the ingestSprintHistory call)
    const lines = ts.split("\n");
    let foundIngestCall = false;
    for (const line of lines) {
      if (line.includes("ingestSprintHistory") && line.includes("baseDir")) {
        foundIngestCall = true;
        expect(line).not.toContain(".catch(");
        break;
      }
    }
    expect(foundIngestCall).toBe(true);
  });
});
