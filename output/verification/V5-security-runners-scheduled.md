# V5 — Security runners, actually scheduled

## Commands run

```bash
# 1. Read the three runner source files
cat src/security/secrets/gitleaks-runner.ts
cat src/security/risks/trivy-runner.ts
cat src/security/risks/dependency-check-runner.ts

# 2. Search for runSecretsScan consumers across the repo
grep -rn "runSecretsScan" --include="*.js" --include="*.ts" --include="*.cjs" src/ electron-ui/

# 3. Search for runTrivyImage consumers across the repo
grep -rn "runTrivyImage" --include="*.js" --include="*.ts" --include="*.cjs" src/ electron-ui/

# 4. Search for runDependencyCheck consumers across the repo
grep -rn "runDependencyCheck" --include="*.js" --include="*.ts" --include="*.cjs" src/ electron-ui/

# 5. Search for runSecurityAutoScan consumers
grep -rn "runSecurityAutoScan\|runAutoScan" --include="*.js" --include="*.ts" --include="*.cjs" src/ electron-ui/

# 6. Check for CLI commands that invoke security scans
grep -rn "secrets.*scan\|security.*scan\|risks.*scan\|auto.*scan\|gitleaks\|trivy\|dependency-check" --include="*.js" --include="*.ts" src/commands/

# 7. Check for scheduled/daemon invocations
grep -rn "secrets.*scan\|security.*scan\|risks.*scan\|auto.*scan\|gitleaks\|trivy\|dependency-check" --include="*.js" src/daemon/

# 8. Check for script invocations
grep -rn "secrets.*scan\|security.*scan\|risks.*scan\|auto.*scan\|gitleaks\|trivy\|dependency-check" --include="*.js" scripts/

# 9. Check CI workflows for security scan steps
grep -rn "gitleaks\|trivy\|dependency-check\|secrets.*scan\|security.*scan" .github/workflows/

# 10. Check Electron IPC handlers
grep -rn "secrets.*scan\|security.*scan\|risks.*scan\|auto.*scan" --include="*.cjs" electron-ui/ipc/

# 11. Check preload for exposed APIs
grep -rn "autoScan\|auto-scan\|secrets.*scan\|risks.*scan" --include="*.cjs" electron-ui/preload.cjs

# 12. Check renderer for auto-scan trigger calls
grep -rn "autoScan\|auto-scan\|secrets.*scan\|risks.*scan" --include="*.jsx" --include="*.js" renderer/
```

## Terminal output

### gitleaks-runner.ts — `runSecretsScan` consumers

**Command 2 — `runSecretsScan` in src/ and electron-ui/:**

```
src/security/secrets/gitleaks-runner.ts:157:export async function runSecretsScan(
src/security/secrets/index.ts:1:export { runSecretsScan } from "./gitleaks-runner.js";
src/security/security-overview/auto-scan.ts:71:      .runSecretsScan(repoPath)
src/ui/dashboard.js:1509:async function runSecretsScan() {
electron-ui/ipc/secrets-handlers.cjs:11:    const { runSecretsScan } = secrets();
electron-ui/ipc/secrets-handlers.cjs:12:    return await runSecretsScan({
```

### trivy-runner.ts — `runTrivyImage` consumers

**Command 3 — `runTrivyImage` in src/ and electron-ui/:**

```
src/security/risks/trivy-runner.ts:10:export async function runTrivyImage(imageRef: string): Promise<{
src/security/risks/index.ts:2:export { runTrivyImage } from "./trivy-runner.js";
src/security/security-overview/auto-scan.ts:80:        ? await risksMod.runTrivyImage(imageRef).catch(() => null)
electron-ui/ipc/risks-handlers.cjs:28:      const { runTrivyImage } = risks();
electron-ui/ipc/risks-handlers.cjs:29:      const result = await runTrivyImage(imageRef);
```

### dependency-check-runner.ts — `runDependencyCheck` consumers

**Command 4 — `runDependencyCheck` in src/ and electron-ui/:**

```
src/security/risks/dependency-check-runner.ts:49:export async function runDependencyCheck(
src/security/risks/index.ts:1:export { runDependencyCheck } from "./dependency-check-runner.js";
src/security/security-overview/auto-scan.ts:75:      .runDependencyCheck(repoPath)
electron-ui/ipc/risks-handlers.cjs:13:        const { runDependencyCheck } = risks();
electron-ui/ipc/risks-handlers.cjs:14:        const result = await runDependencyCheck(scanTarget, options ?? {});
```

### Auto-scan orchestration — `runSecurityAutoScan` consumers

**Command 5 — `runSecurityAutoScan` / `runAutoScan`:**

```
src/security/security-overview/auto-scan.ts:51:export async function runSecurityAutoScan(
src/security/security-overview/index.ts:53:  runSecurityAutoScan,
src/security/security-overview/index.ts:54:  runSecurityAutoScan as runAutoScan,
electron-ui/ipc/security-overview-handlers.cjs:279:        runSecurityAutoScan,
electron-ui/ipc/security-overview-handlers.cjs:280:      } = require("../../src/security/security-overview/auto-scan.js");
electron-ui/ipc/security-overview-handlers.cjs:282:      const result = await runSecurityAutoScan({
```

### CLI commands — security scan invocations

**Command 6 — src/commands/:**

```
(no matches)
```

### Daemon — scheduled security scans

**Command 7 — src/daemon/:**

```
(no matches)
```

### Scripts — security scan invocations

**Command 8 — scripts/:**

```
(no matches)
```

### CI workflows — security scan steps

**Command 9 — .github/workflows/:**

```
.github/workflows/sonar-governance.yml:51:        uses: zricethezav/gitleaks-action@v1.10.0
```

Only one match — an external GitHub Action, not the repo's own `gitleaks-runner.ts`.

### Electron IPC handlers

**Command 10 — electron-ui/ipc/:**

```
electron-ui/ipc/secrets-handlers.cjs:10:  ipcMain.handle("secrets:scan", async (_event, options) => {
electron-ui/ipc/risks-handlers.cjs:10:  ipcMain.handle("risks:scan:dependency",
electron-ui/ipc/risks-handlers.cjs:25:  ipcMain.handle("risks:scan:image", async (_event, imageRef) => {
electron-ui/ipc/security-overview-handlers.cjs:266:  // Sprint 54: auto-scan trigger (backend orchestration)
electron-ui/ipc/security-overview-handlers.cjs:267:  ipcMain.handle("security-overview:auto-scan", async (_event, payload) => {
```

### Preload — exposed APIs

**Command 11 — electron-ui/preload.cjs:**

```
electron-ui/preload.cjs:276:  scan: (options) => ipcRenderer.invoke("secrets:scan", options),
electron-ui/preload.cjs:334:    ipcRenderer.invoke("security-overview:auto-scan", payload),
```

### Renderer — auto-scan trigger calls

**Command 12 — renderer/:**

```
(no matches)
```

## Code evidence

### Runner 1: gitleaks-runner.ts (`runSecretsScan`)

**Definition — `src/security/secrets/gitleaks-runner.ts:157`**

```typescript
export async function runSecretsScan(
  options: RunSecretsScanOptions,
): Promise<SecretsScanResult> {
```

**Consumer 1 — auto-scan.ts (orchestration layer):**
`src/security/security-overview/auto-scan.ts:71`

```typescript
const secretsResult = await secretsMod
  .runSecretsScan(repoPath)
  .catch((): { findings: unknown[] } => ({ findings: [] }));
```

**Consumer 2 — Electron IPC handler (secrets:scan):**
`electron-ui/ipc/secrets-handlers.cjs:10-18`

```javascript
ipcMain.handle("secrets:scan", async (_event, options) => {
  const { runSecretsScan } = secrets();
  return await runSecretsScan({
    repoPath: options?.repoPath,
    baselinePath: options?.baselinePath ?? null,
    suppressionsPath: options?.suppressionsPath ?? null,
    configPath: options?.configPath ?? null,
    redact: options?.redact !== false,
  });
});
```

**Consumer 3 — Dashboard UI (local function, calls preload API):**
`src/ui/dashboard.js:1509`

```javascript
async function runSecretsScan() {
  const repoPath = document.getElementById("secrets-repo-path").value.trim();
  // ... reads form fields ...
  const result = await globalThis.secrets.scan({
    repoPath,
    baselinePath,
    suppressionsPath,
    configPath,
    redact: true,
  });
  // ... renders results ...
}
```

**Preload bridge:**
`electron-ui/preload.cjs:276`

```javascript
scan: (options) => ipcRenderer.invoke("secrets:scan", options),
```

### Runner 2: trivy-runner.ts (`runTrivyImage`)

**Definition — `src/security/risks/trivy-runner.ts:10`**

```typescript
export async function runTrivyImage(imageRef: string): Promise<{
  ok: boolean;
  engine: "trivy";
  findings: RiskFinding[];
  raw?: unknown;
  error?: string;
}> {
```

**Consumer 1 — auto-scan.ts (orchestration layer, conditional):**
`src/security/security-overview/auto-scan.ts:80`

```typescript
const risksImageResult =
  imageRef != null && imageRef !== ""
    ? await risksMod.runTrivyImage(imageRef).catch(() => null)
    : null;
```

**Consumer 2 — Electron IPC handler (risks:scan:image):**
`electron-ui/ipc/risks-handlers.cjs:25-35`

```javascript
ipcMain.handle("risks:scan:image", async (_event, imageRef) => {
  try {
    const { runTrivyImage } = risks();
    const result = await runTrivyImage(imageRef);
    return { ok: true, engine: "trivy", result };
  } catch (err) {
    return { ok: false, engine: "trivy", error: String(err) };
  }
});
```

### Runner 3: dependency-check-runner.ts (`runDependencyCheck`)

**Definition — `src/security/risks/dependency-check-runner.ts:49`**

```typescript
export async function runDependencyCheck(
  scanTarget: string,
  options: RunDependencyCheckOptions = {},
): Promise<{
  ok: boolean;
  engine: "dependency-check";
  findings: RiskFinding[];
  raw?: unknown;
  error?: string;
}> {
```

**Consumer 1 — auto-scan.ts (orchestration layer):**
`src/security/security-overview/auto-scan.ts:75`

```typescript
const risksDependencyResult = await risksMod
  .runDependencyCheck(repoPath)
  .catch((): { findings: unknown[] } => ({ findings: [] }));
```

**Consumer 2 — Electron IPC handler (risks:scan:dependency):**
`electron-ui/ipc/risks-handlers.cjs:10-22`

```javascript
ipcMain.handle("risks:scan:dependency", async (_event, scanTarget, options) => {
  try {
    const { runDependencyCheck } = risks();
    const result = await runDependencyCheck(scanTarget, options ?? {});
    return { ok: true, engine: "dependency-check", result };
  } catch (err) {
    return {
      ok: false,
      engine: "dependency-check",
      error: String(err),
    };
  }
});
```

### Auto-scan orchestration — `runSecurityAutoScan`

**Definition — `src/security/security-overview/auto-scan.ts:51`**

```typescript
export async function runSecurityAutoScan(
  opts: AutoScanOptions,
): Promise<AutoScanResult> {
```

**Consumer — Electron IPC handler (security-overview:auto-scan):**
`electron-ui/ipc/security-overview-handlers.cjs:267-299`

```javascript
ipcMain.handle("security-overview:auto-scan", async (_event, payload) => {
  try {
    const input = payload && typeof payload === "object" ? payload : {};
    const {
      workspaceId,
      repoPath,
      imageRef,
      baselinePath,
      suppressionsPath,
      triagePath,
      driftHistoryPath,
    } = input;
    if (!repoPath || typeof repoPath !== "string") {
      return { ok: false, error: "auto-scan: repoPath is required" };
    }
    const {
      runSecurityAutoScan,
    } = require("../../src/security/security-overview/auto-scan.js");
    const result = await runSecurityAutoScan({
      workspaceId,
      repoPath,
      imageRef /* ... */,
    });
    return result;
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
});
```

**Preload bridge:**
`electron-ui/preload.cjs:334`

```javascript
autoScan: (payload) =>
  ipcRenderer.invoke("security-overview:auto-scan", payload),
```

### CI workflow — external gitleaks action only

`.github/workflows/sonar-governance.yml:51-54`

```yaml
- name: Secret scanning
  uses: zricethezav/gitleaks-action@v1.10.0
  with:
    args: --redact
  continue-on-error: false
```

This is a third-party GitHub Action — it does NOT invoke `gitleaks-runner.ts`.

### Scheduling context — all empty

| Search scope                     | Result                           |
| -------------------------------- | -------------------------------- |
| `src/commands/` — CLI commands   | Zero matches                     |
| `src/daemon/` — daemon/scheduler | Zero matches                     |
| `scripts/` — standalone scripts  | Zero matches                     |
| `renderer/` — UI trigger calls   | Zero matches                     |
| `.github/workflows/` — CI steps  | One match (external action only) |

## Verdict

Partial/integration unclear

## Notes

All three runners are fully implemented and have IPC handlers + auto-scan orchestration wiring. However, **no scheduled job, CLI command, daemon timer, CI step, or renderer call actually triggers them**:

- **gitleaks-runner.ts**: Consumed by auto-scan.ts and `secrets:scan` IPC. The CI workflow uses `zricethezav/gitleaks-action@v1.10.0` (external action), not the repo's own runner. No CLI command, no daemon schedule, no renderer call.
- **trivy-runner.ts**: Consumed by auto-scan.ts (conditional on imageRef) and `risks:scan:image` IPC. No CLI command, no daemon schedule, no renderer call.
- **dependency-check-runner.ts**: Consumed by auto-scan.ts and `risks:scan:dependency` IPC. No CLI command, no daemon schedule, no renderer call.
- **Auto-scan orchestration** (`runSecurityAutoScan`): Has an IPC handler (`security-overview:auto-scan`) and preload bridge (`window.securityOverview.autoScan`), but zero renderer calls invoke it. The dashboard's `buildDriftHistorySummary` function returns a static string "Auto-scan trigger path: available" — a placeholder, not a live trigger.

The runners are built and reachable via IPC, but there is no scheduling mechanism (cron, setInterval, CLI command, CI step, or renderer button handler) that actually invokes them. The architecture snapshots mention "Auto-scan trigger on app start or tray menu" as a planned feature across sprints 46-62, but no renderer code calls `autoScan()`.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Partial/integration unclear, with one correction.**

**Correction:** The report states zero renderer calls. That is **too strong**. `src/ui/dashboard.js` has manual UI triggers:
- `secrets-scan-btn` → `globalThis.secrets.scan(...)` (gitleaks path)
- `risks-scan-deps` → `globalThis.workspaceRisks.scanDependency(...)`
- `risks-scan-image` → `globalThis.workspaceRisks.scanImage(...)`

Also confirmed: `auto-scan.ts` orchestrates all three runners; IPC + preload expose `autoScan`; CI uses external `gitleaks-action`, not `gitleaks-runner.ts`; no daemon/cron/CLI schedule found.

**Verdict still holds** — runners are implemented and manually reachable (IPC + dashboard buttons), but not *scheduled*. The gap is scheduling/automation, not total lack of UI wiring.
