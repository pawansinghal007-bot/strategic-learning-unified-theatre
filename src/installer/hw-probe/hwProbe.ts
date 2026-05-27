/**
 * hwProbe.ts
 * Cross-platform hardware probe for the adaptive installer.
 */

import { execSync } from "child_process";
import * as os from "os";

// ── types ─────────────────────────────────────────────────────────────────────

export type Platform = "win32" | "darwin" | "linux";

export type GpuInfo = {
  name: string;
  vramMB: number;
  vendor: "nvidia" | "amd" | "intel" | "apple" | "unknown";
};

export type HardwareProfile = {
  platform: Platform;
  cpuModel: string;
  cpuCores: number;
  ramMB: number;
  gpus: GpuInfo[];
  primaryGpuVramMB: number;
  tier: "X" | "Y" | "Z";
  tierReason: string;
};

// ── thresholds ────────────────────────────────────────────────────────────────

const TIER_Y_VRAM_MB = 8_000;
const TIER_Z_VRAM_MB = 20_000;

// ── main export ───────────────────────────────────────────────────────────────

export async function probeHardware(): Promise<HardwareProfile> {
  const platform = os.platform() as Platform;
  const cpuModel = os.cpus()[0]?.model ?? "Unknown CPU";
  const cpuCores = os.cpus().length;
  const ramMB = Math.round(os.totalmem() / 1024 / 1024);

  const gpus = await detectGpus(platform);
  const primaryGpuVramMB = gpus.reduce((max, g) => Math.max(max, g.vramMB), 0);
  const { tier, tierReason } = classifyTier(primaryGpuVramMB, ramMB);

  return { platform, cpuModel, cpuCores, ramMB, gpus, primaryGpuVramMB, tier, tierReason };
}

// ── tier classification ───────────────────────────────────────────────────────

function classifyTier(vramMB: number, ramMB: number): { tier: "X" | "Y" | "Z"; tierReason: string } {
  if (vramMB >= TIER_Z_VRAM_MB) {
    return { tier: "Z", tierReason: `${Math.round(vramMB / 1024)} GB VRAM — can run 70B+ local models` };
  }
  if (vramMB >= TIER_Y_VRAM_MB) {
    return { tier: "Y", tierReason: `${Math.round(vramMB / 1024)} GB VRAM — can run 32B local models` };
  }
  if (vramMB === 0 && ramMB >= 32_000) {
    return { tier: "X", tierReason: `No discrete GPU, ${Math.round(ramMB / 1024)} GB RAM — API-only recommended` };
  }
  return {
    tier: "X",
    tierReason: vramMB === 0
      ? "No discrete GPU detected — API-only mode"
      : `${Math.round(vramMB / 1024)} GB VRAM — below 8 GB threshold for local models`,
  };
}

// ── GPU detection ─────────────────────────────────────────────────────────────

async function detectGpus(platform: Platform): Promise<GpuInfo[]> {
  try {
    if (platform === "win32")  return detectGpusWindows();
    if (platform === "darwin") return detectGpusMac();
    if (platform === "linux")  return detectGpusLinux();
    return [];
  } catch {
    return [];
  }
}

// ── Windows ───────────────────────────────────────────────────────────────────

function detectGpusWindows(): GpuInfo[] {
  const nvidia = tryNvidiaSmi();
  if (nvidia.length > 0) return nvidia;

  try {
    const raw = run(
      `powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json"`
    );
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
      .filter((g: any) => g?.Name && g?.AdapterRAM > 0)
      .map((g: any) => ({
        name: String(g.Name),
        vramMB: Math.round(Number(g.AdapterRAM) / 1024 / 1024),
        vendor: inferVendor(String(g.Name)),
      }));
  } catch {
    return [];
  }
}

// ── macOS ─────────────────────────────────────────────────────────────────────

function detectGpusMac(): GpuInfo[] {
  try {
    const raw = run("system_profiler SPDisplaysDataType -json");
    const parsed = JSON.parse(raw);
    const displays = parsed?.SPDisplaysDataType ?? [];
    return displays.map((d: any) => {
      const name: string = d.sppci_model ?? d._name ?? "Unknown GPU";
      const vramStr: string = d.spdisplays_vram ?? d.spdisplays_vram_shared ?? "0 MB";
      return { name, vramMB: parseVramString(vramStr), vendor: inferVendor(name) };
    });
  } catch {
    return detectAppleSilicon();
  }
}

function detectAppleSilicon(): GpuInfo[] {
  try {
    const ramBytes = Number(run("sysctl -n hw.memsize").trim());
    const ramMB = Math.round(ramBytes / 1024 / 1024);
    const chip = run("sysctl -n machdep.cpu.brand_string").trim();
    return [{ name: chip || "Apple Silicon", vramMB: ramMB, vendor: "apple" }];
  } catch {
    return [];
  }
}

// ── Linux ─────────────────────────────────────────────────────────────────────

function detectGpusLinux(): GpuInfo[] {
  const nvidia = tryNvidiaSmi();
  if (nvidia.length > 0) return nvidia;

  try {
    const raw = run("lspci | grep -iE 'vga|3d|display'");
    return raw.split("\n").filter(Boolean).map((line) => {
      const name = line.replace(/^.*?:\s*/, "").trim();
      return { name, vramMB: 0, vendor: inferVendor(name) };
    });
  } catch {
    return [];
  }
}

// ── nvidia-smi ────────────────────────────────────────────────────────────────

function tryNvidiaSmi(): GpuInfo[] {
  try {
    const raw = run("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits");
    return raw.split("\n").filter(Boolean).map((line) => {
      const [name, vramStr] = line.split(",").map((s) => s.trim());
      return { name: name ?? "Unknown NVIDIA GPU", vramMB: parseInt(vramStr ?? "0", 10), vendor: "nvidia" as const };
    });
  } catch {
    return [];
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function run(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", timeout: 5_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function inferVendor(name: string): GpuInfo["vendor"] {
  const n = name.toLowerCase();
  if (n.includes("nvidia") || n.includes("geforce") || n.includes("rtx") || n.includes("gtx") || n.includes("quadro")) return "nvidia";
  if (n.includes("amd") || n.includes("radeon")) return "amd";
  if (n.includes("intel") || n.includes("iris") || n.includes("arc")) return "intel";
  if (n.includes("apple") || n.includes("m1") || n.includes("m2") || n.includes("m3") || n.includes("m4")) return "apple";
  return "unknown";
}

function parseVramString(s: string): number {
  const match = s.match(/([\d.]+)\s*(GB|MB)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  return match[2].toUpperCase() === "GB" ? Math.round(value * 1024) : Math.round(value);
}