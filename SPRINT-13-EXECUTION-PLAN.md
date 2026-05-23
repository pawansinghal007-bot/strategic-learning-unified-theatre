# Sprint 13 — Browser-to-Experience Bridge and LoRA Readiness

## Sprint Objective

Sprint 13 should be executed as a data-bridge sprint, not a full fine-tuning sprint. The priority is to connect Browser Capture v2 into `experience.db`, generate reviewable training exports, and produce a written readiness decision before any LoRA pipeline implementation begins [file:1].

## Current Baseline

- Sprint 12.1 is complete and Browser Capture v2 is validated with working API endpoints and captured browser/chat activity [file:1].
- The main platform vision explicitly depends on online LLM conversations being ingested into the local experience database so future prompts improve over time [file:1].
- The repository baseline is 263/264 tests passing, with one long-running Ollama timeout test still failing and noted as unrelated to Sprint 12 completion [file:1].
- The project already mandates snapshot-based handoffs to reduce context load, which supports keeping Sprint 13 focused and tightly scoped [file:1].

## Sprint Theme

**Connect the data first, then decide whether training is feasible.** This matches the project’s architecture and avoids building a training pipeline before the system has a clean, dependable training-data path [file:1].

## In Scope

- Bridge Browser Capture v2 data from `capture.db` into `experience.db` [file:1].
- Export training-ready JSONL from captured and ingested conversations [file:1].
- Produce a LoRA readiness audit for the current machine and dataset state [file:1].
- Stabilize the one failing timeout test if it affects day-to-day confidence in the suite [file:1].
- Reduce instruction sprawl only if it directly improves Sprint 13 execution or handoff quality [file:1].

## Out of Scope

- Full LoRA training pipeline implementation.
- Adapter versioning and adapter loading rollout.
- Major UI expansion.
- Broad architecture refactors unrelated to the browser-to-experience bridge.

## Workstreams

## P0 — bc2 to experience.db Bridge

### Goal

Close the most important missing loop: Browser Capture v2 should no longer remain isolated in `capture.db`; captured chat data should be available inside `experience.db` through the existing ingestion system [file:1].

### Tasks

- [ ] Create a `bc2-sync` command or background daemon.
- [ ] Read new `chat_messages` and related session metadata from `capture.db`.
- [ ] Map bc2 records into the existing document-ingestion flow instead of creating a second parallel ingestion system.
- [ ] Store ingested records in `experience.db` with metadata such as `source_type: bc2-chat`, platform, session/thread ID, timestamps, and capture source.
- [ ] Make ingestion idempotent using stable source identifiers or content hashes.
- [ ] Add logging for imported count, skipped duplicates, and failed records.
- [ ] Add unit and integration tests for mapping, duplicate prevention, and metadata persistence.

### Acceptance Criteria

- [ ] New bc2 chat records appear in `experience.db` after sync.
- [ ] Re-running sync does not create duplicate documents.
- [ ] Imported records preserve platform, time, session/thread linkage, and source metadata.
- [ ] Sync works both manually and in a scheduled mode.
- [ ] Failures are visible in logs and do not corrupt the target DB.

### Developer Notes

Prefer a thin bridge layer over a new storage model. The safest design is `capture.db -> mapper -> DocumentIngester -> experience.db`, because that reuses the current R5 architecture instead of bypassing it [file:1].

## P1 — Training Export Pipeline

### Goal

Create a dependable export path for supervised training examples so the team can inspect data quality before attempting any fine-tuning [file:1].

### Tasks

- [ ] Add `GET /events/export-for-training` or a CLI equivalent such as `llm export-training`.
- [ ] Emit JSONL with a stable schema for prompt/response pairs.
- [ ] Include metadata fields such as platform, source type, timestamps, session ID, quality label, and export version.
- [ ] Support filtering by date range, platform, source type, and quality.
- [ ] Add schema validation tests.
- [ ] Generate at least one reviewed sample export file from real captured data.

### Acceptance Criteria

- [ ] Export produces valid JSONL.
- [ ] Every line is parseable and schema-consistent.
- [ ] Export can be filtered by platform, date, and source type.
- [ ] A sample export can be manually reviewed without post-processing.
- [ ] Exported examples are clearly traceable back to source records.

### Developer Notes

Do not overfit the schema to one training tool. Keep it simple and portable so it can later feed multiple candidate LoRA toolchains.

## P2 — LoRA Readiness Audit

### Goal

Decide whether LoRA on the current CPU-only machine is practical before any engineering time is spent on a production training pipeline [file:1].

### Tasks

- [ ] Create `SPRINT-13-ANALYSIS.md`.
- [ ] Document candidate toolchains and trade-offs for the current environment.
- [ ] Estimate available dataset size from `experience.db` and exported JSONL.
- [ ] Run a small benchmark or dry-run estimate for training/inference feasibility on current hardware.
- [ ] Define go/no-go criteria such as maximum acceptable wall-clock runtime and minimum viable dataset size.
- [ ] Recommend one of three outcomes: proceed, postpone, or run only a micro-experiment.

### Acceptance Criteria

- [ ] A written readiness audit exists in the repo.
- [ ] The audit names the recommended toolchain or explicitly recommends deferral.
- [ ] The audit includes hardware constraints, dataset estimate, and expected runtime bounds.
- [ ] The audit ends with a concrete decision, not an open-ended note.

### Developer Notes

The hardware note in the master instructions already accepts slow local inference, but training may still be impractical; this workstream exists to make that decision explicit rather than assumed [file:1].

## P3 — Test Suite Stability

### Goal

Remove avoidable drag from the one known timeout failure so Sprint 13 work does not sit on top of a psychologically “almost green” suite [file:1].

### Tasks

- [ ] Review `tests/llm/ollama-inference.test.js`.
- [ ] Decide whether the correct fix is a longer timeout, a mock, or separating a slow integration test from the default fast suite.
- [ ] Keep one meaningful verification path for real Ollama behavior.
- [ ] Update test documentation if the suite behavior changes.

### Acceptance Criteria

- [ ] Default test run is green or intentionally excludes slow integration tests with clear labeling.
- [ ] No false negative timeout remains in normal development workflow.
- [ ] Real inference behavior is still covered somewhere in the test strategy.

### Developer Notes

This is not the most strategic item, but it improves execution quality and confidence during the sprint.

## P4 — Snapshot and Instruction Cleanup

### Goal

Reduce dependence on the growing master instructions file by moving dynamic sprint state into the snapshot pattern already mandated by the project [file:1].

### Tasks

- [ ] Identify dynamic content that should no longer live in the master instructions.
- [ ] Move active sprint state, blockers, and next-step tracking into DB-backed snapshot tables or existing snapshot flow.
- [ ] Keep the master file focused on architecture, module map, rules, and stable conventions.
- [ ] Update developer start-of-session instructions to prefer compact snapshot context.

### Acceptance Criteria

- [ ] Active sprint state is accessible through a smaller snapshot flow.
- [ ] The master instructions stop expanding with operational sprint detail.
- [ ] Handoff quality remains equal or better after the cleanup.

### Developer Notes

Do this only after P0 to P2 unless the document size is actively slowing execution during the sprint.

## Sequence

1. P0 — bc2 to `experience.db` bridge.
2. P1 — training JSONL export.
3. P2 — readiness audit and decision.
4. P3 — timeout test stabilization.
5. P4 — snapshot/instruction cleanup.

## Exit Criteria

Sprint 13 is complete only when all of the following are true:

- [ ] Browser Capture v2 data flows into `experience.db` through a repeatable ingestion path.
- [ ] Training examples can be exported as valid JSONL and manually reviewed.
- [ ] A written LoRA readiness decision exists with a clear go/no-go outcome.
- [ ] The default development test experience is stable enough to support the next sprint.
- [ ] No full LoRA pipeline has been started without the readiness decision.

## Risk Register

| ID | Risk | Impact | Likelihood | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | LoRA training is too slow on current hardware | High | High | Complete P2 before any training pipeline work; allow only a micro-experiment if the audit supports it | Sprint owner |
| R2 | `capture.db` and `experience.db` schemas do not map cleanly | High | Medium | Add a mapping layer with explicit field transforms and test with real captured samples | P0 owner |
| R3 | Duplicate ingestion occurs on repeated sync runs | Medium | Medium | Use stable IDs, hashes, or source keys and enforce idempotent import behavior | P0 owner |
| R4 | Exported JSONL is structurally valid but low quality for training | High | Medium | Add manual sample review and quality filters before any downstream training decision | P1 owner |
| R5 | Timeout test continues to erode confidence in CI | Medium | Medium | Separate slow integration coverage or adjust timeout with clear labeling | P3 owner |
| R6 | Master instructions continue growing and dilute handoff quality | Medium | High | Move dynamic state into snapshot/DB-backed storage and keep the master file stable | P4 owner |
| R7 | Sprint scope expands into premature LoRA engineering | High | Medium | Treat P2 as a gate; no P5 work until decision criteria are met and signed off | Sprint owner |

## Suggested Deliverables

- `src/commands/bc2-sync.js` or equivalent command wiring.
- Mapping/ingestion updates in the R5 ingestion path.
- Export endpoint or CLI command for training JSONL.
- `SPRINT-13-ANALYSIS.md` with explicit recommendation.
- Tests covering sync, dedupe, export schema, and any timeout strategy changes.
- Updated handoff snapshot entries at sprint close.

## Definition of Done

Sprint 13 is done when the project has a working browser-to-experience bridge, a usable export path, and a documented answer to the question: “Should this machine attempt LoRA now?” That is the smallest honest milestone that moves the system forward without overcommitting to a pipeline the current hardware may not support [file:1].

## P3.1 — Added Scope (post-P3 approval)

**Approved**: 2026-05-24, after P3 completion
**Rationale**: Master instructions file had grown to ~900 lines. Dynamic sprint state was being appended mid-sprint, making the file slow to load and unreliable as a stable architecture reference. P3.1 was added to enforce a DB-first state policy and reduce the file to a stable, audit-ready document.

**In scope**:
- Insert DB-first workflow policy into master instructions
- Move dynamic sprint state out of master file
- Add continuous documentation maintenance rule
- Add Completed Sprints summary table
- Update Module Map and Data Locations for Sprint 13 deliverables
- Replace End-of-Sprint Checklist with DB-first version
- Enforce 400-line ceiling going forward

**Out of scope**:
- Full documentation system redesign
- New product docs
- Feature code, architectural refactors, new commands, infrastructure changes

**Outcome target**: Master file under 400 lines, stable between sprints, with DB as live state store and snapshot command as session context loader.
