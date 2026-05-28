import fs from "node:fs";
import path from "node:path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const utils = require("../scripts/chaos/utils.js");

describe("chaos utils", () => {
  it("parseHealthOk returns true for healthy JSON shapes", () => {
    expect(utils.parseHealthOk(JSON.stringify({ overall: "ok" }))).toBe(true);
    expect(utils.parseHealthOk(JSON.stringify({ overall: "healthy" }))).toBe(
      true,
    );
    expect(utils.parseHealthOk(JSON.stringify({ status: "ok" }))).toBe(true);
  });

  it("parseHealthOk returns false for degraded or invalid JSON", () => {
    expect(utils.parseHealthOk(JSON.stringify({ overall: "degraded" }))).toBe(
      false,
    );
    expect(utils.parseHealthOk("not json")).toBe(false);
    expect(utils.parseHealthOk("")).toBe(false);
  });

  it("computeFailureRate calculates total, failures, and percentage", () => {
    expect(utils.computeFailureRate([])).toEqual({
      total: 0,
      failures: 0,
      pct: 0,
    });
    expect(utils.computeFailureRate([{ ok: true }, { ok: false }])).toEqual({
      total: 2,
      failures: 1,
      pct: 50,
    });
    expect(utils.computeFailureRate([{ ok: true }, { ok: true }])).toEqual({
      total: 2,
      failures: 0,
      pct: 0,
    });
  });

  it("assertRecovery does not throw when recovery is within SLO", () => {
    expect(() => utils.assertRecovery("test", 100, 100)).not.toThrow();
    expect(() => utils.assertRecovery("test", 10, 100)).not.toThrow();
  });

  it("assertRecovery throws a formatted error on SLO violation", () => {
    expect(() => utils.assertRecovery("test", 200, 100)).toThrow(
      "[SLO VIOLATION]",
    );
  });

  it("delay resolves after approximately the requested time", async () => {
    const before = Date.now();
    await utils.delay(10);
    const after = Date.now();
    expect(after - before).toBeGreaterThanOrEqual(10);
  });

  it("createChaosHome creates a home directory with .vscode-rotator", () => {
    const chaosHome = utils.createChaosHome();
    try {
      expect(typeof chaosHome).toBe("string");
      expect(fs.existsSync(chaosHome)).toBe(true);
      expect(fs.existsSync(path.join(chaosHome, ".vscode-rotator"))).toBe(true);
    } finally {
      fs.rmSync(chaosHome, { recursive: true, force: true });
    }
  });
});
