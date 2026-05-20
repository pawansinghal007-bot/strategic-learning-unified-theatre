# Sprint 2 R3: Idea Store — Implementation Summary

## Overview

Successfully implemented a complete Idea Store system for vscode-rotator that stores ideas as structured local Markdown files with YAML front-matter. The system is readable by any text editor or agent without special tooling.

## Files Created/Modified

### 1. `package.json`
- Added `gray-matter@^4.0.3` dependency for YAML front-matter parsing

### 2. `src/idea-store.js` (Existing - Complete)
- **Project root detection**: Walks up directory tree until `.git` found, falls back to `~/.vscode-rotator/ideas/`
- **Storage location**: `<project-root>/.vscode-rotator/ideas/<YYYY-MM-DD>-<slug>.md` or global inbox
- **Core functions**:
  - `createIdea()` - Create new idea with title, body, project, tags, priority, status, linkedSprint
  - `listIdeas()` - Filter by project, tag, status with sorting by creation date
  - `findIdeaById()` - Retrieve specific idea by UUID
  - `updateIdea()` - Patch individual fields (status, tags, priority, body, etc.)
  - `markIdeaDone()` - Mark idea as complete
  - `linkIdeaToSprint()` - Associate idea with sprint
  - `exportIdeas()` - Export as concatenated Markdown (max 4000 tokens)
  - `getIdeaContext()` - Resolve project context and ideas directory
  - `deleteIdea()` - Remove idea file

### 3. `src/commands/idea.js` (Fixed)
- **Fixed**: Added missing `promptForValue()` helper function
- **CLI subcommands**:
  - `vscode-rotator idea add [--project <name>] [--tag <tag>] [--priority 1]`
  - `vscode-rotator idea list [--project <name>] [--tag <tag>] [--status inbox]`
  - `vscode-rotator idea view <id>`
  - `vscode-rotator idea link <id> --sprint <sprintId>`
  - `vscode-rotator idea done <id>`
  - `vscode-rotator idea export [--project <name>] [--status active]`

### 4. `src/cli.js` (Updated)
- Imported `bindIdeaCommands` from `./commands/idea.js`
- Called `bindIdeaCommands(program)` to register all idea subcommands

### 5. `tests/idea-store.test.js` (Updated/Enhanced)
- Comprehensive test coverage with **30+ test cases** including:
  - `createIdea()` - Valid metadata, title extraction, empty body rejection, defaults
  - `listIdeas()` - All ideas, filters by project/status/tag, sorting, empty directory
  - `findIdeaById()` - Retrieval and error handling
  - `updateIdea()` - Status, tags, priority, body updates with field preservation
  - `markIdeaDone()` - Done status update
  - `linkIdeaToSprint()` - Sprint association and updates
  - `exportIdeas()` - Project filtering, body trimming, token limiting, status filters
  - `getIdeaContext()` - Context resolution with and without `.git`
  - **YAML front-matter** - Round-trip verification, UUID preservation

### 6. `docs/README.md` (Added)
- **Idea Store section** with:
  - Storage location and file format explanation
  - YAML front-matter schema documentation
  - CLI command reference with examples
  - Constraints (4000 token limit, 500 char body trim)
  - Usage examples
  - Future VS Code extension integration guide

### 7. `README.md` (Updated)
- Added `vscode-rotator idea add|list|view|link|done|export` to CLI commands list
- Updated documentation reference to "Sprint 2+" guide

## YAML Front-Matter Format

```yaml
id: <UUID>                           # Unique identifier
created: <ISO8601>                   # Creation timestamp
project: <string>                    # Project name or "default"/"global"
tags: [string, ...]                  # Array of tags
status: inbox|active|parked|done     # Workflow status
priority: 1|2|3                      # Priority level
linkedSprint: <UUID or null>         # Associated sprint ID
```

## Export Format

Concatenated Markdown suitable for agent prompts:

```markdown
## Active ideas for myproject

### Feature Title [priority: 1]
Feature description and context...

---

### Bug Title [priority: 2]
Bug details...
```

**Constraints**:
- Output limited to ~4000 tokens (~16KB)
- Individual bodies trimmed to 500 chars if total exceeds limit
- Separator: `---` between ideas

## Testing Status

✅ All tests pass:
- `tests/idea-store.test.js` - 30+ test cases
- Existing test suites remain passing
- Dependencies installed successfully with `npm install --legacy-peer-deps`

## CLI Verification

✅ Confirmed:
- `vscode-rotator idea --help` displays all subcommands
- Commands properly bound in CLI
- No import errors

## Key Features

1. **Filesystem-First**: No database required, plain Markdown files
2. **Project-Aware**: Detects project via `.git`, falls back to global inbox
3. **Agent-Ready**: Export format optimized for pasting into prompts
4. **Flexible**: Any text editor or tool can read/write ideas
5. **Sprint Integration**: Ideas can be linked to active sprints
6. **Token-Aware**: Export automatically trims to fit within prompt constraints

## Future Enhancements (VS Code Extension)

- Browse ideas in sidebar
- Quick-create from command palette
- Status badges in editor
- One-click sprint linking
- Direct export-to-prompt action

## Status

✅ **Complete** - All requirements met, tests passing, CLI functional, documentation complete.
