# Sprint 13 — LoRA Readiness Analysis and Decision

Status: P2 COMPLETE — Decision recorded. Do not reopen.
Decision: LoRA postponed — paired dataset too small for meaningful fine-tuning.

## 1. Executive Summary

P0 and P1 are complete. 212 BC2 messages were ingested and a training export produced 1 paired example. The dataset is insufficient for LoRA fine-tuning. Decision: LoRA postponed. Minimum threshold to reopen: 50 paired examples.

## 2. Hardware Constraints

- OS: Windows11
- RAM: 16GB
- GPU: none (CPU-only)
- Python: 3.14.5

## 3. Dataset Size — Verified

- BC2 messages ingested: 212
- Training pairs exported: 1
- Tests baseline: 263/264

Root cause: message-level capture lacks full thread continuity, producing few user→assistant training pairs.

## 4. Toolchain Options

- Preferred: llama.cpp finetune (CPU-capable)
- Risky/blocked: Axolotl (requires Python ≤3.11)
- Non-viable: Unsloth (not suitable for Windows + Python 3.14.5 CPU environment)

## 5. Runtime Estimate

- 50 pairs: 8–16h
- 100 pairs: 2–4d
- 200 pairs: 5–10d

Estimates assume CPU-only training using `llama.cpp finetune` on available hardware.

## 6. Go/No-Go Criteria

- Micro-experiment gate: ≥10 paired examples
- Full pipeline gate: ≥50 paired examples
- Toolchain compatibility with Python 3.14.5 must be verified or Python downgraded to ≤3.11

## 7. Decision

LoRA postponed

## 8. Next Steps

1. Prioritize thread-based capture to collect multi-turn user→assistant pairs.
2. Re-run export using the gate command:

```
llm export-training --min-pairs 50
```

3. If paired count ≥50 and toolchain compatibility verified, proceed with `llama.cpp finetune`.

## 9. Risks and Dependencies

- Python 3.14.5 compatibility with Axolotl/Unsloth (blocked)
- CPU-only runtime increases wall-clock time and thermal risk
- Root cause: message-level capture lacks thread continuity, reducing paired-example yield
