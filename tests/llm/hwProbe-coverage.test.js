/**
 * Coverage additions for hwProbe.js
 *
 * @vitest-environment node
 *
 * - inferVendor() - all vendor detection paths
 * - parseVramString() / tryParseVramAt() - VRAM string parsing
 * - detectGpusLinux() - nvidia-smi success + lspci fallback
 * - detectGpusMacos() - system_profiler success + Apple Silicon fallback
 * - detectGpusWindows() - nvidia-smi success + PowerShell fallback
 * - classifyTier() - all tier branches
 * - probeHardware() - full integration
 *
 * Strategy: single top-level vi.mock for node:child_process and node:os;
 * per-test behavior is controlled by reconfiguring mockExecFileSync /
 * so hwProbe.js is re-evaluated with the current mock implementation).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Top-level mock functions — declared with vi.hoisted() so they are
// available when the vi.mock factories are executed (which are hoisted
// before any import/const statements).
const { mockExecFileSync, mockPlatform } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockPlatform: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, execFileSync: mockExecFileSync };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, platform: mockPlatform };
});

// ─── Pure-function tests (no mocking needed) ─────────────────────────────────

import {
  inferVendor,
  parseVramString,
  classifyTier,
  probeHardware,
} from "../../src/installer/hw-probe/hwProbe.js";

describe("hwProbe coverage — inferVendor", () => {
  it("detects nvidia from various name patterns", () => {
    expect(inferVendor("NVIDIA GeForce RTX 3080")).toBe("nvidia");
    expect(inferVendor("GTX 1080 Ti")).toBe("nvidia");
    expect(inferVendor("RTX A6000")).toBe("nvidia");
    expect(inferVendor("Quadro P2000")).toBe("nvidia");
    expect(inferVendor("Tesla V100")).toBe("nvidia");
  });

  it("detects amd from various name patterns", () => {
    expect(inferVendor("AMD Radeon RX 6800")).toBe("amd");
    expect(inferVendor("Radeon RX 7900 XTX")).toBe("amd");
    expect(inferVendor("AMD FirePro W7100")).toBe("amd");
  });

  it("detects intel from various name patterns", () => {
    expect(inferVendor("Intel UHD Graphics 630")).toBe("intel");
    expect(inferVendor("Intel Iris Xe Graphics")).toBe("intel");
    expect(inferVendor("Intel Arc A770")).toBe("intel");
  });

  it("detects apple from name patterns", () => {
    expect(inferVendor("Apple M1")).toBe("apple");
    expect(inferVendor("Apple M2 Pro")).toBe("apple");
    expect(inferVendor("Apple M3 Max")).toBe("apple");
  });

  it("returns unknown for unrecognized names", () => {
    expect(inferVendor("Some Unknown GPU")).toBe("unknown");
    expect(inferVendor("")).toBe("unknown");
  });
});

describe("hwProbe coverage — parseVramString", () => {
  it("parses GB values", () => {
    expect(parseVramString("16 GB")).toBe(16384);
    expect(parseVramString("8 GB")).toBe(8192);
    expect(parseVramString("24 GB")).toBe(24576);
  });

  it("parses MB values", () => {
    expect(parseVramString("8192 MB")).toBe(8192);
    expect(parseVramString("4096 MB")).toBe(4096);
    expect(parseVramString("2048 MB")).toBe(2048);
  });

  it("parses decimal GB values", () => {
    expect(parseVramString("2.5 GB")).toBe(2560);
    expect(parseVramString("1.5 GB")).toBe(1536);
  });

  it("returns 0 for unrecognised formats", () => {
    expect(parseVramString("unknown")).toBe(0);
    expect(parseVramString("")).toBe(0);
    expect(parseVramString("123")).toBe(0);
  });
});

describe("hwProbe coverage — classifyTier", () => {
  it("returns Z tier for >= 20 GB VRAM", () => {
    const result = classifyTier(24576, 64 * 1024);
    expect(result.tier).toBe("Z");
    expect(result.tierReason).toContain("24576 MB VRAM");
  });

  it("returns Z tier for exactly 20 GB VRAM", () => {
    const result = classifyTier(20480, 32 * 1024);
    expect(result.tier).toBe("Z");
  });

  it("returns Y tier for 8-19 GB VRAM", () => {
    const result = classifyTier(12288, 32 * 1024);
    expect(result.tier).toBe("Y");
    expect(result.tierReason).toContain("12288 MB VRAM");
  });

  it("returns Y tier for exactly 8 GB VRAM", () => {
    const result = classifyTier(8192, 32 * 1024);
    expect(result.tier).toBe("Y");
  });

  it("returns X tier with GPU when < 8 GB VRAM", () => {
    const result = classifyTier(4096, 32 * 1024);
    expect(result.tier).toBe("X");
    expect(result.tierReason).toContain("4096 MB VRAM");
  });

  it("returns X tier with no GPU and high RAM", () => {
    const result = classifyTier(0, 64 * 1024);
    expect(result.tier).toBe("X");
    expect(result.tierReason).toContain("No discrete GPU");
  });

  it("returns X tier with no GPU and low RAM", () => {
    const result = classifyTier(0, 8 * 1024);
    expect(result.tier).toBe("X");
    expect(result.tierReason).toContain("No discrete GPU");
  });
});

// ─── probeHardware tests — dynamic import with per-test module reset ──────────

describe("hwProbe coverage — detectGpusLinux via probeHardware", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockPlatform.mockReset();
  });

  afterEach(() => {
  });

  it("returns GPUs when nvidia-smi succeeds", async () => {
    mockPlatform.mockReturnValue("linux");
    mockExecFileSync.mockReturnValue(
      "NVIDIA GeForce RTX 3080, 10240\nNVIDIA GeForce RTX 3090, 24576\n",
    );

    const profile = await probeHardware();

    expect(profile.platform).toBe("linux");
    expect(profile.gpus.length).toBe(2);
    expect(profile.gpus[0].name).toBe("NVIDIA GeForce RTX 3080");
    expect(profile.gpus[0].vendor).toBe("nvidia");
    expect(profile.gpus[0].vramMB).toBe(10240);
    expect(profile.gpus[1].vramMB).toBe(24576);
    expect(profile.primaryGpuVramMB).toBe(24576);
    expect(profile.tier).toBe("Z");
  });

  it("falls back to lspci when nvidia-smi fails", async () => {
    mockPlatform.mockReturnValue("linux");
    mockExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("nvidia-smi not found");
      })
      .mockReturnValue(
        "00:02.0 VGA compatible controller: NVIDIA Corporation GP104\n" +
          "00:03.0 3D controller: NVIDIA Corporation Tesla V100",
      );

    const profile = await probeHardware();

    expect(profile.gpus.length).toBeGreaterThanOrEqual(1);
    expect(profile.gpus[0].vendor).toBe("nvidia");
    expect(profile.gpus[0].vramMB).toBe(0); // lspci doesn't report VRAM
  });

  it("returns empty GPU list when both nvidia-smi and lspci fail", async () => {
    mockPlatform.mockReturnValue("linux");
    mockExecFileSync.mockImplementation(() => {
      throw new Error("command not found");
    });

    const profile = await probeHardware();

    expect(profile.gpus).toEqual([]);
    expect(profile.primaryGpuVramMB).toBe(0);
    expect(profile.tier).toBe("X");
  });
});

describe("hwProbe coverage — detectGpusMacos via probeHardware", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockPlatform.mockReset();
  });

  afterEach(() => {
  });

  it("returns GPUs when system_profiler succeeds", async () => {
    mockPlatform.mockReturnValue("darwin");
    mockExecFileSync.mockReturnValue(
      JSON.stringify({
        SPDisplaysDataType: [
          { sppci_model: "Apple M1 Pro", spdisplays_vram: "16 GB" },
        ],
      }),
    );

    const profile = await probeHardware();

    expect(profile.platform).toBe("darwin");
    expect(profile.gpus.length).toBe(1);
    expect(profile.gpus[0].name).toBe("Apple M1 Pro");
    expect(profile.gpus[0].vendor).toBe("apple");
    expect(profile.gpus[0].vramMB).toBe(16384);
  });

  it("falls back to Apple Silicon detection when system_profiler fails", async () => {
    mockPlatform.mockReturnValue("darwin");
    mockExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("system_profiler failed");
      })
      .mockReturnValueOnce("16106127360") // hw.memsize in bytes
      .mockReturnValueOnce("Apple M1 Pro"); // machdep.cpu.brand_string

    const profile = await probeHardware();

    expect(profile.gpus.length).toBe(1);
    expect(profile.gpus[0].vendor).toBe("apple");
    expect(profile.gpus[0].vramMB).toBe(15360); // 16106127360 / 1024 / 1024 ≈ 15360
  });

  it("returns empty GPU list when both methods fail", async () => {
    mockPlatform.mockReturnValue("darwin");
    mockExecFileSync.mockImplementation(() => {
      throw new Error("command not found");
    });

    const profile = await probeHardware();

    expect(profile.gpus).toEqual([]);
    expect(profile.primaryGpuVramMB).toBe(0);
  });
});

describe("hwProbe coverage — detectGpusWindows via probeHardware", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockPlatform.mockReset();
  });

  afterEach(() => {
  });

  it("returns GPUs when nvidia-smi succeeds", async () => {
    mockPlatform.mockReturnValue("win32");
    mockExecFileSync.mockReturnValue("NVIDIA GeForce RTX 4090, 24576\n");

    const profile = await probeHardware();

    expect(profile.platform).toBe("win32");
    expect(profile.gpus.length).toBe(1);
    expect(profile.gpus[0].name).toBe("NVIDIA GeForce RTX 4090");
    expect(profile.gpus[0].vendor).toBe("nvidia");
    expect(profile.gpus[0].vramMB).toBe(24576);
  });

  it("falls back to PowerShell when nvidia-smi fails", async () => {
    mockPlatform.mockReturnValue("win32");
    mockExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("nvidia-smi not found");
      })
      .mockReturnValue(
        JSON.stringify([
          { Name: "NVIDIA GeForce RTX 3080", AdapterRAM: 1073741824 },
        ]),
      );

    const profile = await probeHardware();

    expect(profile.gpus.length).toBe(1);
    expect(profile.gpus[0].name).toBe("NVIDIA GeForce RTX 3080");
    expect(profile.gpus[0].vramMB).toBe(1024); // 1073741824 / 1024 / 1024
  });

  it("falls back to PowerShell with a single GPU object", async () => {
    mockPlatform.mockReturnValue("win32");
    mockExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("nvidia-smi not found");
      })
      .mockReturnValue(
        JSON.stringify({ Name: "NVIDIA GeForce RTX 3080", AdapterRAM: 2147483648 }),
      );

    const profile = await probeHardware();

    expect(profile.gpus.length).toBe(1);
    expect(profile.gpus[0].name).toBe("NVIDIA GeForce RTX 3080");
    expect(profile.gpus[0].vramMB).toBe(2048);
  });

  it("returns empty GPU list when both methods fail", async () => {
    mockPlatform.mockReturnValue("win32");
    mockExecFileSync.mockImplementation(() => {
      throw new Error("command not found");
    });

    const profile = await probeHardware();

    expect(profile.gpus).toEqual([]);
    expect(profile.primaryGpuVramMB).toBe(0);
  });
});

describe("hwProbe coverage — probeHardware unknown platform", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockPlatform.mockReset();
  });

  afterEach(() => {
  });

  it("returns empty GPU list for unknown platform", async () => {
    mockPlatform.mockReturnValue("freebsd");
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not supported");
    });

    const profile = await probeHardware();

    expect(profile.platform).toBe("freebsd");
    expect(profile.gpus).toEqual([]);
    expect(profile.primaryGpuVramMB).toBe(0);
    expect(profile.tier).toBe("X");
  });
});

describe("hwProbe coverage — probeHardware integration", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockPlatform.mockReset();
  });

  afterEach(() => {
  });

  it("returns full hardware profile on linux with nvidia-smi", async () => {
    mockPlatform.mockReturnValue("linux");
    mockExecFileSync.mockReturnValue("NVIDIA A100-SXM4-40GB, 40960\n");

    const profile = await probeHardware();

    expect(profile.platform).toBe("linux");
    expect(profile.cpuCores).toBeGreaterThan(0);
    expect(profile.cpuModel).toBeTruthy();
    expect(profile.ramMB).toBeGreaterThan(0);
    expect(profile.gpus.length).toBe(1);
    expect(profile.gpus[0].vendor).toBe("nvidia");
    expect(profile.primaryGpuVramMB).toBe(40960);
    expect(profile.tier).toBe("Z");
    expect(profile.tierReason).toBeTruthy();
  });

  it("returns full hardware profile on darwin with Apple Silicon", async () => {
    mockPlatform.mockReturnValue("darwin");
    mockExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("system_profiler failed");
      })
      .mockReturnValueOnce("34359738368") // 32 GB
      .mockReturnValueOnce("Apple M3 Max");

    const profile = await probeHardware();

    expect(profile.platform).toBe("darwin");
    expect(profile.gpus.length).toBe(1);
    expect(profile.gpus[0].vendor).toBe("apple");
    expect(profile.primaryGpuVramMB).toBe(32768);
    expect(profile.tier).toBe("Z");
  });
});
