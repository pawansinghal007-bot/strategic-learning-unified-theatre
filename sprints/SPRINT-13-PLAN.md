# Sprint 12 Resume Prompt

```text
You are continuing sprint 5e37736e-d51c-48e5-9df3-25e199c457bb on vscode-rotator.
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
- Baseline: 214 tests passing
- Prerequisite: Sprint 12 (VS Code Passive Learning) complete, or `experience.db` must contain ≥ 50 quality-tagged documents before fine-tuning is meaningful.
- Goal: implement a local LoRA training pipeline that exports experience data, runs adapter training, converts adapters to GGUF, and versions adapters safely.

## Architecture Honest Notes
- The local LLM is inference-only; learning means RAG + adapters, not base-model retraining.
- LoRA adapters are separate from the base phi3 GGUF model and must be loaded alongside it.
- Python trainers produce `.safetensors`; node-llama-cpp requires `.gguf` adapter format.
- A conversion step is mandatory: Python adapter → llama.cpp convert → `.gguf`.
- CPU-only training is possible but slow: expected 6–20 hours for 100 pairs at rank 16.
- Goal: run fine-tuning on idle/no-user time via scheduler, with progress written to disk.

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

## Next Sprint Candidate
- Sprint 14 should be either:
  - Adapter Quality Improvement, or
  - VS Code Sidebar Views for related context and ideas
