# Code Review Pipeline

Input: { filePath: string }

## Step 1: review

agent: code-reviewer
prompt: |
Review the file at {{filePath}}.
Project root is /home/pawan/vscodeagent/Solution.
Use the read-file tool to read the file before reviewing.
Follow all instructions in your system prompt exactly.
Write your review in the required format and end with [DONE].
maxIterations: 5
doneMarker: [DONE]

## Iteration Budget Guidance

The `maxIterations: 5` setting remains adequate for agents using retrieval-first tool calls
(path-like/symbol-like classification). Each tool call iteration (including direct-return
path-like/symbol-like tools) consumes exactly one iteration. However, the `doneMarker` can
only be satisfied by a genuine model response (synthesis/semantic path), not by a direct-return
tool turn.

This means:

- An agent that makes only path-like/symbol-like tool calls will still need at least one
  additional iteration with no tool call to produce the `doneMarker` response.
- Existing generous budgets (e.g., 5 iterations) remain valid for typical multi-tool workflows.
- The iteration budget should account for: (number of tool calls) + (at least 1 synthesis turn).

For example, an agent making 3 path-like tool calls needs at least 4 iterations: 3 for the
tool calls + 1 final iteration for the synthesis response containing `[DONE]`.
