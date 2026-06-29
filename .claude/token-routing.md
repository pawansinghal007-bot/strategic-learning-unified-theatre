# Token Routing Decision Matrix

## Context

Claude and Codex monthly quota exhausts in 3-4 days.
This matrix is the operational rule for every AI interaction.
Default answer is always: try local first.

## Rule: Local First, Cloud Only When Local Fails

### Route to local (#ask-local or #code-review) — zero quota:

- Explaining what a function, class, or module does
- Code review against project standards
- Writing or drafting unit tests (vitest)
- Summarizing a file
- Refactoring a single file
- Fixing a TypeScript error with the error message + file as context
- Answering "how does X work in this codebase"
- Debugging with a specific stack trace
- Sonar issue fixes (once fix-sonar command is built)

### Route to Claude API — costs quota, use deliberately:

- Designing a new module that doesn't exist yet (no pattern to follow)
- Cross-cutting changes spanning > 5 files simultaneously
- Sprint planning and architectural review
- When local gave a wrong or low-quality answer and you need better

### Route to Codex/Copilot autocomplete — always on, can't disable per-call:

- Inline code completion (this is the silent quota drain)
- Mitigation: use Copilot less for boilerplate, more for complex logic only
- Keybinding Ctrl+Shift+L gets you local answers faster than waiting for autocomplete

## Fastest Workflow (saves most quota)

Before touching Copilot chat or Claude:
Ctrl+Shift+L → type question → Enter (0 Claude tokens)

Before committing:
Ctrl+Shift+R (0 Claude tokens, full review)

When local answer isn't good enough:
Paste local output into Claude chat + "improve this" (1 Claude call instead of 5)

## Monthly Quota Projection

Current: exhausts in ~3-4 days
With local routing for 70% of chat tasks:
Claude quota: lasts ~10-14 days (3x improvement)
Codex quota: lasts ~5-7 days (autocomplete unchanged, chat reduced)
With local routing for 90% of chat tasks (disciplined use):
Claude quota: lasts full month
Codex quota: lasts ~10-12 days

The 90% target is realistic for in-project tasks. The 10% that needs
Claude is genuinely better with Claude — don't compromise on those.
