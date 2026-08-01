/**
 * src/installer/hw-probe/hwProbe-parity.spec.ts
 *
 * Parity test: verifies that the plain-ESM runtime twin (hwProbe.js) and the
 * TypeScript source (hwProbe.ts) produce identical output for every pure,
 * non-subprocess function across the full input matrix used in hwProbe.spec.ts.
 *
 * SCOPE — pure functions only (no subprocess calls):
 *   classifyTier(vramMB, ramMB)   → { tier, tierReason }
 *   inferVendor(name)             → vendor string
 *   parseVramString(str)          → number (MB)
 *
 * The subprocess-calling paths (probeHardware, nvidia-smi, lspci, etc.) are
 * NOT tested here — those require process mocking and are already covered
 * exhaustively in hwProbe.spec.ts against the .ts source.
 *
 * WHY THIS FILE EXISTS
 * hwProbe.js was added in Sprint 112.5 as a plain-JS runtime twin so that
 * production ESM entry points (src/cli.js, src/llm/embeddings.js) can import
 * probeHardware() without a TypeScript compiler. Because the two files must
 * stay in sync manually, this test is the enforcement mechanism: any logic
 * divergence between .ts and .js will fail here before it reaches production.
 *
 * sonar-project.properties carries a sonar.cpd.exclusions entry for hwProbe.js.
 * This test is the safety net that justifies that exclusion — see the comment
 * in sonar-project.properties and the Sprint 113 entry in
 * unified-theatre-continuity-summary.md for the full decision record.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Shared module-level mocks ─────────────────────────────────────────────────
// Both hwProbe.ts and hwProbe.js import node:os, node:child_process, and
// ../../internal/paths.js at the module level. Mock them so the imports
// resolve cleanly — none of the pure functions under test reach these paths,
// but the module initialisation code runs on import regardless.

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    platform: vi.fn().mockReturnValue("linux"),
    cpus: vi.fn().mockReturnValue([{ model: "Mock CPU" }]),
    totalmem: vi.fn().mockReturnValue(16 * 1024 * 1024 * 1024),
  };
});

vi.mock("node:child_process", () => {
  const mockExec = vi.fn().mockImplementation(() => {
    throw new Error("subprocess calls not allowed in parity test");
  });
  return {
    execFileSync: mockExec,
    default: { execFileSync: mockExec },
  };
});

vi.mock("../../internal/paths.js", () => ({
  sanitizeEnvForSpawn: vi.fn().mockReturnValue({}),
}));

// ── Types ─────────────────────────────────────────────────────────────────────

type PureFns = {
  classifyTier: (vramMB: number, ramMB: number) => { tier: string; tierReason: string };
  inferVendor: (name: string) => string;
  parseVramString: (str: string) => number;
};

// ── Module handles loaded in beforeAll ───────────────────────────────────────
// Vitest's module cache is keyed by resolved file path, so ./hwProbe.ts and
// ./hwProbe.js are distinct entries and can be imported simultaneously without
// resetModules tricks. Dynamic imports in beforeAll pick up the vi.mock stubs.

let ts: PureFns;
let js: PureFns;

beforeAll(async () => {
  [ts, js] = await Promise.all([
    import("./hwProbe.ts") as Promise<PureFns>,
    import("./hwProbe.js") as Promise<PureFns>,
  ]);
});

// ── Input matrices (taken verbatim from hwProbe.spec.ts) ──────────────────────

/** classifyTier inputs: [vramMB, ramMB, expectedTier, label] */
const classifyTierCases: [number, number, string, string][] = [
  [20000, 16 * 1024, "Z", "exactly 20000 MB VRAM → tier Z boundary"],
  [24576, 16 * 1024, "Z", "24 GB VRAM (RTX 4090) → tier Z"],
  [8000,  16 * 1024, "Y", "exactly 8000 MB VRAM → tier Y boundary"],
  [10240, 16 * 1024, "Y", "10 GB VRAM (RTX 3080) → tier Y"],
  [7999,  16 * 1024, "X", "7999 MB VRAM → below tier Y threshold → tier X"],
  [2048,  16 * 1024, "X", "2 GB VRAM (GT 1030) → tier X"],
  [0,     64 * 1024, "X", "no GPU, ≥ 32 GB RAM → tier X (API-only)"],
  [0,      8 * 1024, "X", "no GPU, < 32 GB RAM → tier X (no discrete GPU)"],
];

/** inferVendor inputs: [name, expectedVendor] */
const inferVendorCases: [string, string][] = [
  ["NVIDIA Corporation GeForce RTX 3080", "nvidia"],
  ["RTX 4090",                            "nvidia"],
  ["GTX 1080 Ti",                         "nvidia"],
  ["NVIDIA Quadro P4000",                 "nvidia"],
  ["NVIDIA Tesla V100",                   "nvidia"],
  ["nvidia quadro rtx 8000",              "nvidia"],
  ["AMD Radeon RX 6800",                  "amd"],
  ["AMD FirePro W8100",                   "amd"],
  ["amd radeon rx 7900 xtx",             "amd"],
  ["Intel Iris Plus Graphics",            "intel"],
  ["Intel Arc A770",                      "intel"],
  ["Intel UHD Graphics 630",              "intel"],
  ["intel arc a380",                      "intel"],
  ["Apple M1 GPU",                        "apple"],
  ["Apple M3 Max",                        "apple"],
  ["Apple M2 Ultra",                      "apple"],
  ["Imagination PowerVR GX6450",          "unknown"],
  ["",                                    "unknown"],
];

/** parseVramString inputs: [str, expectedMB] */
const parseVramStringCases: [string, number][] = [
  ["8 GB",    8192],
  ["4096 MB", 4096],
  ["2.5 GB",  2560],
  ["16 GB",   16384],
  ["512 MB",   512],
  ["1.5 GB",  1536],
  ["N/A",        0],
  ["unknown",    0],
];

// ── Parity assertions ─────────────────────────────────────────────────────────

describe("hwProbe .ts / .js parity — classifyTier", () => {
  for (const [vramMB, ramMB, expectedTier, label] of classifyTierCases) {
    it(label, () => {
      const resultTs = ts.classifyTier(vramMB, ramMB);
      const resultJs = js.classifyTier(vramMB, ramMB);

      // .ts and .js must agree with each other
      expect(resultJs.tier,       `[js≠ts] tier for "${label}"`).toBe(resultTs.tier);
      expect(resultJs.tierReason, `[js≠ts] tierReason for "${label}"`).toBe(resultTs.tierReason);

      // Both must also match the expected value from hwProbe.spec.ts
      expect(resultTs.tier, `[ts] tier wrong for "${label}"`).toBe(expectedTier);
      expect(resultJs.tier, `[js] tier wrong for "${label}"`).toBe(expectedTier);
    });
  }
});

describe("hwProbe .ts / .js parity — inferVendor", () => {
  for (const [name, expectedVendor] of inferVendorCases) {
    it(`"${name || "(empty string)"}" → ${expectedVendor}`, () => {
      const resultTs = ts.inferVendor(name);
      const resultJs = js.inferVendor(name);

      expect(resultJs, `[js≠ts] vendor for "${name}"`).toBe(resultTs);
      expect(resultTs, `[ts] vendor wrong for "${name}"`).toBe(expectedVendor);
      expect(resultJs, `[js] vendor wrong for "${name}"`).toBe(expectedVendor);
    });
  }
});

describe("hwProbe .ts / .js parity — parseVramString", () => {
  for (const [str, expectedMB] of parseVramStringCases) {
    it(`"${str}" → ${expectedMB} MB`, () => {
      const resultTs = ts.parseVramString(str);
      const resultJs = js.parseVramString(str);

      expect(resultJs, `[js≠ts] result for "${str}"`).toBe(resultTs);
      expect(resultTs, `[ts] result wrong for "${str}"`).toBe(expectedMB);
      expect(resultJs, `[js] result wrong for "${str}"`).toBe(expectedMB);
    });
  }
});
