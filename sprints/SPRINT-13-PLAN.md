# Sprint 12 Resume Prompt

```text
You are continuing sprint 5e37736e-d51c-48e5-9df3-25e199c457bb on strategic-learning-unified-theatre.
Goal: Sprint 12 - VS Code Passive Learning
Completed:
- None
Pending (priority order):
- None
Blockers:
- None
Files changed:
- None
Tests failing:
- None
Start by fixing the failing tests, then continue with pending tasks in priority order.
```

# Sprint 13 Plan — LoRA Fine-Tuning Pipeline

## Overview
- Project root: `E:\VS Code Agent\Solution`
- Baseline: 263/264 tests passing (2026-05-23)
- Prerequisite: Sprint 12 (VS Code Passive Learning) complete, or `experience.db` must contain ≥ 50 quality-tagged documents before fine-tuning is meaningful.
- Goal: implement a local LoRA training pipeline that exports experience data, runs adapter training, converts adapters to GGUF, and versions adapters safely.

## Documentation Rule
For any library, framework, or package question during Sprint 13:
1. Use Context7 to resolve the library ID first
2. Fetch version-specific docs before generating code
3. Never guess APIs — always verify with Context7
4. Place the trigger at the end

All prompts for implementation guidance should append `use context7` at the end.

## Architecture Honest Notes
- The local LLM is inference-only; learning means RAG + adapters, not base-model retraining.
- LoRA adapters are separate from the base phi3 GGUF model and must be loaded alongside it.
- Python trainers produce `.safetensors`; node-llama-cpp requires `.gguf` adapter format.
- A conversion step is mandatory: Python adapter → llama.cpp convert → `.gguf`.
- CPU-only training is possible but slow: expected 6–20 hours for 100 pairs at rank 16.
- Goal: run fine-tuning on idle/no-user time via scheduler, with progress written to disk.

## Deployment Status
- [x] Deploy shared background experience DB service for all VS Code projects
   - `node ./src/cli.js daemon start` launched the watcher daemon
   - Fixed `src/daemon-runner.js` by removing `reportTimer.unref?.()` so the process remains alive
   - Fixed `src/watcher.js` by preserving the main polling timer handle
   - Initialized shared `~/.vscode-rotator/experience.db` with `new ExperienceDb().open()`
   - Confirmed `~/.vscode-rotator/experience.db` exists and is ready for ingestion

## Active Deployment Notes
- Shared DB path: `C:\Users\PawanSinghal\.vscode-rotator\experience.db`
- Daemon state: running (managed by `node ./src/cli.js daemon status`)
- This deployment is now the live store for local VS Code experience ingestion and prompt context

## Critical Requirements
- Training data readiness is mandatory before coding.
- The first implementation task is analysis only.
- If the dataset is insufficient, the sprint should output a data collection plan, not build the pipeline.

## Data Sources and Training Signal Mapping
| Source | Training signal | Format | Quality gate |
|---|---|---|---|
| `prompt_history` (rating ≥ 4) | Positive prompt examples | instruction/out | rating ≥ 4 |
| `prompt_history` (rating ≤ 2) | Skip/negative signal | excluded | never positive |
| `mistakes` | Error patterns | system rules | recurrence ≥ 2 |
| `rubric_rules` | Preferred behavior | system prefix | all rows |
| `documents` (quality=good) | Domain knowledge | instruction/out | quality=good |
| `documents` (`thread-turn`) | Conversation structure | multi-turn | source_type=thread-turn |
| `documents` (`vscode-edit`) | Codebase vocabulary/context | instruction/out | quality != bad |
| `documents` (`vscode-git`) | Decision history | instruction/out | no quality filter |

## Phi3 Instruction Format
- Exact format required for phi3 training:
  ```
  <|user|>
  {instruction}
  <|end|>
  <|assistant|>
  {response}
  <|end|>
  ```
- Multi-turn threads must preserve alternating user/assistant boundaries.

## Planned Work
1. Audit `experience.db` for readiness
   - count quality-rated prompt_history entries
   - count documents with positive quality and thread-turn signal
   - determine if ≥ 50 matched pairs exist
2. Define export format
   - serialize training examples to JSONL
   - include instruction/out and multi-turn thread formats
3. Decide training toolchain
   - evaluate `llama.cpp` finetune vs Python training + conversion
   - hide toolchain details behind an orchestrator module
4. Build adapter manager
   - manage adapter versions and active adapter metadata
   - support rollback on load failure
5. Integrate scheduler
   - run training when idle/night
   - write progress/status file to disk
6. Update inference loader
   - detect and load the active adapter in `src/llm/inference.js`
   - retry without adapter on failure

## Deliverables
- `SPRINT-13-ANALYSIS.md` or equivalent planning artifact
- `src/llm/finetune-exporter.js`
- `src/llm/finetune-runner.js`
- `src/llm/adapter-manager.js`
- CLI commands for export, train, list adapters, and activate adapter
- scheduler integration in `src/watcher.js`
- progress and benchmark logging

## Detailed Execution Checklist
1. [x] Deploy shared experience DB daemon and verify service
   - `node ./src/cli.js daemon start`
   - `node ./src/cli.js daemon status`
   - `~/.vscode-rotator/experience.db` exists
2. [ ] Start passive ingestion pipeline into `experience.db`
   - identify current staged signal sources
   - ensure `src/llm/document-ingester.js` writes to shared base dir
   - run `node ./src/cli.js llm ingest-staged` or `llm ingest` when source data is available
3. [ ] Audit `experience.db` content and quality
   - count `prompt_history` rows with rating ≥ 4
   - count `documents` rows with `quality=good` and `thread-turn` signal
   - compute candidate training pairs and data volume
4. [ ] Build export path for quality training data
   - implement `src/llm/finetune-exporter.js`
   - export JSONL examples from `experience.db`
   - validate JSONL with phi3 instruction format
5. [ ] Choose and wire the adapter training toolchain
   - decide between `llama.cpp` finetune vs Python LoRA + conversion
   - create orchestrator module for training lifecycle
6. [ ] Add active adapter manager and loader
   - implement `src/llm/adapter-manager.js`
   - manage active/previous adapter metadata and rollback
   - update `src/llm/inference.js` to load active adapter
7. [ ] Integrate idle scheduler into watcher daemon
   - add training scheduling to `src/watcher.js`
   - write progress files and status for background jobs
8. [ ] Validate end-to-end fine-tuning readiness
   - ensure local adapter loads successfully
   - run a sample prompt through the updated LLM path
   - verify experience DB retrieval and adapter-enhanced inference

## Next Sprint Candidate
- Sprint 14 should be either:
  - Adapter Quality Improvement, or
  - VS Code Sidebar Views for related context and ideas

