import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const propsPath = path.resolve("sonar-project.properties");
const pkgPath = path.resolve("package.json");

function parseProperties(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const props = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    props[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return props;
}

describe("Sprint 62 coverage configuration", () => {
  const props = parseProperties(propsPath);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const scripts = pkg.scripts || {};

  it("sonar.projectKey is set", () => {
    expect(props["sonar.projectKey"]).toBeTruthy();
    expect(props["sonar.projectKey"]).toEqual(
      "strategic-learning-unified-theatre",
    );
  });

  it("sonar.host.url is set", () => {
    expect(props["sonar.host.url"]).toBeTruthy();
    expect(props["sonar.host.url"]).toEqual("http://localhost:9000/");
  });

  it("a coverage report path property is set", () => {
    const hasCoveragePath =
      props["sonar.javascript.lcov.reportPaths"] !== undefined ||
      props["sonar.typescript.lcov.reportPaths"] !== undefined;
    expect(hasCoveragePath).toBe(true);
  });

  it("coverage report path points at lcov.info", () => {
    const coveragePath =
      props["sonar.javascript.lcov.reportPaths"] ||
      props["sonar.typescript.lcov.reportPaths"] ||
      "";
    expect(coveragePath).toContain("lcov");
    expect(coveragePath).toEqual("coverage/lcov.info");
  });

  it("sonar exclusions cover playwright-report generated output", () => {
    const exclusions = props["sonar.exclusions"] || "";
    expect(exclusions).toContain("playwright-report");
  });

  it("sonar exclusions cover test-results generated output", () => {
    const exclusions = props["sonar.exclusions"] || "";
    expect(exclusions).toContain("test-results");
  });

  it("coverage exclusions prevent generated directories from raising coverage issues", () => {
    const coverageExclusions =
      props["sonar.coverage.exclusions"] || props["sonar.exclusions"] || "";
    expect(coverageExclusions).toBeTruthy();
  });

  it("the coverage npm script includes --coverage flag", () => {
    const coverageScript =
      scripts["coverage"] || scripts["test:coverage"] || "";
    expect(coverageScript).toContain("coverage");
  });

  it("vitest.config or vite.config sets coverage provider so lcov.info is produced", () => {
    const possibleConfigs = [
      "vitest.config.ts",
      "vitest.config.js",
      "vitest.config.mts",
      "vite.config.ts",
      "vite.config.js",
    ];
    let found = false;
    for (const cfg of possibleConfigs) {
      const cfgPath = path.resolve(cfg);
      if (fs.existsSync(cfgPath)) {
        const content = fs.readFileSync(cfgPath, "utf8");
        if (content.includes("lcov") || content.includes("coverage")) {
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });
});
