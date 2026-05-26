import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Chaos runner entrypoint", () => {
  it("imports all three chaos scenario modules", () => {
    const filePath = path.resolve(
      __dirname,
      "../..",
      "scripts/chaos/run-chaos.js",
    );
    const content = fs.readFileSync(filePath, "utf8");

    expect(content).toContain('require("./scenarios/kill-daemon")');
    expect(content).toContain('require("./scenarios/corrupt-config")');
    expect(content).toContain('require("./scenarios/burst-load")');
  });

  it("handles the --scenario flag and exits after summary", () => {
    const filePath = path.resolve(
      __dirname,
      "../..",
      "scripts/chaos/run-chaos.js",
    );
    const content = fs.readFileSync(filePath, "utf8");

    expect(content).toContain("--scenario");
    expect(content).toContain("process.exit");
  });
});

describe("Root package scripts", () => {
  it("defines chaos runner npm scripts", () => {
    const packagePath = path.resolve(__dirname, "../..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const scripts = packageJson.scripts || {};

    expect(scripts["test:chaos"]).toBe("node ./scripts/chaos/run-chaos.js");
    expect(scripts["test:chaos:kill-daemon"]).toBe(
      "node ./scripts/chaos/run-chaos.js --scenario kill-daemon",
    );
    expect(scripts["test:chaos:corrupt-config"]).toBe(
      "node ./scripts/chaos/run-chaos.js --scenario corrupt-config",
    );
    expect(scripts["test:chaos:burst-load"]).toBe(
      "node ./scripts/chaos/run-chaos.js --scenario burst-load",
    );
  });
});
