/**
 * src/installer/hw-probe/hwProbe.spec.ts
 *
 * Full branch and line coverage for hwProbe.ts.
 * All child_process and os calls are mocked so no real hardware
 * detection happens — tests run identically on every CI platform.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as os from "node:os";
import * as child_process from "node:child_process";

// ── Module-level mocks ────────────────────────────────────────────────────────

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    platform: vi.fn().mockReturnValue("linux"),
    cpus: vi
      .fn()
      .mockReturnValue([
        { model: "Mock CPU @ 3.0GHz" },
        { model: "Mock CPU @ 3.0GHz" },
        { model: "Mock CPU @ 3.0GHz" },
        { model: "Mock CPU @ 3.0GHz" },
      ]),
    totalmem: vi.fn().mockReturnValue(32 * 1024 * 1024 * 1024), // 32 GB
  };
});

vi.mock("node:child_process", () => {
  const mockExec = vi.fn();
  return {
    execFileSync: mockExec,
    default: { execFileSync: mockExec },
  };
});

const mockedExecFileSync = vi.mocked(child_process.execFileSync);
const mockedPlatform = vi.mocked(os.platform);
const mockedCpus = vi.mocked(os.cpus);
const mockedTotalmem = vi.mocked(os.totalmem);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Re-import the module fresh for each test to reset module state */
async function importProbe() {
  vi.resetModules();
  return await import("./hwProbe");
}

/** Build a macOS system_profiler response for a given VRAM string and probe hardware */
async function vramFor(vramStr: string) {
  const spJson = JSON.stringify({
    SPDisplaysDataType: [
      { sppci_model: "Test GPU", spdisplays_vram: vramStr },
    ],
  });
  mockedExecFileSync.mockReturnValueOnce(spJson);
  const { probeHardware } = await importProbe();
  const p = await probeHardware();
  return p.gpus[0]?.vramMB;
}

/** Run a Linux lspci probe with the given GPU name and return the detected vendor */
async function vendorFor(name: string) {
  mockedExecFileSync
    .mockImplementationOnce(() => {
      throw new Error("no smi");
    })
    .mockReturnValueOnce(`00:02.0 VGA compatible controller: ${name}\n`);
  const { probeHardware } = await importProbe();
  const p = await probeHardware();
  return p.gpus[0]?.vendor;
}

// ── probeHardware — top-level integration ────────────────────────────────────

describe("probeHardware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPlatform.mockReturnValue("linux");
    mockedCpus.mockReturnValue([
      { model: "Intel Core i9" } as os.CpuInfo,
      { model: "Intel Core i9" } as os.CpuInfo,
    ]);
    mockedTotalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
    // execFileSync throws by default → no GPUs detected
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
  });

  it("returns correct platform, cpu, and ram values", async () => {
    const { probeHardware } = await importProbe();
    const profile = await probeHardware();
    expect(profile.platform).toBe("linux");
    expect(profile.cpuModel).toBe("Intel Core i9");
    expect(profile.cpuCores).toBe(2);
    expect(profile.ramMB).toBe(16 * 1024);
  });

  it("handles missing cpus gracefully (empty array)", async () => {
    mockedCpus.mockReturnValue([]);
    const { probeHardware } = await importProbe();
    const profile = await probeHardware();
    expect(profile.cpuModel).toBe("Unknown CPU");
    expect(profile.cpuCores).toBe(0);
  });

  it("sets primaryGpuVramMB to max vram across all GPUs", async () => {
    mockedPlatform.mockReturnValue("linux");
    mockedExecFileSync.mockReturnValueOnce(
      "RTX 3080, 10240\nRTX 4090, 24576\n",
    );
    const { probeHardware } = await importProbe();
    const profile = await probeHardware();
    expect(profile.primaryGpuVramMB).toBe(24576);
    expect(profile.gpus).toHaveLength(2);
  });

  it("returns empty gpus and tier X when all detection fails", async () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("cmd not found");
    });
    const { probeHardware } = await importProbe();
    const profile = await probeHardware();
    expect(profile.gpus).toEqual([]);
    expect(profile.tier).toBe("X");
  });

  it("returns tier X and primaryGpuVramMB 0 when no gpus", async () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("no gpu");
    });
    const { probeHardware } = await importProbe();
    const profile = await probeHardware();
    expect(profile.primaryGpuVramMB).toBe(0);
    expect(profile.tier).toBe("X");
  });

  it("handles unsupported platform gracefully (returns empty gpus)", async () => {
    mockedPlatform.mockReturnValue("freebsd" as NodeJS.Platform);
    const { probeHardware } = await importProbe();
    const profile = await probeHardware();
    expect(profile.gpus).toEqual([]);
  });
});

// ── classifyTier ──────────────────────────────────────────────────────────────

describe("classifyTier (via probeHardware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPlatform.mockReturnValue("linux");
    mockedCpus.mockReturnValue([{ model: "CPU" } as os.CpuInfo]);
    mockedTotalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
  });

  it("tier Z — ≥ 20 000 MB VRAM", async () => {
    mockedExecFileSync.mockReturnValueOnce("RTX 4090, 24576\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.tier).toBe("Z");
    expect(p.tierReason).toContain("70B+");
  });

  it("tier Y — 8 000–19 999 MB VRAM", async () => {
    mockedExecFileSync.mockReturnValueOnce("RTX 3080, 10240\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.tier).toBe("Y");
    expect(p.tierReason).toContain("32B");
  });

  it("tier X — no GPU but ≥ 32 GB RAM", async () => {
    mockedTotalmem.mockReturnValue(64 * 1024 * 1024 * 1024);
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("no gpu");
    });
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.tier).toBe("X");
    expect(p.tierReason).toContain("API-only recommended");
  });

  it("tier X — no GPU and < 32 GB RAM", async () => {
    mockedTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("no gpu");
    });
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.tier).toBe("X");
    expect(p.tierReason).toContain("No discrete GPU detected");
  });

  it("tier X — small VRAM (< 8 000 MB, > 0)", async () => {
    mockedExecFileSync.mockReturnValueOnce("GT 1030, 2048\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.tier).toBe("X");
    expect(p.tierReason).toContain("below 8 GB threshold");
  });

  it("classifyTier can be called directly — tier Z boundary (exactly 20000)", async () => {
    const { classifyTier } = await importProbe();
    const result = classifyTier(20000, 16 * 1024);
    expect(result.tier).toBe("Z");
  });

  it("classifyTier can be called directly — tier Y boundary (exactly 8000)", async () => {
    const { classifyTier } = await importProbe();
    const result = classifyTier(8000, 16 * 1024);
    expect(result.tier).toBe("Y");
  });
});

// ── detectGpus — Linux ────────────────────────────────────────────────────────

describe("detectGpus — Linux", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPlatform.mockReturnValue("linux");
    mockedCpus.mockReturnValue([{ model: "CPU" } as os.CpuInfo]);
    mockedTotalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
  });

  it("uses nvidia-smi output when available", async () => {
    mockedExecFileSync.mockReturnValueOnce("GeForce RTX 3090, 24576\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].vendor).toBe("nvidia");
    expect(p.gpus[0].vramMB).toBe(24576);
  });

  it("falls back to lspci when nvidia-smi throws", async () => {
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("nvidia-smi not found");
      })
      .mockReturnValueOnce(
        "00:02.0 VGA compatible controller: Intel Corporation UHD Graphics 630\n" +
          "01:00.0 3D controller: NVIDIA Corporation GA102 [GeForce RTX 3080]\n",
      );
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus.length).toBeGreaterThan(0);
    expect(p.gpus.some((g) => g.name.includes("Intel Corporation UHD"))).toBe(true);
  });

  it("returns empty array when both nvidia-smi and lspci throw", async () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus).toEqual([]);
  });

  it("filters lspci lines that do not match vga|3d|display", async () => {
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("no nvidia");
      })
      .mockReturnValueOnce(
        "00:00.0 Host bridge: Intel Corp\n" +
          "00:02.0 VGA compatible controller: AMD Radeon RX 6800\n",
      );
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus).toHaveLength(1);
    expect(p.gpus[0].name).toContain("AMD Radeon RX 6800");
  });

  it("parses lspci line without colon separator", async () => {
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("no nvidia");
      })
      .mockReturnValueOnce("VGA Display Adapter\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].name).toBe("VGA Display Adapter");
  });
});

// ── detectGpus — macOS ────────────────────────────────────────────────────────

describe("detectGpus — macOS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPlatform.mockReturnValue("darwin");
    mockedCpus.mockReturnValue([{ model: "Apple M2" } as os.CpuInfo]);
    mockedTotalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
  });

  it("parses system_profiler JSON with spdisplays_vram in GB", async () => {
    const spJson = JSON.stringify({
      SPDisplaysDataType: [
        { sppci_model: "Apple M2 Pro", spdisplays_vram: "16 GB" },
      ],
    });
    mockedExecFileSync.mockReturnValueOnce(spJson);
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].name).toBe("Apple M2 Pro");
    expect(p.gpus[0].vramMB).toBe(16 * 1024);
    expect(p.gpus[0].vendor).toBe("apple");
  });

  it("parses spdisplays_vram in MB", async () => {
    const spJson = JSON.stringify({
      SPDisplaysDataType: [
        { sppci_model: "AMD Radeon Pro 5500M", spdisplays_vram: "8192 MB" },
      ],
    });
    mockedExecFileSync.mockReturnValueOnce(spJson);
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].vramMB).toBe(8192);
    expect(p.gpus[0].vendor).toBe("amd");
  });

  it("uses spdisplays_vram_shared when spdisplays_vram absent", async () => {
    const spJson = JSON.stringify({
      SPDisplaysDataType: [
        { _name: "Intel Iris Plus", spdisplays_vram_shared: "1536 MB" },
      ],
    });
    mockedExecFileSync.mockReturnValueOnce(spJson);
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].vramMB).toBe(1536);
    expect(p.gpus[0].vendor).toBe("intel");
  });

  it("uses _name when sppci_model absent", async () => {
    const spJson = JSON.stringify({
      SPDisplaysDataType: [
        { _name: "Intel UHD Graphics 630", spdisplays_vram: "1536 MB" },
      ],
    });
    mockedExecFileSync.mockReturnValueOnce(spJson);
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].name).toBe("Intel UHD Graphics 630");
  });

  it("falls back to detectAppleSilicon when system_profiler throws", async () => {
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("sp failed");
      })
      .mockReturnValueOnce(String(16 * 1024 * 1024 * 1024))
      .mockReturnValueOnce("Apple M2 Pro\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].vendor).toBe("apple");
    expect(p.gpus[0].vramMB).toBe(16 * 1024);
    expect(p.gpus[0].name).toContain("Apple M2 Pro");
  });

  it("detectAppleSilicon returns empty array when sysctl throws", async () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("sysctl not found");
    });
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus).toEqual([]);
  });

  it("uses 'Apple Silicon' as name when brand_string is empty", async () => {
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("sp failed");
      })
      .mockReturnValueOnce(String(8 * 1024 * 1024 * 1024))
      .mockReturnValueOnce("");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].name).toBe("Apple Silicon");
  });
});

// ── detectGpus — Windows ──────────────────────────────────────────────────────

describe("detectGpus — Windows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPlatform.mockReturnValue("win32");
    mockedCpus.mockReturnValue([{ model: "Intel Core i9" } as os.CpuInfo]);
    mockedTotalmem.mockReturnValue(32 * 1024 * 1024 * 1024);
  });

  it("uses nvidia-smi when available on Windows", async () => {
    mockedExecFileSync.mockReturnValueOnce("RTX 4080, 16384\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].vendor).toBe("nvidia");
    expect(p.gpus[0].vramMB).toBe(16384);
  });

  it("falls back to Get-CimInstance when nvidia-smi throws", async () => {
    const psJson = JSON.stringify([
      { Name: "NVIDIA GeForce RTX 3070", AdapterRAM: 8 * 1024 * 1024 * 1024 },
      { Name: "Intel UHD Graphics 630", AdapterRAM: 128 * 1024 * 1024 },
    ]);
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("nvidia-smi not found");
      })
      .mockReturnValueOnce(psJson);
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus).toHaveLength(2);
    expect(p.gpus[0].vendor).toBe("nvidia");
    expect(p.gpus[0].vramMB).toBe(8 * 1024);
    expect(p.gpus[1].vendor).toBe("intel");
  });

  it("parses single-object (non-array) PowerShell JSON", async () => {
    const psJson = JSON.stringify({
      Name: "AMD Radeon RX 5700",
      AdapterRAM: 8 * 1024 * 1024 * 1024,
    });
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("no nvidia");
      })
      .mockReturnValueOnce(psJson);
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].vendor).toBe("amd");
  });

  it("filters out entries with missing Name or zero AdapterRAM", async () => {
    const psJson = JSON.stringify([
      { Name: null, AdapterRAM: 1024 },
      { Name: "Valid GPU", AdapterRAM: 0 },
      { Name: "Real GPU", AdapterRAM: 4 * 1024 * 1024 * 1024 },
    ]);
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error("no nvidia");
      })
      .mockReturnValueOnce(psJson);
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus).toHaveLength(1);
    expect(p.gpus[0].name).toBe("Real GPU");
  });

  it("returns empty when both nvidia-smi and PowerShell throw", async () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("everything fails");
    });
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus).toEqual([]);
  });
});

// ── inferVendor ───────────────────────────────────────────────────────────────

describe("inferVendor (via GPU names)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPlatform.mockReturnValue("linux");
    mockedCpus.mockReturnValue([{ model: "CPU" } as os.CpuInfo]);
    mockedTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
  });

  it("detects nvidia from 'GeForce'", async () => {
    expect(await vendorFor("NVIDIA Corporation GeForce RTX 3080")).toBe("nvidia");
  });
  it("detects nvidia from 'RTX'", async () => {
    expect(await vendorFor("RTX 4090")).toBe("nvidia");
  });
  it("detects nvidia from 'GTX'", async () => {
    expect(await vendorFor("GTX 1080 Ti")).toBe("nvidia");
  });
  it("detects nvidia from 'Quadro'", async () => {
    expect(await vendorFor("NVIDIA Quadro P4000")).toBe("nvidia");
  });
  it("detects nvidia from 'Tesla'", async () => {
    expect(await vendorFor("NVIDIA Tesla V100")).toBe("nvidia");
  });
  it("detects amd from 'Radeon'", async () => {
    expect(await vendorFor("AMD Radeon RX 6800")).toBe("amd");
  });
  it("detects amd from 'FirePro'", async () => {
    expect(await vendorFor("AMD FirePro W8100")).toBe("amd");
  });
  it("detects intel from 'Iris'", async () => {
    expect(await vendorFor("Intel Iris Plus Graphics")).toBe("intel");
  });
  it("detects intel from 'Arc'", async () => {
    expect(await vendorFor("Intel Arc A770")).toBe("intel");
  });
  it("detects intel from 'UHD Graphics'", async () => {
    expect(await vendorFor("Intel UHD Graphics 630")).toBe("intel");
  });
  it("detects apple from 'M1'", async () => {
    expect(await vendorFor("Apple M1 GPU")).toBe("apple");
  });
  it("detects apple from 'M3'", async () => {
    expect(await vendorFor("Apple M3 Max")).toBe("apple");
  });
  it("returns unknown for unrecognised name", async () => {
    expect(await vendorFor("Imagination PowerVR GX6450")).toBe("unknown");
  });
});

// ── parseVramString ───────────────────────────────────────────────────────────

describe("parseVramString (via macOS detection)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPlatform.mockReturnValue("darwin");
    mockedCpus.mockReturnValue([{ model: "CPU" } as os.CpuInfo]);
    mockedTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
  });

  it("parses '8 GB' → 8192 MB", async () =>
    expect(await vramFor("8 GB")).toBe(8192));
  it("parses '4096 MB' → 4096", async () =>
    expect(await vramFor("4096 MB")).toBe(4096));
  it("parses '2.5 GB' → 2560", async () =>
    expect(await vramFor("2.5 GB")).toBe(2560));
  it("returns 0 for unrecognised string", async () =>
    expect(await vramFor("N/A")).toBe(0));

  it("parseVramString can be called directly", async () => {
    const { parseVramString } = await importProbe();
    expect(parseVramString("16 GB")).toBe(16384);
    expect(parseVramString("512 MB")).toBe(512);
    expect(parseVramString("1.5 GB")).toBe(1536);
    expect(parseVramString("unknown")).toBe(0);
  });
});

// ── tryNvidiaSmi — edge cases ─────────────────────────────────────────────────

describe("tryNvidiaSmi edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPlatform.mockReturnValue("linux");
    mockedCpus.mockReturnValue([{ model: "CPU" } as os.CpuInfo]);
    mockedTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
  });

  it("handles nvidia-smi line with missing vram field", async () => {
    mockedExecFileSync.mockReturnValueOnce("Unknown GPU\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].name).toBe("Unknown GPU");
    expect(p.gpus[0].vramMB).toBe(0);
  });

  it("filters empty lines from nvidia-smi output", async () => {
    mockedExecFileSync.mockReturnValueOnce("\nRTX 3060, 12288\n\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus).toHaveLength(1);
  });

  it("uses 'Unknown NVIDIA GPU' when name part is empty", async () => {
    mockedExecFileSync.mockReturnValueOnce(", 8192\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].vendor).toBe("nvidia");
  });

  it("handles nvidia-smi with non-numeric vram gracefully", async () => {
    mockedExecFileSync.mockReturnValueOnce("RTX 4090, N/A\n");
    const { probeHardware } = await importProbe();
    const p = await probeHardware();
    expect(p.gpus[0].vramMB).toBe(0);
  });
});

// ── inferVendor direct unit tests ─────────────────────────────────────────────

describe("inferVendor direct", () => {
  it("returns nvidia for lowercase 'nvidia'", async () => {
    const { inferVendor } = await importProbe();
    expect(inferVendor("nvidia quadro rtx 8000")).toBe("nvidia");
  });

  it("returns amd for lowercase 'amd'", async () => {
    const { inferVendor } = await importProbe();
    expect(inferVendor("amd radeon rx 7900 xtx")).toBe("amd");
  });

  it("returns intel for 'intel'", async () => {
    const { inferVendor } = await importProbe();
    expect(inferVendor("intel arc a380")).toBe("intel");
  });

  it("returns apple for M2 pattern", async () => {
    const { inferVendor } = await importProbe();
    expect(inferVendor("Apple M2 Ultra")).toBe("apple");
  });

  it("returns unknown for empty string", async () => {
    const { inferVendor } = await importProbe();
    expect(inferVendor("")).toBe("unknown");
  });
});
