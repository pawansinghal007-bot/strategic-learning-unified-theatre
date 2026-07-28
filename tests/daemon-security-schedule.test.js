import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("daemon security schedule", () => {
  it("schedules security auto-scans with a dedicated interval and cleans it up", () => {
    const content = read("src/daemon/daemon-runner.js");

    expect(content).toContain("const SECURITY_SCAN_INTERVAL_MS");
    expect(content).toContain(
      'import { runSecurityAutoScan } from "../security/security-overview/auto-scan.js"',
    );
    expect(content.match(/setInterval\(/g)?.length || 0).toBe(2);
    expect(content).toContain("}, 60_000);");
    expect(content).toContain("startSecurityScanLoop()");
    expect(content).toContain("securityScanTimer.unref?.();");
    expect(content).toContain("if (securityScanTimer) {");
    expect(content).toContain("clearInterval(securityScanTimer);");
    expect(content).toContain("securityScanTimer = null;");
  });
});
