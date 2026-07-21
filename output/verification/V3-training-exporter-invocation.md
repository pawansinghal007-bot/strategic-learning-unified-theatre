# V3 — Training exporter, actually invoked

## Commands run

```bash
# 1. Read the main source file
cat src/llm/training-exporter.js

# 2. Search repo for all references to exportTrainingData
grep -rn "exportTrainingData" --include="*.js" --include="*.ts" --include="*.cjs" --include="*.mjs" src/ electron-ui/ scripts/ renderer/

# 3. Narrow to actual invocations (not imports/exports) in src/
grep -n "exportTrainingData(" src/commands/llm.js src/llm/training-exporter.js
```

## Terminal output

**Command 2 — `exportTrainingData` references in non-test source:**

```
src/llm/training-exporter.js:157:export async function exportTrainingData({
src/commands/llm.js:195:import { exportTrainingData } from "../llm/training-exporter.js";
src/commands/llm.js:460:        const result = await exportTrainingData({
```

**Command 3 — Actual invocations in src/:**

```
src/commands/llm.js:460:        const result = await exportTrainingData({
src/llm/training-exporter.js:157:export async function exportTrainingData({
```

Zero matches in `electron-ui/`, `scripts/`, or `renderer/`.

## Code evidence

### exportTrainingData — definition

**`src/llm/training-exporter.js:157`** (export definition)

```javascript
export async function exportTrainingData({
  baseDir,
  db,
  outputPath,
  since,
  platform,
  quality,
  dryRun = false,
  minPairs = 0,
} = {}) {
```

### exportTrainingData — real callers (non-test)

**Caller 1 (and only): `src/commands/llm.js:460`** (CLI `llm export-training` command)

```javascript
// Lines 460-470
const result = await exportTrainingData({
  baseDir: options.baseDir,
  outputPath: options.out,
  since: options.since,
  platform: options.platform,
  quality: options.quality,
  dryRun: Boolean(options.dryRun),
  minPairs: Number(options.minPairs ?? 0),
});
```

The CLI command is registered with these options (`src/commands/llm.js` lines ~445-458):

```javascript
llm
  .command("export-training")
  .description("Export training data from the experience database as JSONL")
  .option("--out <path>", "Output JSONL file path")
  .option("--since <date>", "Include only documents on or after this date")
  .option("--platform <name>", "Filter training data by platform")
  .option("--quality <label>", "Filter training data by quality label")
  .option(
    "--min-pairs <number>",
    "Require a minimum number of paired examples",
    "0",
  )
  .option("--dry-run", "Preview the export without writing output")
  .option("--base-dir <dir>", "Local storage base directory");
```

### Other non-test callers searched (zero matches)

| Location searched        | Result       |
| ------------------------ | ------------ |
| `electron-ui/`           | Zero matches |
| `scripts/`               | Zero matches |
| `renderer/`              | Zero matches |
| `src/daemon/`            | Zero matches |
| `src/llm/` (other files) | Zero matches |

## Verdict

Confirmed built

## Notes

`exportTrainingData` has exactly one real non-test caller: the CLI `llm export-training` command in `src/commands/llm.js:460`. It is not dead-ended — the CLI command is fully wired with options for `--out`, `--since`, `--platform`, `--quality`, `--min-pairs`, `--dry-run`, and `--base-dir`. No other source file (daemon, Electron IPC, scripts, renderer) invokes it; it is CLI-only.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Confirmed built.**

`exportTrainingData` has exactly one non-test caller: `src/commands/llm.js` (~line 460, `llm export-training` CLI). Definition remains in `src/llm/training-exporter.js`. Not dead-ended; CLI-only is correctly noted. No material corrections.
