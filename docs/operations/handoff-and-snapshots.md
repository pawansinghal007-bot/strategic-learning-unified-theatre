# Handoff and Snapshots

## Purpose
Explain how handoff and snapshot workflows support continuity between sessions.

## Current practice
- Active handoff state lives in the database.
- `strategic-learning-unified-theatre ai snapshot` generates compact context for the next session.
- Snapshots preserve the sprint ID, current priority, and key decisions without copying prose from the master instructions.

## Key commands
- `strategic-learning-unified-theatre ai snapshot`
- `strategic-learning-unified-theatre ai decisions add "<decision>"`
- `strategic-learning-unified-theatre ai lessons add "<lesson>"`
- `strategic-learning-unified-theatre handoff update <id> --tokens-used <n>`

## Notes
Keep snapshot and handoff workflows in the DB layer; do not duplicate them in curated docs.
