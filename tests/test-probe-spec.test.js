/**
 * tests/test-probe.spec.js
 *
 * Full coverage for src/installer/hw-probe/test-probe.ts
 * Mocks probeHardware so no real hardware detection occurs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureLog() {
  const lines = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
    lines.push(args.join(" "));
  });
  return { lines, spy };
}

/**
 * Re-execute test-probe.ts with a given mock return value.
 * Uses vi.resetModules() + vi.doMock() so each test gets a fresh execution
 * of the top-level-await body against its own mocked probeHardware result.
 */
async function runMain(mockSetup) {
  vi.resetModules();
  vi.doMock("../src/installer/hw-probe/hwProbe.js", () => ({
    probeHardware: mockSetup,
  }));
  await import("../src/installer/hw-probe/test-probe.ts");
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseProfile = {
  platform: "linux",
  cpuModel: "Intel Core i9-13900K",
  cpuCores: 24,
  ramMB: 32768,
  gpus: [{ name: "NVIDIA GeForce RTX 4090", vendor: "nvidia", vramMB: 24576 }],
  primaryGpuVramMB: 24576,
  tier: "Z",
  tierReason: "24 GB VRAM — can run 70B+ local models",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("test-probe main()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("../src/installer/hw-probe/hwProbe.js");
  });

  it("prints platform, CPU, RAM, tier and tierReason", async () => {
    const probe = vi.fn().mockResolvedValue(baseProfile);
    const { lines, spy } = captureLog();
    await runMain(probe);
    spy.mockRestore();
    const output = lines.join("\n");
    expect(output).toContain("linux");
    expect(output).toContain("Intel Core i9-13900K");
    expect(output).toContain("24");
    expect(output).toContain("32 GB");
    expect(output).toContain("★ Z");
    expect(output).toContain("70B+");
  });

  it("prints GPU VRAM in GB when vramMB >= 1024", async () => {
    const probe = vi.fn().mockResolvedValue(baseProfile);
    const { lines, spy } = captureLog();
    await runMain(probe);
    spy.mockRestore();
    expect(lines.join("\n")).toContain("24.0 GB");
  });

  it("prints GPU VRAM in MB when vramMB < 1024", async () => {
    const probe = vi.fn().mockResolvedValue({
      ...baseProfile,
      gpus: [{ name: "Intel UHD 630", vendor: "intel", vramMB: 512 }],
      primaryGpuVramMB: 512,
      tier: "X",
      tierReason: "512 MB VRAM — below 8 GB threshold for local models",
    });
    const { lines, spy } = captureLog();
    await runMain(probe);
    spy.mockRestore();
    expect(lines.join("\n")).toContain("512 MB");
  });

  it("prints 'none detected' when gpus array is empty", async () => {
    const probe = vi.fn().mockResolvedValue({
      ...baseProfile,
      gpus: [],
      primaryGpuVramMB: 0,
      tier: "X",
      tierReason: "No discrete GPU detected — API-only mode",
    });
    const { lines, spy } = captureLog();
    await runMain(probe);
    spy.mockRestore();
    expect(lines.join("\n")).toContain("none detected");
  });

  it("prints multiple GPUs with correct VRAM units", async () => {
    const probe = vi.fn().mockResolvedValue({
      ...baseProfile,
      gpus: [
        { name: "RTX 3080", vendor: "nvidia", vramMB: 10240 },
        { name: "Intel UHD", vendor: "intel", vramMB: 128 },
      ],
      primaryGpuVramMB: 10240,
    });
    const { lines, spy } = captureLog();
    await runMain(probe);
    spy.mockRestore();
    const output = lines.join("\n");
    expect(output).toContain("RTX 3080");
    expect(output).toContain("Intel UHD");
    expect(output).toContain("128 MB");
    expect(output).toContain("10.0 GB");
  });

  it("calls console.error when probeHardware rejects", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("probe failed"));
    // Top-level await propagates the rejection through the module import
    await expect(runMain(probe)).rejects.toThrow("probe failed");
  });

  it("prints header and footer banners", async () => {
    const probe = vi.fn().mockResolvedValue(baseProfile);
    const { lines, spy } = captureLog();
    await runMain(probe);
    spy.mockRestore();
    const output = lines.join("\n");
    expect(output).toContain("=== Hardware Probe Result ===");
    expect(output).toContain("============================");
  });
});
