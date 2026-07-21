# V10 — Embeddings CPU/GPU Switch

**Engine**: Engine 10 (Platform Manager)
**Question**: Does embeddings generation check GPU availability from `probeHardware`/`classifyTier` before choosing a backend?

---

## Commands Run

```bash
# 1. Read embeddings.js (full file)
cat src/llm/embeddings.js

# 2. Read hwProbe.ts (full file)
cat src/installer/hw-probe/hwProbe.ts

# 3. Search for hw-probe imports in embeddings.js
grep -rn "hw-probe\|hwProbe\|probeHardware\|classifyTier\|HardwareTier\|HardwareProfile\|detectGpus\|primaryGpuVramMB\|tier" src/llm/embeddings.js

# 4. Search for embeddings references in hwProbe.ts
grep -rn "embeddings\|EmbeddingProvider\|embed\|onnxruntime\|GPU\|gpu\|tier\|hw-probe\|hwProbe\|probeHardware\|classifyTier" src/installer/hw-probe/hwProbe.ts

# 5. Search for hw-probe imports across src/llm/
grep -rn "hw-probe\|hwProbe\|probeHardware\|classifyTier" src/llm/ --include="*.js" --include="*.ts"

# 6. Search for all hw-probe consumers across src/
grep -rn "hw-probe\|hwProbe\|probeHardware\|classifyTier" src/ --include="*.js" --include="*.ts" | grep -v node_modules | grep -v "__tests__" | grep -v "\.d\.ts" | grep -v "\.spec\."
```

## Terminal Output

**Command 3 — hw-probe imports in embeddings.js:**

```
(empty — zero matches)
```

**Command 4 — embeddings references in hwProbe.ts:**

```
(empty — zero matches)
```

**Command 5 — hw-probe imports in src/llm/:**

```
(empty — zero matches)
```

**Command 6 — hw-probe consumers across src/ (non-test):**

```
src/installer/hw-probe/hwProbe.ts:2: * src/installer/hw-probe/hwProbe.ts
src/installer/hw-probe/hwProbe.ts:299:export function classifyTier(
src/installer/hw-probe/hwProbe.ts:340:export async function probeHardware(): Promise<HardwareProfile> {
src/installer/hw-probe/hwProbe.ts:353:  const { tier, tierReason } = classifyTier(primaryGpuVramMB, ramMB);
src/installer/hw-probe/test-probe.ts:1:import { probeHardware } from "./hwProbe";
src/installer/hw-probe/test-probe.ts:4:  const profile = await probeHardware();
```

## Code Evidence

### `src/llm/embeddings.js` — EmbeddingProvider (lines 226-255)

```javascript
export class EmbeddingProvider {
  constructor({ dimensions = EMBEDDING_DIMENSIONS } = {}) {
    this.dimensions = dimensions;
    this.backend = "deterministic-hash";
    this.session = null;
  }

  async initialize() {
    // In tests we set VSCODE_ROTATOR_MOCK_LLM to avoid loading heavy native
    // modules like ONNX runtime. Respect that guard to prevent worker OOMs.
    if (process.env.VSCODE_ROTATOR_MOCK_LLM) {
      this.backend = "deterministic-hash";
      return this;
    }

    try {
      await import("onnxruntime-node");
      this.backend = "onnxruntime-node";
    } catch {
      this.backend = "deterministic-hash";
    }
    return this;
  }

  async embed(text) {
    return fallbackEmbedding(text);
  }

  async embedMany(texts) {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}
```

**Observation**: The `initialize()` method attempts to import `onnxruntime-node` and falls back to `deterministic-hash` if unavailable. This is a simple try/catch on module availability — **no GPU check, no hw-probe import, no tier-based branching**.

### `src/installer/hw-probe/hwProbe.ts` — probeHardware (lines 340-360)

```typescript
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
```

### `src/installer/hw-probe/hwProbe.ts` — classifyTier (lines 299-332)

```typescript
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
  return {
    tier: "X",
    tierReason: `No discrete GPU detected; ${ramMB} MB RAM — API-only recommended`,
  };
}
```

### hw-probe consumers (non-test, across entire src/)

| File                                   | Import                             |
| -------------------------------------- | ---------------------------------- |
| `src/installer/hw-probe/hwProbe.ts`    | Self (defines exports)             |
| `src/installer/hw-probe/test-probe.ts` | `probeHardware` (test script only) |

**No production code outside `src/installer/hw-probe/` imports from hwProbe.**

### Cross-reference: embeddings.js imports

```javascript
import crypto from "node:crypto";
// Only import. No hw-probe, no GPU detection, no tier checking.
```

### Cross-reference: hwProbe.ts imports

```typescript
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { sanitizeEnvForSpawn } from "../../internal/paths.js";
// No embeddings, no EmbeddingProvider, no onnxruntime references.
```

## Verdict

**Missing**

## Notes

Both modules exist independently: `hwProbe.ts` has complete GPU detection + tier classification (Z/Y/X), and `embeddings.js` has an `EmbeddingProvider` with ONNX/deterministic-hash fallback. However, there is **zero connection** between them — `embeddings.js` never imports or calls `probeHardware`/`classifyTier`, and no file in `src/llm/` imports from hw-probe. The ONNX backend selection is purely based on module availability (`try { await import("onnxruntime-node") }`), not GPU capability. The hw-probe module is only consumed by its own test script (`test-probe.ts`) and test suite (`hwProbe.spec.ts`).
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Missing.**

`probeHardware` / `classifyTier` exist in `src/installer/hw-probe/hwProbe.ts`. Zero imports of hw-probe from `src/llm/` (including `embeddings.js`). Embeddings backend selection is not driven by GPU tier. Modules are independent. No material corrections.
