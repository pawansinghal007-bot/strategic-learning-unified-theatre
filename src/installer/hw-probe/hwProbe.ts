/**
 * src/installer/hw-probe/hwProbe.ts
 *
 * Hardware probe: detects CPU, RAM, and GPU(s) and classifies the machine
 * into a capability tier (Z / Y / X) for local-LLM sizing decisions.
 *
 * Tiers:
 *   Z  — ≥ 20 GB VRAM  → 70B+ models viable
 *   Y  — 8–19 GB VRAM  → 32B models viable
 *   X  — < 8 GB / no discrete GPU → API-only or small quantised models
 *
 * All external commands are run with execFileSync so that each argument is
 * passed as a separate array element (no shell injection surface).
 */

import * as os from "node:os";
import { execFileSync } from "node:child_process";

// ── Public types ──────────────────────────────────────────────────────────────

export type GpuVendor = "nvidia" | "amd" | "intel" | "apple" | "unknown";

export interface GpuInfo {
  name: string;
  vendor: GpuVendor;
  vramMB: number;
}

export type HardwareTier = "Z" | "Y" | "X";

export interface HardwareProfile {
  platform: string;
  cpuModel: string;
  cpuCores: number;
  /** Total system RAM in MB */
  ramMB: number;
  gpus: GpuInfo[];
  /** VRAM of the most capable GPU in MB (0 if none detected) */
  primaryGpuVramMB: number;
  tier: HardwareTier;
  tierReason: string;
}

// ── Vendor inference ──────────────────────────────────────────────────────────

/**
 * Infer GPU vendor from a free-text name string.
 * Checks case-insensitively for well-known keywords.
 */
export function inferVendor(name: string): GpuVendor {
  const n = name.toLowerCase();
  if (
    n.includes("nvidia") ||
    n.includes("geforce") ||
    n.includes("rtx") ||
    n.includes("gtx") ||
    n.includes("quadro") ||
    n.includes("tesla")
  )
    return "nvidia";
  if (n.includes("amd") || n.includes("radeon") || n.includes("firepro"))
    return "amd";
  if (
    n.includes("intel") ||
    n.includes("iris") ||
    n.includes("uhd graphics") ||
    n.includes("arc")
  )
    return "intel";
  if (n.includes("apple") || /\bm[1-9]\b/.test(n)) return "apple";
  return "unknown";
}

// ── VRAM string parser (macOS system_profiler format) ─────────────────────────

/**
 * Parse a VRAM string like "16 GB", "8192 MB", or "2.5 GB" into MB.
 * Returns 0 for unrecognised formats.
 */
export function parseVramString(raw: string): number {
  const m = /([\d.]+)\s*(GB|MB)/i.exec(raw);
  if (!m) return 0;
  const value = Number.parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  return unit === "GB" ? Math.round(value * 1024) : Math.round(value);
}

// ── nvidia-smi (Linux + Windows) ──────────────────────────────────────────────

/**
 * Run nvidia-smi and return GPU list.
 * Output format expected: "<name>, <vramMB>" per line.
 * Throws if nvidia-smi is not available.
 */
function tryNvidiaSmi(): GpuInfo[] {
  const raw = execFileSync(
    "nvidia-smi",
    ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
    { encoding: "utf8" },
  ) as string;

  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [namePart, vramPart] = line.split(",");
      const name = (namePart ?? "").trim() || "Unknown NVIDIA GPU";
      const vramMB = Number.parseInt((vramPart ?? "0").trim(), 10) || 0;
      return { name, vendor: "nvidia", vramMB };
    });
}

// ── Linux GPU detection ───────────────────────────────────────────────────────

function detectGpusLinux(): GpuInfo[] {
  // 1. Try nvidia-smi
  try {
    return tryNvidiaSmi();
  } catch {
    // fall through to lspci
  }

  // 2. Fall back to lspci
  try {
    const raw = execFileSync("lspci", [], { encoding: "utf8" }) as string;
    return raw
      .split("\n")
      .filter((line) => /vga|3d|display/i.test(line))
      .map((line) => {
        // lspci format: "00:02.0 VGA compatible controller: <name>"
        const colonIdx = line.indexOf(": ");
        const name = colonIdx >= 0 ? line.slice(colonIdx + 2).trim() : line.trim();
        return { name, vendor: inferVendor(name), vramMB: 0 };
      });
  } catch {
    return [];
  }
}

// ── macOS Apple Silicon fallback ──────────────────────────────────────────────

function detectAppleSilicon(): GpuInfo[] {
  try {
    const memBytes = parseInt(
      (execFileSync("sysctl", ["-n", "hw.memsize"], {
        encoding: "utf8",
      }) as string).trim(),
      10,
    );
    const vramMB = Math.round(memBytes / (1024 * 1024));

    const brandRaw = (
      execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], {
        encoding: "utf8",
      }) as string
    ).trim();
    const name = brandRaw || "Apple Silicon";

    return [{ name, vendor: "apple", vramMB }];
  } catch {
    return [];
  }
}

// ── macOS GPU detection ───────────────────────────────────────────────────────

function detectGpusMacos(): GpuInfo[] {
  // 1. system_profiler JSON output
  try {
    const raw = execFileSync(
      "system_profiler",
      ["SPDisplaysDataType", "-json"],
      { encoding: "utf8" },
    ) as string;

    const data = JSON.parse(raw);
    const displays: Record<string, string>[] = data?.SPDisplaysDataType ?? [];

    return displays.map((d) => {
      const name =
        (d["sppci_model"] ?? d["_name"] ?? "Unknown GPU").trim();
      const vramStr =
        d["spdisplays_vram"] ?? d["spdisplays_vram_shared"] ?? "0 MB";
      const vramMB = parseVramString(vramStr);
      return { name, vendor: inferVendor(name), vramMB };
    });
  } catch {
    // 2. Fall back to sysctl for Apple Silicon
    return detectAppleSilicon();
  }
}

// ── Windows GPU detection ─────────────────────────────────────────────────────

function detectGpusWindows(): GpuInfo[] {
  // 1. Try nvidia-smi first (works on Windows too)
  try {
    return tryNvidiaSmi();
  } catch {
    // fall through to PowerShell
  }

  // 2. Get-CimInstance Win32_VideoController via PowerShell
  try {
    const psScript =
      "Get-CimInstance -ClassName Win32_VideoController | " +
      "Select-Object Name,AdapterRAM | ConvertTo-Json -Compress";
    const raw = execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", psScript],
      { encoding: "utf8" },
    ) as string;

    const parsed = JSON.parse(raw.trim());
    const entries: { Name: string | null; AdapterRAM: number }[] = Array.isArray(parsed)
      ? parsed
      : [parsed];

    return entries
      .filter((e) => e.Name && e.AdapterRAM > 0)
      .map((e) => {
        const name = e.Name as string;
        const vramMB = Math.round(e.AdapterRAM / (1024 * 1024));
        return { name, vendor: inferVendor(name), vramMB };
      });
  } catch {
    return [];
  }
}

// ── Platform dispatch ─────────────────────────────────────────────────────────

function detectGpus(platform: string): GpuInfo[] {
  if (platform === "linux") return detectGpusLinux();
  if (platform === "darwin") return detectGpusMacos();
  if (platform === "win32") return detectGpusWindows();
  return [];
}

// ── Tier classification ───────────────────────────────────────────────────────

export function classifyTier(
  primaryGpuVramMB: number,
  ramMB: number,
): { tier: HardwareTier; tierReason: string } {
  if (primaryGpuVramMB >= 20_000) {
    return {
      tier: "Z",
      tierReason: `${primaryGpuVramMB} MB VRAM — 70B+ models viable`,
    };
  }
  if (primaryGpuVramMB >= 8_000) {
    return {
      tier: "Y",
      tierReason: `${primaryGpuVramMB} MB VRAM — 32B models viable`,
    };
  }
  if (primaryGpuVramMB > 0) {
    return {
      tier: "X",
      tierReason: `${primaryGpuVramMB} MB VRAM — below 8 GB threshold; API-only or small quantised models`,
    };
  }
  // No discrete GPU
  if (ramMB >= 32 * 1024) {
    return {
      tier: "X",
      tierReason: `No discrete GPU detected; ${ramMB} MB RAM — API-only recommended`,
    };
  }
  return {
    tier: "X",
    tierReason: `No discrete GPU detected; ${ramMB} MB RAM — API-only recommended`,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Probe the current machine and return a {@link HardwareProfile}.
 * Never throws — all detection failures are caught and result in empty/zero values.
 */
export async function probeHardware(): Promise<HardwareProfile> {
  const platform = os.platform() as string;

  const cpuList = os.cpus();
  const cpuModel = cpuList[0]?.model ?? "Unknown CPU";
  const cpuCores = cpuList.length;

  const ramMB = Math.round(os.totalmem() / (1024 * 1024));

  const gpus = detectGpus(platform);
  const primaryGpuVramMB =
    gpus.length > 0 ? Math.max(...gpus.map((g) => g.vramMB)) : 0;

  const { tier, tierReason } = classifyTier(primaryGpuVramMB, ramMB);

  return {
    platform,
    cpuModel,
    cpuCores,
    ramMB,
    gpus,
    primaryGpuVramMB,
    tier,
    tierReason,
  };
}
