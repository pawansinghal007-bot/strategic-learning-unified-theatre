# Sprint 13 Prompt — LoRA Fine-Tuning Pipeline

**Date**: 2026-05-23  
**Project**: Strategic Learning Unified Theatre  
**Status**: Planning  
**Estimated tokens**: 95K  
**Goal**: Design and implement local LoRA adapter training pipeline for phi3 model fine-tuning

---

## HANDOFF BOOTSTRAP

⚡ **CRITICAL — Read this FIRST before anything else:**

```bash
# Instead of reading full master instructions (8000 tokens):
cd Solution
strategic-learning-unified-theatre ai snapshot > ../sprint-13-snapshot.txt
```

Then paste that snapshot output (~500 tokens) here. This replaces the entire master instructions file.

---

## Documentation Rule
For any library, framework, or package question during Sprint 13:
1. Use Context7 to resolve the library ID first
2. Fetch version-specific docs before generating code
3. Never guess APIs — always verify with Context7
4. Place the trigger at the end

For best results, place `use context7` at the end of your prompt.

## Recommended Runtime Pattern
Because local LLM inference is slow, this sprint should assume a background experience service:
- run a local daemon/service to ingest VS Code signals, browser responses, and training feedback continuously
- store metadata in `experience.db`
- compute embeddings incrementally in the background
- maintain a searchable retrieval index
- keep training/adaptation off the hot path by collecting examples during normal use, running fine-tuning when idle, and updating the active adapter after completion

> Note: The shared experience DB daemon is now deployed and running. The live store is `~/.vscode-rotator/experience.db`.

## SESSION PREPARATION CHECKLIST

```
Before implementing ANY code:

□ Run snapshot command above (500 tokens context)
□ Read: Solution/sprints/SPRINT-12-SNAPSHOT.md (completed state)
□ Verify: npm run test:solution (244/244 passing baseline)
□ Confirm: experience.db size and content count
  - SELECT COUNT(*) FROM prompt_history WHERE rating >= 4;
  - SELECT COUNT(*) FROM documents WHERE quality='good';
  - SELECT COUNT(*) FROM rubric_rules;
```

---

## Sprint 13 Goals (Analysis → Implementation)

### Phase 1: Analysis Only (No Code Yet)
**Deliverable**: `Solution/sprints/SPRINT-13-ANALYSIS.md`

Before writing any Python/Node.js, answer these 5 questions in writing:

1. **Data Readiness**
   - Is `experience.db` populated with enough quality data?
   - Query results needed:
     ```sql
     SELECT COUNT(*) as quality_prompts FROM prompt_history WHERE rating >= 4;
     SELECT COUNT(*) as good_docs FROM documents WHERE quality='good';
     SELECT COUNT(*) as threads FROM documents WHERE source_type='thread-turn';
     ```
   - **Decision**: If <50 total pairs, implement DATA COLLECTION plan instead of training.
   - **Decision**: If ≥50, proceed to implementation.

2. **Training Data Format**
   - Phi3 requires exact instruction format:
     ```
     <|user|>
     {instruction}
     <|end|>
     <|assistant|>
     {response}
     <|end|>
     ```
   - How will you export from `experience.db` to JSONL matching this format?
   - How will you handle multi-turn conversations (thread-turn documents)?
   - **Answer**: Sketch the export schema in SPRINT-13-ANALYSIS.md

3. **Training Toolchain**
   - Two options:
     a) **Python approach**: Huggingface `transformers`, LoRA via `peft`, convert to GGUF via llama.cpp
     b) **Node.js approach**: `node-llama-cpp` native training (if supported) or shell-out to Python
   - **Constraint**: CPU-only (no CUDA/GPU required)
   - **Constraint**: Training must run via scheduler on idle time (not block main daemon)
   - **Decision**: Which approach will you use? Why?

4. **Adapter Management**
   - Adapters will be versioned and stored in `~/.vscode-rotator/models/adapters/`
   - Each adapter needs metadata: date created, base model version, training data count, loss score
   - Active adapter must be loadable alongside base model in `inference.js`
   - **Question**: How will you version adapters? (e.g., adapter-2026-05-23-16-00.gguf?)
   - **Question**: How will you track "active" adapter for inference?

5. **Success Metrics**
   - Define how you will know this sprint succeeded:
     - Test baseline must remain ≥244 passing (no regression)
     - LoRA adapter loads without error in inference
     - Training completes in <20 hours on CPU
     - Adapter improves prompt generation vs baseline (subjective first pass)
   - **Question**: What will you measure/log?

---

### Phase 2: Implementation (After Analysis Approved)

**If data is sufficient** (≥50 pairs):

Implement in order:

1. **Export Pipeline** (`src/llm/finetune-exporter.js`)
   - Read experience.db (prompt_history, documents, rubric_rules)
   - Serialize to JSONL using Phi3 instruction format
   - Filter: only rating ≥4 from prompt_history
   - Include: rubric_rules as system prompts
   - Output file: `~/.vscode-rotator/finetune/training.jsonl`
   - Unit tests: ≥5 tests covering format, filtering, multi-turn

2. **Training Runner** (`src/llm/finetune-runner.js`)
   - Wrapper around Python LoRA trainer (or node-llama-cpp if available)
   - Inputs: training.jsonl, base model path, output adapter path
   - Outputs: GGUF adapter, training log, loss/perplexity metrics
   - Must support dry-run (planning) vs. actual training
   - Unit tests: ≥3 tests covering dry-run, error handling

3. **Adapter Manager** (`src/llm/adapter-manager.js`)
   - List available adapters in `~/.vscode-rotator/models/adapters/`
   - Activate/deactivate adapters (set symlink or metadata file)
   - Validate adapter compatibility with base model
   - Unit tests: ≥3 tests covering list, activate, validation

4. **CLI Commands** (`src/commands/llm.js` — extend)
   ```bash
   strategic-learning-unified-theatre llm export-training [--output <path>]
   strategic-learning-unified-theatre llm train [--dry-run]
   strategic-learning-unified-theatre llm adapters list
   strategic-learning-unified-theatre llm adapters activate <name>
   strategic-learning-unified-theatre llm adapters benchmark
   ```
   - Help text required; examples in README
   - Tests: ≥2 smoke tests per command

5. **Scheduler Integration** (`src/watcher.js` — extend)
   - Add training trigger on idle (e.g., if no activity for 30min)
   - Write training progress to `~/.vscode-rotator/finetune/finetune.log`
   - On completion, write manifest to `~/.vscode-rotator/finetune/adapter-manifest.json`
   - Tests: ≥2 tests covering idle detection, logging

6. **Inference Adapter Loading** (`src/llm/inference.js` — extend)
   - Detect and load active adapter on startup
   - Graceful fallback to base model if adapter missing/invalid
   - Inference signature unchanged (adapter loading is transparent to caller)
   - Tests: ≥2 tests covering adapter load, fallback

---

## Lessons Learned from Sprint 12 (Apply Now)

1. **Test First, Code Second**
   - Sprint 12 created tests alongside implementation
   - Recommend: write test structure before implementation
   - Target: ≥2 tests per module, minimum; ideally 3–5

2. **Staging + Flush Pattern**
   - Sprint 12's signal collector used in-memory buffer + flush to disk
   - Recommend: apply same pattern to training data prep
   - Pattern: collect → serialize → validate → flush to JSONL

3. **Configuration Over Hard-Coding**
   - Sprint 12 added `.vscodeLearn` config keys
   - Recommend: add `.finetune` config section for training parameters
   - Keys: `enabled`, `modelRank`, `epochs`, `batchSize`, `maxIdleMinutesBeforeRun`

4. **Atomic File Operations**
   - Sprint 12 used temp file → rename pattern
   - Recommend: use for adapter files (write to .tmp, rename on success)

5. **Clear Error Messaging**
   - Sprint 12 errors are logged with [capture:response] prefixes
   - Recommend: log training progress with [finetune] prefix so users can track via logs

6. **DB State Is Source of Truth**
   - Sprint 12's signal collector relies on DB state, not markdown files
   - Recommend: same for training — all metadata in DB, not JSON files
   - Add tables if needed: `adapter_versions`, `training_runs`, `benchmark_results`

7. **Non-Blocking Async**
   - Sprint 12's daemon and signals are non-blocking
   - Recommend: training should NOT block CLI or daemon
   - Use Node.js Worker Threads or spawn child process for training

---

## Implementation Constraints & Patterns

### Must Have

- ✅ No cloud API calls (local-only, no external training services)
- ✅ CPU-only (no GPU required)
- ✅ ESM modules (consistent with codebase)
- ✅ Atomic file writes (temp → rename → chmod)
- ✅ Config-driven training parameters (no hardcoded values)
- ✅ All new commands tested via Vitest
- ✅ Test baseline ≥244 passing (no regressions)
- ✅ Non-blocking training (runs on idle, via scheduler)

### Code Style (From Sprint 12 & Prior)

```javascript
// Logging pattern — use context-specific prefix
console.log('[finetune] training started', { modelRank: 16, epochs: 3 });
console.error('[finetune] error during export:', err.message);

// Config access
const config = loadConfig(); // from src/config.js
const finetuneConfig = config.finetune || { enabled: false, modelRank: 16 };

// Async file operations
const tmpFile = path.join(exportDir, 'training.jsonl.tmp');
await fs.writeFile(tmpFile, jsonlContent);
await fs.rename(tmpFile, finalPath); // atomic

// Error handling — fail fast with context
if (!data || data.length === 0) {
  throw new Error('No training data exported; check experience.db and quality filters');
}
```

---

## File Structure (After Implementation)

```
Solution/
├── src/
│   ├── llm/
│   │   ├── finetune-exporter.js      [NEW]
│   │   ├── finetune-runner.js        [NEW]
│   │   ├── adapter-manager.js        [NEW]
│   │   ├── inference.js              [UPDATED — load adapter]
│   │   └── embeddings.js             [unchanged]
│   ├── commands/
│   │   ├── llm.js                    [UPDATED — new CLI commands]
│   │   └── ...
│   ├── watcher.js                    [UPDATED — training trigger]
│   ├── config.js                     [UPDATED — finetune config]
│   └── ...
├── tests/
│   └── llm/
│       ├── finetune-exporter.test.js [NEW]
│       ├── finetune-runner.test.js   [NEW]
│       ├── adapter-manager.test.js   [NEW]
│       └── ...
└── Solution/sprints/
    ├── SPRINT-13-ANALYSIS.md         [REQUIRED FIRST]
    ├── SPRINT-13-CODING-LOG.md       [FILLED DURING IMPLEMENTATION]
    └── SPRINT-13-SNAPSHOT.md         [CREATED AT HANDOFF]
```

---

## Test Targets

By end of sprint:
- ✅ `SPRINT-13-ANALYSIS.md` complete (answers 5 questions)
- ✅ Exporter: ≥5 unit tests (format, filtering, edge cases)
- ✅ Runner: ≥3 unit tests (dry-run, error, success)
- ✅ Adapter Manager: ≥3 unit tests (list, activate, validate)
- ✅ CLI: ≥2 smoke tests per command
- ✅ Scheduler: ≥2 integration tests (idle detection, logging)
- ✅ Inference: ≥2 tests (adapter load, fallback)
- ✅ Full suite: ≥244 tests passing, 0 regressions
- ✅ Manual E2E: run training export → train → activate → query

---

## Optional Enhancements (If Time Permits)

- Adapter benchmarking against base model (A/B comparison)
- Training dashboard/web UI to monitor progress
- Automatic adapter rollback on inference failure
- Adapter pruning (remove low-performing adapters after N training runs)

---

## Success Checklist at Handoff

Before writing the `SPRINT-13-SNAPSHOT.md`:

- [ ] SPRINT-13-ANALYSIS.md complete with data readiness decision
- [ ] All modules implemented (exporter, runner, manager, CLI)
- [ ] All ≥15 unit tests passing
- [ ] CLI commands working end-to-end (export, train dry-run, list, activate)
- [ ] Scheduler integration tested (training triggered on idle, logged)
- [ ] Inference loads adapter without error
- [ ] Full test suite: 244+ tests passing, 0 regressions
- [ ] SPRINT-13-CODING-LOG.md updated with implementation notes
- [ ] README.md updated with new commands
- [ ] Code review completed (branding consistent, no hardcoded paths)

---

## Quick Start Commands

```bash
# After cloning / setup
cd Solution
npm install                           # Ensure deps installed
npm run test:solution                 # Verify baseline (244 passing)
npm test -- src/llm/                  # Run LLM tests as you code
npm run start -- llm export-training   # Smoke test CLI
```

---

## References

- `SPRINT-13-PLAN.md` — High-level architecture notes
- `Solution/sprints/SPRINT-12-SNAPSHOT.md` — Previous handoff summary
- `Solution/docs/README.md` — Architecture & module map
- `strategic-learning-unified-theatre-master-instructions.md` — Long-term rules

---

## Key Contacts / Review Gates

- **Code review**: Ensure no old branding (`vscode-rotator`), all paths use `~/.vscode-rotator`, new commands documented
- **Test review**: Verify ≥15 tests written, all passing, no brittleness
- **Integration review**: Confirm CLI works, scheduler doesn't block, adapter loads correctly

---

**Status**: Ready for handoff (analysis phase)  
**Token budget**: 95K estimated (leaves 55K for actual development)  
**Target completion**: 2026-05-30 (1 week)

---

## Appendix: SQL Queries for Phase 1 Analysis

```sql
-- Check data readiness
SELECT 
  COUNT(*) FILTER (WHERE rating >= 4) as quality_prompts,
  COUNT(*) as total_prompts
FROM prompt_history;

-- Good documents  
SELECT 
  COUNT(*) FILTER (WHERE quality='good') as good_docs,
  COUNT(*) FILTER (WHERE source_type='thread-turn') as threads,
  COUNT(*) as total_docs
FROM documents;

-- Rubric rules
SELECT COUNT(*) as rubric_count FROM rubric_rules;

-- Combined training signal
SELECT 
  (SELECT COUNT(*) FROM prompt_history WHERE rating >= 4) +
  (SELECT COUNT(*) FROM documents WHERE quality='good') 
  as estimated_training_pairs;
```

If result < 50: Implement data collection priority.  
If result ≥ 50: Proceed to implementation phase.

---

**Prompt created**: 2026-05-23  
**Guidelines applied**: Master instructions §TOKEN REDUCTION FUNCTION + Sprint 12 lessons  
**Ready for**: Claude / ChatGPT session start
