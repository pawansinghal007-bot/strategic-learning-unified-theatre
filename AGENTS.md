# AGENTS.md — Boot Contract

Read this file first, every session, every agent.

## Reading Order
1. User request (this task)
2. AGENTS.md (this file — behavior contract)
3. docs/standing-rules.md (architecture intent)
4. docs/sprints/sprint-<N>-prompt.md (current objective)
5. docs/build-state.md (current progress — reference only, not direction)
6. Relevant source files (actual implementation, task scope only)
7. Repo search (last resort, task scope only — never repo-wide for structure)

## Search Rule
Read docs first for architecture. Search only files directly relevant to
the current task. Never search repo-wide to "understand structure."

## Drift Rule
If source code contradicts Standing Rules: use the code for this task,
complete the task, then append a `DRIFT DETECTED` note to your response
naming the file and the specific contradiction. Do not edit Standing
Rules yourself.

## Confidence Rule
Tag every architectural claim you make:
- `[CONFIRMED]` — docs and code agree
- `[INFERRED]` — docs exist, code not checked
- `[UNVERIFIED]` — neither docs nor code confirmed

## Ownership
- AGENTS.md, Standing Rules → maintainer-owned, edited only outside sprints
- Build State → owned by sprint completion process, updated at sprint close
- Sprint Prompt → owned by current sprint, immutable once sprint starts

## Layer Roles (one line each)
AGENTS.md = behavior contract. Standing Rules = architecture intent.
Sprint Prompt = current objective. Build State = current progress.
Source files = actual implementation.
