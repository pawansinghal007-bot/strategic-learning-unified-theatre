/**
 * tests/test-probe.spec.js
 *
 * Full coverage for src/installer/hw-probe/test-probe.ts
 * Mocks probeHardware so no real hardware detection occurs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock probeHardware ────────────────────────────────────────────────────────

import { probeHardware } from "../src/installer/hw-probe/hwProbe";

const mockedProbeHardware = vi.hoisted(() => vi.fn());

vi.mock("../src/installer/hw-probe/hwProbe", () => ({
  probeHardware: mockedProbeHardware,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureLog() {
  const lines = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
    lines.push(args.join(" "));
  });
  return { lines, spy };
}

async function runMain() {
  vi.resetModules();
  await import("../src/installer/hw-probe/test-probe");
  await new Promise((r) => setTimeout(r, 0));
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints platform, CPU, RAM, tier and tierReason", async () => {
    mockedProbeHardware.mockResolvedValue(baseProfile);
    const { lines, spy } = captureLog();
    await runMain();
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
    mockedProbeHardware.mockResolvedValue(baseProfile);
    const { lines, spy } = captureLog();
    await runMain();
    spy.mockRestore();
    expect(lines.join("\n")).toContain("24.0 GB");
  });

  it("prints GPU VRAM in MB when vramMB < 1024", async () => {
    mockedProbeHardware.mockResolvedValue({
      ...baseProfile,
      gpus: [{ name: "Intel UHD 630", vendor: "intel", vramMB: 512 }],
      primaryGpuVramMB: 512,
      tier: "X",
      tierReason: "512 MB VRAM — below 8 GB threshold for local models",
    });
    const { lines, spy } = captureLog();
    await runMain();
    spy.mockRestore();
    expect(lines.join("\n")).toContain("512 MB");
  });

  it("prints 'none detected' when gpus array is empty", async () => {
    mockedProbeHardware.mockResolvedValue({
      ...baseProfile,
      gpus: [],
      primaryGpuVramMB: 0,
      tier: "X",
      tierReason: "No discrete GPU detected — API-only mode",
    });
    const { lines, spy } = captureLog();
    await runMain();
    spy.mockRestore();
    expect(lines.join("\n")).toContain("none detected");
  });

  it("prints multiple GPUs with correct VRAM units", async () => {
    mockedProbeHardware.mockResolvedValue({
      ...baseProfile,
      gpus: [
        { name: "RTX 3080", vendor: "nvidia", vramMB: 10240 },
        { name: "Intel UHD", vendor: "intel", vramMB: 128 },
      ],
      primaryGpuVramMB: 10240,
    });
    const { lines, spy } = captureLog();
    await runMain();
    spy.mockRestore();
    const output = lines.join("\n");
    expect(output).toContain("RTX 3080");
    expect(output).toContain("Intel UHD");
    expect(output).toContain("128 MB");
    expect(output).toContain("10.0 GB");
  });

  it("calls console.error when probeHardware rejects", async () => {
    mockedProbeHardware.mockRejectedValue(new Error("probe failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runMain();
    await new Promise((r) => setTimeout(r, 10));
    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    errorSpy.mockRestore();
  });

  it("prints header and footer banners", async () => {
    mockedProbeHardware.mockResolvedValue(baseProfile);
    const { lines, spy } = captureLog();
    await runMain();
    spy.mockRestore();
    const output = lines.join("\n");
    expect(output).toContain("=== Hardware Probe Result ===");
    expect(output).toContain("============================");
  });
});
