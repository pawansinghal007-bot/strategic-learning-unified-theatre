# V14 (resumed) — Unsloth LoRA Training Trigger

**Sprint entry filed:** 2026-08-04
**Status: SCAFFOLDED — NOT CLOSED**
**Original analysis:** `sprints/SPRINT-13-ANALYSIS.md`

---

## Background

Sprint 13 (`sprints/SPRINT-13-ANALYSIS.md`) ran a LoRA readiness analysis and
recorded a formal postponement decision: the dataset produced only 1 paired
example against a 50-pair minimum gate. The sprint is permanently closed at
`P2 COMPLETE — Decision recorded. Do not reopen.` That decision has not changed.

This V14 entry tracks the scaffolding code that was written in anticipation of
the gate being cleared. The code exists; the gate has not been cleared.

---

## What was implemented

### src/llm/training-trigger.js

`triggerLoraTraining(datasetPath, { model, modelPath })` — discovers the best
available local model then spawns the Unsloth CLI inside WSL via the
`wt.exe → wsl.exe → bash -l -c` chain:

- Model discovery order (first match wins):
  1. Explicit `--model-path` option
  2. First `.safetensors` under `~/.cache/huggingface/hub/models--*`
  3. First `.gguf` in: `VSCODE_ROTATOR_UNSLOTH_MODEL_PATH`, `/mnt/d/ai/models`,
     `/mnt/c/ai/models`, `~/models` (tried in order)
  4. Falls back to model-name string (`VSCODE_ROTATOR_UNSLOTH_MODEL` env var,
     default `phi3`)
- All argument values single-quote-shell-escaped via `shellQuote()` before
  embedding in the `bash -c` string; prevents path injection.
- Resolves on exit code 0; rejects with the exit code on any non-zero value.
- `spawn` imported from `./_child-process.js` (user-land shim) so Vitest can
  mock it without node: externals escaping the module graph.

### src/llm/_child-process.js

Added `spawn` to the named re-export alongside `execFile`. Keeps the shim fully
mockable in Vitest for long-running subprocess tests.

### src/commands/llm.js — `llm train-local` sub-command

Options: `--out <path>`, `--base-dir <dir>`, `--model <name>` (default `phi3`),
`--model-path <path>`.

Action sequence:
1. Spinner: `exportTrainingData({ minPairs: 50 })` — aborts if fewer than 50
   pairs are available (the gate is enforced at the exporter level)
2. Spinner: `triggerLoraTraining(outputPath, { model, modelPath })`
3. Both steps surface errors via `chalk.red / process.exitCode = 1` — standard
   pattern for all llm sub-commands

### tests/llm/training-trigger.test.js — 7 tests

1. Confirmed wt.exe / wsl.exe / unsloth arg shape (exact args array assertion)
2. Explicit `--model-path` forwarded and shell-quoted correctly
3. HuggingFace hub cache `.safetensors` preferred over GGUF search paths
4. Auto-discovery of `.gguf` from a mounted model directory
5. Promise resolves on exit code 0
6. Promise rejects on exit code 1
7. Rejection message contains the non-zero exit code value

---

## Gate status

| Criterion | Required | Current | Met? |
|-----------|----------|---------|------|
| Paired examples in dataset | ≥ 50 | 1 | **NO** |
| Toolchain (Unsloth) compatible | Python ≤ 3.11 or alternative confirmed | Python 3.14.5 CPU-only | **NOT VERIFIED** |
| Manual end-to-end run | Completed once | Never run | **NO** |

**SPRINT-13-ANALYSIS.md note:** Unsloth is flagged non-viable for the original
hardware env. Before invoking `train-local`, either verify Unsloth works or
switch to `llama.cpp finetune` as the analysis recommends. The CLI command as
wired calls Unsloth; a toolchain switch would require updating
`training-trigger.js`.

---

## Acceptance criteria to close V14

1. `llm export-training --min-pairs 50` exits 0 with ≥ 50 pairs reported
2. Toolchain confirmed: either Unsloth runs on the target machine, or
   `training-trigger.js` updated to use `llama.cpp finetune` and retested
3. `llm train-local` completes on the target machine without error
4. Output model artifact loads successfully
5. `docs/build-state.md` V14 entry updated to `CLOSED` with date, pair count,
   and toolchain used

---

## What must NOT happen

- Do not invoke `llm train-local` as a CI step or automated check — it requires
  real hardware and a real dataset; CI has neither
- Do not mark V14 closed because `tests/llm/training-trigger.test.js` passes —
  those tests verify subprocess wiring with mocks, not an actual training run
- Do not reopen `sprints/SPRINT-13-ANALYSIS.md` — its decision stands until all
  criteria above are met
- Do not lower the 50-pair threshold without a new analysis document
