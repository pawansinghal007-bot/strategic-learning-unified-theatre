import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadBaselineFingerprints } from "../../../src/security/secrets/baseline";

describe("loadBaselineFingerprints — branch coverage", () => {
  it("handles JSON object with .findings wrapper (non-array top-level)", async () => {
    // BRDA:18,5,1,0 — Array.isArray(parsed) false branch → findings path
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-test-"));
    const filePath = path.join(tmpDir, "baseline.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        findings: [{ fingerprint: "fp-001" }, { Fingerprint: "fp-002" }],
      }),
      "utf8",
    );
    const result = await loadBaselineFingerprints(filePath);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(2);
    expect(result.has("fp-001")).toBe(true);
    expect(result.has("fp-002")).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("handles plain array of fingerprint objects", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-test-"));
    const filePath = path.join(tmpDir, "baseline.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify([{ fingerprint: "fp-100" }, { Fingerprint: "fp-200" }]),
      "utf8",
    );
    const result = await loadBaselineFingerprints(filePath);
    expect(result.size).toBe(2);
    expect(result.has("fp-100")).toBe(true);
    expect(result.has("fp-200")).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns empty set when baselinePath is null", async () => {
    const result = await loadBaselineFingerprints(null);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns empty set for non-existent file", async () => {
    const result = await loadBaselineFingerprints("/nonexistent/baseline.json");
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns empty set for invalid JSON", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-test-"));
    const filePath = path.join(tmpDir, "baseline.json");
    fs.writeFileSync(filePath, "{not valid json", "utf8");
    const result = await loadBaselineFingerprints(filePath);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("skips rows with empty or missing fingerprints", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-test-"));
    const filePath = path.join(tmpDir, "baseline.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify([
        { fingerprint: "valid-fp" },
        { fingerprint: "" },
        { fingerprint: "  " },
        {},
      ]),
      "utf8",
    );
    const result = await loadBaselineFingerprints(filePath);
    expect(result.size).toBe(1);
    expect(result.has("valid-fp")).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
