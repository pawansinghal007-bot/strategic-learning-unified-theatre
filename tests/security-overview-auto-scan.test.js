import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const mocks = vi.hoisted(() => ({
  runSecretsScan: vi.fn(),
  runDependencyCheck: vi.fn(),
  runTrivyImage: vi.fn(),
}));

vi.mock("../src/security/secrets/index.js", () => ({
  runSecretsScan: mocks.runSecretsScan,
}));

vi.mock("../src/security/risks/index.js", () => ({
  runDependencyCheck: mocks.runDependencyCheck,
  runTrivyImage: mocks.runTrivyImage,
}));

describe("Sprint 82 — auto-scan module unit tests", () => {
  const tmpDir = path.join(os.tmpdir(), `auto-scan-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });

    mocks.runSecretsScan.mockReset();
    mocks.runDependencyCheck.mockReset();
    mocks.runTrivyImage.mockReset();
    mocks.runSecretsScan.mockResolvedValue({ findings: [] });
    mocks.runDependencyCheck.mockResolvedValue({ findings: [] });
    mocks.runTrivyImage.mockResolvedValue(null);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("runSecurityAutoScan works with missing workspaceId (uses null)", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");

    const result = await runSecurityAutoScan({
      workspaceId: undefined,
      repoPath: tmpDir,
    });

    expect(result.ok).toBe(true);
    expect(result.workspaceId).toBeUndefined();
  });

  it("runSecurityAutoScan works with nonexistent repoPath (returns empty findings)", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");

    const result = await runSecurityAutoScan({
      workspaceId: "test-ws",
      repoPath: "/nonexistent/path/that/does/not/exist",
    });

    expect(result.ok).toBe(true);
    expect(result.secretsResult).toEqual({ findings: [] });
    expect(result.risksDependencyResult).toEqual({ findings: [] });
  });

  it("runSecurityAutoScan works with nonexistent baselinePath (returns empty baseline)", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");

    const result = await runSecurityAutoScan({
      workspaceId: "test-ws",
      repoPath: tmpDir,
      baselinePath: "/nonexistent/baseline.json",
    });

    expect(result.ok).toBe(true);
    expect(result.drift).toBeDefined();
    expect(result.drift?.baselineLoaded).toBe(false);
  });

  it("runSecurityAutoScan works with minimal options", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");

    const result = await runSecurityAutoScan({
      workspaceId: "test-ws",
      repoPath: tmpDir,
    });

    if (!result.ok) {
      console.log("Auto-scan error:", result.error);
    }
    expect(result.ok).toBe(true);
    expect(result.workspaceId).toBe("test-ws");
    expect(result.secretsResult).toEqual({ findings: [] });
    expect(result.risksDependencyResult).toEqual({ findings: [] });
    expect(result.risksImageResult).toBeNull();
  });

  it("runSecurityAutoScan appends drift history when driftHistoryPath provided", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");
    const driftHistoryPath = path.join(tmpDir, "drift-history.json");
    const baselinePath = path.join(tmpDir, "baseline.json");

    // Create a minimal baseline file
    fs.writeFileSync(
      baselinePath,
      JSON.stringify({ findings: [], snapshot: {} }),
    );

    const result = await runSecurityAutoScan({
      workspaceId: "test-ws",
      repoPath: tmpDir,
      baselinePath,
      driftHistoryPath,
    });

    if (!result.ok) {
      console.log("Auto-scan error:", result.error);
    }
    expect(result.ok).toBe(true);
    expect(result.driftHistoryAppend).toBeDefined();
    expect(result.driftHistoryAppend?.filePath).toBe(driftHistoryPath);
    expect(result.driftHistoryAppend?.count).toBeGreaterThan(0);

    // Verify file was created
    expect(fs.existsSync(driftHistoryPath)).toBe(true);
  });

  it("runSecurityAutoScan returns drift result when baselinePath provided", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");

    // Create a minimal baseline file
    const baselinePath = path.join(tmpDir, "baseline.json");
    fs.writeFileSync(
      baselinePath,
      JSON.stringify({
        findings: [],
        snapshot: {},
      }),
    );

    const result = await runSecurityAutoScan({
      workspaceId: "test-ws",
      repoPath: tmpDir,
      baselinePath,
    });

    if (!result.ok) {
      console.log("Auto-scan error:", result.error);
    }
    expect(result.ok).toBe(true);
    expect(result.drift).toBeDefined();
  });

  it("runSecurityAutoScan handles suppressions and triage paths", async () => {
    const { runSecurityAutoScan } =
      await import("../src/security/security-overview/auto-scan.js");

    const suppressionsPath = path.join(tmpDir, "suppressions.json");
    const triagePath = path.join(tmpDir, "triage.json");

    // Create empty files
    fs.writeFileSync(suppressionsPath, JSON.stringify({}));
    fs.writeFileSync(triagePath, JSON.stringify({}));

    const result = await runSecurityAutoScan({
      workspaceId: "test-ws",
      repoPath: tmpDir,
      suppressionsPath,
      triagePath,
    });

    if (!result.ok) {
      console.log("Auto-scan error:", result.error);
    }
    expect(result.ok).toBe(true);
  });
});
