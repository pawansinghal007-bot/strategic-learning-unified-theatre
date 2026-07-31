/**
 * src/installer/hw-probe/hwProbe.js
 *
 * Plain-ESM runtime companion to hwProbe.ts.
 *
 * hwProbe.ts is the source of truth for types, full test coverage, and
 * SonarQube-reviewed logic. This file exposes the same public surface in
 * plain JS so that production entry points (src/cli.js and modules it
 * imports, such as src/llm/embeddings.js) can import probeHardware()
 * without requiring a TypeScript compiler or loader at runtime.
 *
 * Keeping the two files in sync is enforced by the existing hwProbe.spec.ts
 * suite (which tests the .ts source) and the new embeddings-gpu-tier tests
 * (which mock this file). Any logic change must be applied to both files.
 *
 * Tiers:
 *   Z  — ≥ 20 GB VRAM  → 70B+ models viable
 *   Y  — 8–19 GB VRAM  → 32B models viable
 *   X  — < 8 GB / no discrete GPU → API-only or small quantised models
 *
 * All external commands use execFileSync with argument arrays (no shell
 * injection surface). Every platform detector is independently wrapped in
 * try/catch so probeHardware() never throws.
 */

import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { sanitizeEnvForSpawn } from "../../internal/paths.js";

// ── Vendor inference ──────────────────────────────────────────────────────────

/**
 * Infer GPU vendor from a free-text name string.
 * @param {string} name
 * @returns {"nvidia"|"amd"|"intel"|"apple"|"unknown"}
 */
export function inferVendor(name) {
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

// ── VRAM string parser ────────────────────────────────────────────────────────

/**
 * Parse a VRAM string like "16 GB", "8192 MB", or "2.5 GB" into MB.
 * Returns 0 for unrecognised formats.
 * @param {string} raw
 * @returns {number}
 */
export function parseVramString(raw) {
  let pos = 0;
  while (pos < raw.length) {
    if (isDigitOrDot(raw[pos])) {
      const result = tryParseVramAt(raw, pos);
      if (result !== null) return result;
    }
    pos++;
  }
  return 0;
}

/**
 * @param {string} raw
 * @param {number} pos
 * @returns {number|null}
 */
function tryParseVramAt(raw, pos) {
  let j = pos;
  while (j < raw.length && isDigitOrDot(raw[j])) j++;
  const numStr = raw.slice(pos, j);
  let k = j;
  while (k < raw.length && isVramWhitespace(raw[k])) k++;
  const unit = raw.slice(k, k + 2).toUpperCase();
  if (unit !== "GB" && unit !== "MB") return null;
  const value = Number.parseFloat(numStr);
  return unit === "GB" ? Math.round(value * 1024) : Math.round(value);
}

/** @param {string|undefined} ch */
function isDigitOrDot(ch) {
  return ch === "." || (ch !== undefined && ch >= "0" && ch <= "9");
}

/** @param {string|undefined} ch */
function isVramWhitespace(ch) {
  return (
    ch === " " ||
    ch === "\t" ||
    ch === "\n" ||
    ch === "\r" ||
    ch === "\f" ||
    ch === "\v"
  );
}

// ── nvidia-smi ────────────────────────────────────────────────────────────────

/** @returns {Array<{name:string,vendor:string,vramMB:number}>} */
function tryNvidiaSmi() {
  const raw = execFileSync(
    "nvidia-smi",
    ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
    { encoding: "utf8", env: sanitizeEnvForSpawn(process.env) },
  );
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

/**
 * @param {() => Array<{name:string,vendor:string,vramMB:number}>} fallback
 * @returns {Array<{name:string,vendor:string,vramMB:number}>}
 */
function detectGpusWithNvidiaFallback(fallback) {
  try {
    return tryNvidiaSmi();
  } catch {
    return fallback();
  }
}

// ── Linux GPU detection ───────────────────────────────────────────────────────

function detectGpusLinux() {
  return detectGpusWithNvidiaFallback(() => {
    try {
      const raw = execFileSync("lspci", [], {
        encoding: "utf8",
        env: sanitizeEnvForSpawn(process.env),
      });
      return raw
        .split("\n")
        .filter((line) => /vga|3d|display/i.test(line))
        .map((line) => {
          const colonIdx = line.indexOf(": ");
          const name =
            colonIdx >= 0 ? line.slice(colonIdx + 2).trim() : line.trim();
          return { name, vendor: inferVendor(name), vramMB: 0 };
        });
    } catch {
      return [];
    }
  });
}

// ── macOS Apple Silicon fallback ──────────────────────────────────────────────

function detectAppleSilicon() {
  try {
    const memBytes = Number.parseInt(
      execFileSync("sysctl", ["-n", "hw.memsize"], {
        encoding: "utf8",
        env: sanitizeEnvForSpawn(process.env),
      }).trim(),
      10,
    );
    const vramMB = Math.round(memBytes / (1024 * 1024));
    const brandRaw = execFileSync(
      "sysctl",
      ["-n", "machdep.cpu.brand_string"],
      { encoding: "utf8", env: sanitizeEnvForSpawn(process.env) },
    ).trim();
    const name = brandRaw || "Apple Silicon";
    return [{ name, vendor: "apple", vramMB }];
  } catch {
    return [];
  }
}

// ── macOS GPU detection ───────────────────────────────────────────────────────

function detectGpusMacos() {
  try {
    const raw = execFileSync(
      "system_profiler",
      ["SPDisplaysDataType", "-json"],
      { encoding: "utf8", env: sanitizeEnvForSpawn(process.env) },
    );
    const data = JSON.parse(raw);
    const displays = data?.SPDisplaysDataType ?? [];
    return displays.map((d) => {
      const name = (d["sppci_model"] ?? d["_name"] ?? "Unknown GPU").trim();
      const vramStr =
        d["spdisplays_vram"] ?? d["spdisplays_vram_shared"] ?? "0 MB";
      const vramMB = parseVramString(vramStr);
      return { name, vendor: inferVendor(name), vramMB };
    });
  } catch {
    return detectAppleSilicon();
  }
}

// ── Windows GPU detection ─────────────────────────────────────────────────────

function detectGpusWindows() {
  return detectGpusWithNvidiaFallback(() => {
    try {
      const psScript =
        "Get-CimInstance -ClassName Win32_VideoController | " +
        "Select-Object Name,AdapterRAM | ConvertTo-Json -Compress";
      const raw = execFileSync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", psScript],
        { encoding: "utf8", env: sanitizeEnvForSpawn(process.env) },
      );
      const parsed = JSON.parse(raw.trim());
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      return entries
        .filter((e) => e.Name && e.AdapterRAM > 0)
        .map((e) => {
          const vramMB = Math.round(e.AdapterRAM / (1024 * 1024));
          return { name: e.Name, vendor: inferVendor(e.Name), vramMB };
        });
    } catch {
      return [];
    }
  });
}

// ── Platform dispatch ─────────────────────────────────────────────────────────

/** @param {string} platform */
function detectGpus(platform) {
  if (platform === "linux") return detectGpusLinux();
  if (platform === "darwin") return detectGpusMacos();
  if (platform === "win32") return detectGpusWindows();
  return [];
}

// ── Tier classification ───────────────────────────────────────────────────────

/**
 * @param {number} primaryGpuVramMB
 * @param {number} ramMB
 * @returns {{ tier: "Z"|"Y"|"X", tierReason: string }}
 */
export function classifyTier(primaryGpuVramMB, ramMB) {
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
  return {
    tier: "X",
    tierReason: `No discrete GPU detected; ${ramMB} MB RAM — API-only recommended`,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Probe the current machine and return a HardwareProfile.
 * Never throws — all detection failures are caught and result in empty/zero values.
 *
 * @returns {Promise<{
 *   platform: string,
 *   cpuModel: string,
 *   cpuCores: number,
 *   ramMB: number,
 *   gpus: Array<{name:string,vendor:string,vramMB:number}>,
 *   primaryGpuVramMB: number,
 *   tier: "Z"|"Y"|"X",
 *   tierReason: string
 * }>}
 */
export async function probeHardware() {
  const platform = os.platform();

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
