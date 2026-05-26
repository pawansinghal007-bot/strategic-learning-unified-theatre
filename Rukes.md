Project: strategic-learning-unified-theatre at C:\SW Development\VS Code Agent\Solution

Sprint: Sprint 15.7 — Chaos, load & resilience testing
Goal: Prove the platform behaves predictably under stress, not just under happy paths. Ship a chaos harness with scripted fault injection, SLO targets, opt-in CI integration, and documented recovery/intervention procedures.

Rules:

- ESM only for src/ files, CommonJS for electron-ui/\*.cjs files, no build step
- TypeScript files (_.ts, _.tsx) compiled via existing tsconfig — do not add a new build pipeline
- Minimum-token execution, work locally only, no cloud API calls
- Windows PowerShell-compatible commands only (except where CI job runs on ubuntu-latest)
- No plaintext secrets in logs, code comments, fixtures, config, or test data
- Use Context7 before any library/package usage
- `use context7` means: append this directive to any sub-prompt that uses a library or package so documentation lookup is triggered
- Append `use context7` to sub-prompts
- Do not redesign the full app architecture
- Do not break existing handoff, snapshot, daemon, health, or experience.db flows
- Do not break IPC contract, adapter, preload surface, or sandbox settings from Sprint 15.4
- Do not break packaging, signing, updater, or health-state rollback flows from Sprint 15.5
- Do not break coverage gates, Robot suites, regression tests, or dashboard from Sprint 15.6
- vitest globals are enabled — do NOT import describe/it/expect/vi from "vitest" in .js/.jsx test files; use them as globals only. TypeScript test files (\*.test.ts) MAY import from "vitest" for type inference
- Chaos harness is CommonJS (require/module.exports) — it runs via node directly, not via vitest
- Work task by task. Stop and wait for explicit confirmation before starting the next task.
- Each task below includes its own prerequisites and context — read them before touching any file.
