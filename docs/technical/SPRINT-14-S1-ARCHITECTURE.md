# Sprint 14 — Session S1 Architecture & Storage Decision

**Date**: 2026-05-24  
**Session**: S1 (Architecture & Storage Boundaries)  
**Status**: Complete  
**Focus**: Finalize the smallest safe architecture before S2/S3/S4 implementation.

---

## Executive Summary

Session S1 has finalized the architecture for Sprint 14's auto-resume supervisor. The design is **minimal, composable, and non-intrusive** to existing systems. All critical storage boundaries have been decided to avoid plaintext secrets, preserve handoff/snapshot continuity, and enable stateless resume behavior across VS Code restarts.

---

## Critical Questions — Answered

### 1. What is the current startup path for VS Code integration?

**Current state:**
- VS Code extension entry point: `vscode-extension/extension.js`
- Activation function: `activate(context)`
- Collector initialization: `initializeCollector(context, projectRoot, output)` (called immediately on activation)
- Daemon startup: Currently manual via `node ./src/cli.js daemon start` in terminal
- Extension runs passively; no auto-daemon on startup yet

**Startup path for Session 14 supervisor:**
- Hook into the existing `activate()` function in `vscode-extension/extension.js`
- Call a new lightweight `initializeSessionSupervisor(context)` function that:
  - **Does not block** extension activation (async, non-await, non-critical path)
  - Completes within 500 ms deadline
  - Loads secure credentials (provided by SecretStore)
  - Stores status/errors in the existing logger path for diagnostics only
  - Restores pending supervisor jobs from DB on startup
- The supervisor runs independently; extension deactivation does not stop the supervisor
- Implementation approach (child process, background watcher, etc.) is left to S2

---

### 2. Where is secure storage already implemented, and how is it accessed?

**Current implementation:**
- `src/secret-store.js` — **Already production-ready** ✓
  - Uses `keytar` (OS-level credential store) as primary adapter
  - Falls back to encrypted file store at `~/.vscode-rotator/secrets.enc`
  - Encryption: AES via `src/encrypt.js`
  - File permissions: Owner-only (Windows: applied via `icacls`; Unix: `chmod 600`)
  - Methods: `set(accountId, blob)`, `get(accountId)`, `delete(accountId)`

**Usage pattern:**
```javascript
const secretStore = new SecretStore();
await secretStore.set('provider-token', encryptedBlob);
const token = await secretStore.get('provider-token');
```

**Session 14 integration:**
- The supervisor will **reuse the exact same SecretStore** class
- No new secret storage mechanism is needed
- Secrets **never** stored in DB, logs, handoff payloads, or config files

---

### 3. How is handoff state currently written and resumed?

**Current handoff system:**
- Location: `.vscode-rotator/sprints/` (one JSON per sprint, stored per day)
- Schema: `SprintSchema` (zod-validated) in `src/agent-handoff.js`
- Handoff contains:
  - Sprint metadata (ID, goal, tokens, status)
  - Completed tasks list + pending tasks list
  - Blockers and test failures
  - Resume prompt (auto-generated from state)
  - Files changed, created
- Resumption: `strategic-learning-unified-theatre handoff resume <sprintId>` prints the prompt

**Resume flow:**
1. Agent reads sprint manifest from file
2. Agent calls `generateResumePrompt(sprint)` to construct continuation text
3. Prompt is written to stdout or fed to LLM
4. No automatic resume yet (manual copy-paste needed)

**Session 14 integration:**
- Sprint handoff remains **unchanged** — it is the current primary integration point
- Supervisor adds a **separate, lightweight metadata table** in the existing SQLite DB for:
  - Session reset time and retry scheduling state
  - **Not** a replacement for sprint handoffs; complementary only
  - Data is stripped of all secrets before storage

---

### 4. Which existing DB/file stores are best suited for supervisor runtime state?

**Options evaluated:**

| Store | Purpose | Existing? | Best for S14? | Rationale |
|---|---|---|---|---|
| `~/.vscode-rotator/experience.db` (SQLite) | Doc embeddings, mistakes, rubrics | ✓ Yes | **Yes** | Central DB; WAL enabled; atomic writes guaranteed |
| `~/.vscode-rotator/sprints/` (JSON per date) | Sprint handoff manifests | ✓ Yes | No (use for resumption only) | Not for runtime session state; handoff is the interface |
| `~/.vscode-rotator/secrets.enc` (encrypted file) | Credentials | ✓ Yes | **Yes** | For provider tokens only |
| `~/.vscode-rotator/daemon.log` (JSONL) | Daemon event log | ✓ Yes | **Yes** (read-only) | For diagnostic read; no supervisor writes |
| New SQLite table | Session supervisor state | New | **Yes** | Atomic, transactional, co-located with experience DB |

**Decided allocation:**
- **Supervisor runtime state** → New table in `experience.db` (see schema below)
- **Credentials** → Existing `SecretStore` (keytar + encrypted file fallback)
- **Logs** → Existing daemon.log or new minimal supervisor-specific log (no secrets)
- **Handoff payloads** → Continue using sprint manifest system (unchanged)

---

### 5. What is the smallest safe boundary between secrets, runtime state, logs, and handoff payloads?

**Decision Matrix:**

| Category | Store | Content Rules | Example |
|---|---|---|---|
| **Secrets** | SecretStore (encrypted file or keytar) | Provider token, refresh token, API key | `provider_token_xxx...`, `Bearer token`, session cookies |
| **Runtime state** | SQLite `session_supervisor` table | Session ID, reset_at time, retry count, goal (redacted) | `session_123`, `2026-05-25T14:30:00Z`, `3` |
| **Logs** | daemon.log (JSONL) | Event type, timing, non-secret status | `{"ts":"...", "type":"limit_hit", "reset_at":"..."}` |
| **Handoff payload** | sprint JSON manifest | Goal, completed tasks, pending tasks, **resume prompt only** | Plain English task list + prompt, no secrets |

**Key enforcement rules:**
1. **No plaintext secrets in any file except SecretStore** (which encrypts them)
2. **No response content in DB** — only `response_summary_redacted` or hash thereof
3. **No provider credentials in handoff** — only reference to secure store
4. **Resume prompts must not include token/key excerpts** — only references like "Provider token loaded from secure store"
5. **Logs may reference reset times but not credentials** — OK to log "reset_at: 2026-05-25T14:30:00Z", never log "token=xyz"

---

### 6. What data must be redacted or excluded from runtime persistence?

**Data NOT stored in DB or handoff:**
- API keys, tokens, or any credential material (→ SecretStore only)
- Full LLM response content (→ Redact to summary + hash)
- HTTP headers containing auth info (→ Strip before storing)
- Session cookies or refresh tokens (→ SecretStore only)
- File contents from error responses (→ Summarize only)

**Data STORED redacted:**
- `last_response_summary_redacted` → Plain English summary of response outcome, no token excerpts
  - Example: `"Last response returned 3 code suggestions and one error about missing dependency"`
  - Not: `"Response: [403 Unauthorized. Your token provider_token_xxx has expired...]"`
- `continuation_goal_redacted` → User's goal/intent, not response content
  - Example: `"Implement session supervisor with auto-resume on limit event"`
  - Not: `"Response was: 'Here is your implementation...'" [full response body]`

**Redaction implementation:**
- All responses parsed at ingest time (by document ingester)
- Content scrubbed before DB write via simple regex or manual parser:
  - Strip lines containing: `token`, `key`, `secret`, `bearer`, `auth`, `password`, `credentials`
  - Strip email addresses, IP addresses, machine names
  - Keep only: summary, action items, error class names (not full stack traces)

---

### 7. Which exact files should be created vs extended for Sprint 14?

**Files to CREATE (new, minimal stubs — no logic in S1):**
1. `src/session-supervisor.js` — Main orchestrator (S3)
2. `src/limit-detector.js` — Detects session limit signals (S3)
3. `src/resume-scheduler.js` — Schedules delayed resume tasks (S3)
4. `src/auto-handoff.js` — Generates machine-created handoff state (S3)
5. `src/startup-bootstrap.js` — Initializes supervisor on app start (S2)
6. `src/session-state-repo.js` → New SQLite repository for supervisor tables (S3)
7. `tests/startup-bootstrap.test.js` — Bootstrap initialization tests (S2)
8. `tests/session-supervisor.test.js` — Supervisor unit tests (S3)
9. `tests/limit-detector.test.js` — Limit parser tests (S3)
10. `tests/resume-scheduler.test.js` — Retry scheduling tests (S3)

**Files to EXTEND (existing files, additions only):**
1. `src/ai-memory/schema.sql` — Add 2 new tables for supervisor state (S3, deferred from S2):
   - `session_resume_metadata` (session_id, provider, model, reset_at, retry_at, retry_count, status)
   - `session_continuation_state` (session_id, goal_redacted, last_response_summary_redacted, resume_prompt, status, created_at)
2. `src/ai-memory/memory-db.js` — No changes (DB already handles new tables)
3. `vscode-extension/extension.js` — Add startup bootstrap call (S2)
4. `src/secret-store.js` — No changes (reuse as-is)
5. `package.json` — No new dependencies (all existing packages suffice)

**Files to LEAVE UNTOUCHED:**
- `src/agent-handoff.js` — Handoff system unchanged
- `src/watcher.js` — Daemon loop unchanged
- `src/daemon-runner.js` — Daemon startup unchanged
- All existing commands and LLM flows

---

## Database Schema — New Tables

**Table 1: `session_resume_metadata`**
```sql
CREATE TABLE session_resume_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  workspace_path TEXT,
  reset_at TEXT,
  retry_at TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Table 2: `session_continuation_state`**
```sql
CREATE TABLE session_continuation_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  goal_redacted TEXT,
  last_response_summary_redacted TEXT,
  last_prompt_hash TEXT,
  resume_prompt TEXT,
  completion_state TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES session_resume_metadata(session_id)
);
```

**Rationale:**
- Separated into two tables: metadata (timing, status) and state (content)
- All secrets excluded; credentials fetched from SecretStore on demand
- No blocking constraints; restart-safe design

---

## File Targets — Final List for S2, S3, S4

### Session S2 — Secure Store + Startup Bootstrap

**Create (stubs only):**
- `src/startup-bootstrap.js` — 1-file entry point for supervisor initialization

**Extend:**
- `vscode-extension/extension.js` — Wire in bootstrap call at activation
- `src/secret-store.js` — No code changes; document reuse pattern in comments

**Test:**
- New test: `tests/startup-bootstrap.test.js` — Verify bootstrap returns within 500 ms, loads secrets gracefully

**Note on Schema:** Database schema changes are deferred to S3 when limit detection logic actually requires state storage. This keeps S2 narrowly focused on startup bootstrap mechanics.

### Session S3 — Limit Detection, Auto Handoff, Delayed Resume

**Create (full implementation):**
- `src/session-supervisor.js` — Main orchestrator
- `src/limit-detector.js` — Parse limit events
- `src/resume-scheduler.js` — Schedule retry tasks
- `src/auto-handoff.js` — Generate machine handoff state
- `src/session-state-repo.js` → SQLite repository wrapper

**Extend:**
- `src/ai-memory/schema.sql` — Add 2 new tables (deferred from S2):
  - `session_resume_metadata` (session_id, provider, model, reset_at, retry_at, retry_count, status)
  - `session_continuation_state` (session_id, goal_redacted, last_response_summary_redacted, resume_prompt, status, created_at)

**Test:**
- `tests/session-supervisor.test.js`
- `tests/limit-detector.test.js`
- `tests/resume-scheduler.test.js`
- `tests/auto-handoff.test.js`

### Session S4 — Integration Validation & Docs

**Extend:**
- `strategic-learning-unified-theatre-master-instructions.md` — Add durable runtime rules only (not sprint notes)
- `docs/technical/module-map.md` (if exists) — Document new files
- `docs/technical/SPRINT-14-S1-ARCHITECTURE.md` — This file; add closeout section

**Test:**
- Run full test suite
- Validate startup integration
- Validate limit → checkpoint → resume flow
- Verify no plaintext secrets in artifacts

---

## Preserved Behaviors — Non-Breaking Guarantee

**All existing flows remain fully functional and unchanged:**

✓ **Handoff system** — Sprint manifests continue unchanged; `handoff list`, `handoff resume`, `handoff update` work as today  
✓ **Snapshot flow** — `strategic-learning-unified-theatre ai snapshot` continues to output current state  
✓ **Daemon log format** — Watcher daemon continues logging in JSONL format; no changes to daemon-runner.js  
✓ **Secure store** — SecretStore class reused as-is; no API changes  
✓ **CLI commands** — All existing commands (llm, handoff, ai, storage, browser, etc.) work without modification  
✓ **DB location** — Supervisor uses existing `.vscode-rotator/experience.db`; no migration, no new DBs  
✓ **App state persistence** — Experience database continues tracking documents, mistakes, rubrics; supervisor is complementary  

**Supervisor is additive only** — It coordinates resume behavior but does not replace, modify, or interfere with any existing system. If the supervisor fails to start, the app continues normally with all existing features intact.

---

## Design Principles Applied

1. **Minimal surface**: New code is additive; no refactors of handoff, daemon, or secret systems
2. **Composable**: Each module (supervisor, detector, scheduler, handoff generator) is independently testable
3. **Non-blocking**: Startup bootstrap completes in <500 ms and never blocks extension activation
4. **Stateless resumes**: Supervisor state is stored in DB, read on demand; no in-memory state shared between processes
5. **Secret isolation**: SecretStore is the only place credentials are handled; DB, logs, handoff are all secret-free
6. **Restart-safe**: Process termination and restart restore pending jobs from DB; no lost work

---

## Implementation Readiness

### ✅ Architecture Clear
- Startup path defined
- Secure store reuse confirmed
- DB schema locked (2 tables, non-breaking)
- Storage boundaries finalized

### ✅ No Code Written Yet
- Only design document created in S1
- File stubs will be added at S2/S3/S4 start
- No logic, no temporary state, no fake credentials

### ✅ Blocking Issues: None
- All dependencies exist (`better-sqlite3`, `keytar`, etc.)
- No conflicts with existing systems
- No platform-specific blockers (Windows + PowerShell supported)

---

## Next Steps

**S2 responsibilities:**
1. Create `startup-bootstrap.js` 
2. Wire bootstrap into `vscode-extension/extension.js`
3. Implement secure credential loading + graceful failure
4. Test bootstrap returns within 500 ms without blocking extension

**S3 responsibilities:**
1. Add 2 new tables to `schema.sql` (deferred from S2)
2. Implement supervisor, detector, scheduler, handoff generator
3. Add retry scheduling and continuation prompts
4. Test restart-safe resume and state recovery

**S4 responsibilities:**
1. Full integration validation
2. Verify no secret leakage
3. Update docs (durable rules only)

---

## Sign-Off

**Architecture Decision**: APPROVED  
**Design Review**: Passed  
**Blocking Issues**: None  
**Ready for S2**: Yes  

**This architecture document is binding for S2, S3, and S4. Do not deviate without explicit amendment.**
