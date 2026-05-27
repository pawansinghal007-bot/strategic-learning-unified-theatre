import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("os", () => ({
  platform: vi.fn(() => "linux"),
  cpus: vi.fn(() => Array(8).fill({ model: "Intel Core i9" })),
  totalmem: vi.fn(() => 32 * 1024 * 1024 * 1024),
}));

const mockExecSync = vi.fn();
vi.mock("child_process", () => ({ execSync: mockExecSync }));

import { probeHardware } from "./hwProbe";

function nvidiaOutput(lines: string) {
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd.includes("nvidia-smi")) return lines;
    throw new Error("not nvidia-smi");
  });
}

describe("hwProbe — tier classification", () => {
  beforeEach(() => mockExecSync.mockReset());

  it("classifies Tier Z for 24 GB VRAM", async () => {
    nvidiaOutput("NVIDIA GeForce RTX 4090, 24576");
    const p = await probeHardware();
    expect(p.tier).toBe("Z");
    expect(p.primaryGpuVramMB).toBe(24576);
    expect(p.gpus[0].vendor).toBe("nvidia");
  });

  it("classifies Tier Y for 12 GB VRAM", async () => {
    nvidiaOutput("NVIDIA GeForce RTX 3060, 12288");
    const p = await probeHardware();
    expect(p.tier).toBe("Y");
  });

  it("classifies Tier X for 6 GB VRAM", async () => {
    nvidiaOutput("NVIDIA GeForce GTX 1060, 6144");
    const p = await probeHardware();
    expect(p.tier).toBe("X");
  });

  it("classifies Tier X when no GPU detected", async () => {
    mockExecSync.mockImplementation(() => { throw new Error("no gpu"); });
    const p = await probeHardware();
    expect(p.tier).toBe("X");
    expect(p.gpus).toHaveLength(0);
    expect(p.primaryGpuVramMB).toBe(0);
  });

  it("picks highest VRAM across multiple GPUs", async () => {
    nvidiaOutput("NVIDIA RTX 3080, 10240\nNVIDIA RTX 4090, 24576");
    const p = await probeHardware();
    expect(p.gpus).toHaveLength(2);
    expect(p.primaryGpuVramMB).toBe(24576);
    expect(p.tier).toBe("Z");
  });

  it("includes CPU and RAM in profile", async () => {
    nvidiaOutput("NVIDIA RTX 4090, 24576");
    const p = await probeHardware();
    expect(p.cpuCores).toBe(8);
    expect(p.ramMB).toBe(32 * 1024);
    expect(p.cpuModel).toBe("Intel Core i9");
  });

  it("never throws even if all detection fails", async () => {
    mockExecSync.mockImplementation(() => { throw new Error("total failure"); });
    await expect(probeHardware()).resolves.toBeDefined();
  });
});
