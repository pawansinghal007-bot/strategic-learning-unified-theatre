import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  loadSecuritySuppressions,
  saveSecuritySuppressions,
} from "../../../src/security/security-overview/suppressions";

describe("loadSecuritySuppressions — branch coverage", () => {
  it("returns empty array when JSON is not an array (object wrapper)", () => {
    // BRDA:18,0,1,0 — Array.isArray(parsed) false branch
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supp-test-"));
    const filePath = path.join(tmpDir, "suppressions.json");
    fs.writeFileSync(filePath, JSON.stringify({ findings: [] }), "utf8");
    const result = loadSecuritySuppressions(filePath);
    expect(result).toEqual([]);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns suppressions when JSON is a valid array", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supp-test-"));
    const filePath = path.join(tmpDir, "suppressions.json");
    const suppressions = [{ fingerprint: "fp-1", kind: "secret" }];
    fs.writeFileSync(filePath, JSON.stringify(suppressions), "utf8");
    const result = loadSecuritySuppressions(filePath);
    expect(result).toEqual(suppressions);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns empty array for non-existent file", () => {
    const result = loadSecuritySuppressions(
      "/nonexistent/path/suppressions.json",
    );
    expect(result).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supp-test-"));
    const filePath = path.join(tmpDir, "suppressions.json");
    fs.writeFileSync(filePath, "{invalid json", "utf8");
    const result = loadSecuritySuppressions(filePath);
    expect(result).toEqual([]);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("saveSecuritySuppressions", () => {
  it("saves suppressions and returns correct count", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supp-test-"));
    const filePath = path.join(tmpDir, "suppressions.json");
    const suppressions = [{ fingerprint: "fp-1", kind: "risk" }];
    const result = saveSecuritySuppressions(filePath, suppressions);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.filePath).toBe(filePath);
    const raw = fs.readFileSync(filePath, "utf8");
    expect(JSON.parse(raw)).toEqual(suppressions);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
