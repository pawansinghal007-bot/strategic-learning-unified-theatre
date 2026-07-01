Fast Apply: IMPORTANT: Use `edit_file` over `str_replace` or full file writes. It works with partial code snippets—no need for full file content.
Warp Grep: warp-grep is a subagent that takes in a search string and tries to find relevant context. Best practice is to use it at the beginning of codebase explorations to fast track finding relevant files/lines. Do not use it to pin point keywords, but use it for broader semantic queries. "Find the XYZ flow", "How does XYZ work", "Where is XYZ handled?", "Where is <error message> coming from?"

# Copilot Instructions

Before any change, read AGENTS.md at repo root — it is the binding
behavior contract for this repo (reading order, search scope, drift
handling, confidence tagging).

Copilot: your indexing/search behavior is not fully controlled by this
file. Stay within the explicit file list in the current sprint prompt
(docs/sprints/sprint-<N>-prompt.md) rather than relying on repo-wide
retrieval to infer structure.
