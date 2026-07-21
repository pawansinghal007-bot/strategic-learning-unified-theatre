# V17 — In-repo Docker / Tooling Orchestration

**Prompt**: Search the entire repo for any `docker-compose*.yml`, Dockerfile, or JS/TS code that programmatically starts/stops Postgres, Open-WebUI, SonarQube, CodeQL, kube-bench, ciscat, semgrep, or checkov. Distinguish repo-owned orchestration from references to the separate `/home/pawan/qwen-stack` compose file.

---

## Commands Run

```bash
# Search 1: Docker files (docker-compose, Dockerfile)
find . -maxdepth 5 -name "docker-compose*.yml" -o -name "docker-compose*.yaml" -o -name "Dockerfile" -o -name "Dockerfile.*" 2>/dev/null | grep -v node_modules | grep -v .git

# Search 2: Docker CLI commands in source code
grep -rni "docker-compose\|docker compose\|docker run\|docker start\|docker stop\|docker kill\|docker rm\|docker up\|docker-down" . --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.ps1" --include="*.cjs" --include="*.mjs" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=coverage --exclude-dir=playwright-report --exclude="electron-ui/main.bundled.cjs"

# Search 3: Postgres start/stop/connect orchestration
grep -rni "postgres\|postgresql\|pg.*connect\|pg.*start\|pg.*stop\|pg.*launch\|pg.*spawn" . --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.ps1" --include="*.cjs" --include="*.mjs" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=coverage --exclude-dir=playwright-report --exclude="electron-ui/main.bundled.cjs"

# Search 4: Open-WebUI orchestration
grep -rni "open-webui\|openwebui\|webui.*start\|webui.*stop\|webui.*docker\|webui.*container" . --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.ps1" --include="*.cjs" --include="*.mjs" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=coverage --exclude-dir=playwright-report --exclude="electron-ui/main.bundled.cjs"

# Search 5: SonarQube orchestration
grep -rni "sonarqube\|sonar.*start\|sonar.*stop\|sonar.*docker\|sonar.*container\|sonar.*launch" . --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.ps1" --include="*.cjs" --include="*.mjs" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=coverage --exclude-dir=playwright-report --exclude="electron-ui/main.bundled.cjs"

# Search 6: Security tool orchestration (CodeQL, ciscat, kube-bench, semgrep, checkov)
grep -rni "codeql\|ciscat\|kube-bench\|semgrep\|checkov" . --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.ps1" --include="*.cjs" --include="*.mjs" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=coverage --exclude-dir=playwright-report --exclude="electron-ui/main.bundled.cjs"

# Search 7: qwen-stack references (to distinguish external vs repo-owned)
grep -rni "qwen-stack\|/home/pawan/qwen-stack" . --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.ps1" --include="*.cjs" --include="*.mjs" --include="*.md" --include="*.json" --include="*.yml" --include="*.yaml" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=coverage --exclude-dir=playwright-report --exclude="electron-ui/main.bundled.cjs"
```

## Terminal Output

**Search 1** (Docker files): **Zero matches**
→ No `docker-compose*.yml`, `Dockerfile`, or `Dockerfile.*` anywhere in the repo.

**Search 2** (Docker CLI commands in source code): 1 hit

```
./.venv/lib/python3.11/site-packages/watchfiles/run.py:434:    on `docker compose stop` and other cases where SIGTERM is sent.
```

→ Noise. A docstring comment in a third-party Python package (`.venv`), not repo-owned code.

**Search 3** (Postgres): ~20KB results, all noise

```
./.venv/lib/python3.11/site-packages/pygments/lexers/sql.py — PostgresLexer definitions (third-party)
./.venv/lib/python3.11/site-packages/pygments/lexers/_postgres_builtins.py — Pygments lexer data (third-party)
./.venv/lib/python3.11/site-packages/... — Various .venv package references
./playwright-report/... — Bundled Playwright report assets
```

→ **One relevant repo-owned file**: `src/storage/run-migrations.ts` — connects to Postgres via `pg` library, does NOT start/stop it.

**Search 4** (Open-WebUI): 5 hits, all in `.venv`

```
./.venv/lib/python3.11/site-packages/oikb/connectors/github.py:21:  owner: Repository owner (e.g. "open-webui").
./.venv/lib/python3.11/site-packages/oikb/connectors/github.py:135:  github:open-webui/docs
./.venv/lib/python3.11/site-packages/oikb/connectors/web.py:61:  headers={"User-Agent": "oikb/0.1 (+https://github.com/open-webui/oikb)"}
./.venv/lib/python3.11/site-packages/oikb/connectors/gitlab.py:21:  owner: Project namespace (e.g. "open-webui").
./.venv/lib/python3.11/site-packages/oikb/connectors/gitlab.py:149:  gitlab:open-webui/docs
```

→ All third-party package references to the `open-webui` GitHub org. No repo-owned Open-WebUI orchestration.

**Search 5** (SonarQube): 2 relevant hits

```
./scripts/sonar-utils.mjs:31:  SONAR_TOKEN environment variable is not set...
./playwright-report-ui/trace/assets/defaultSettingsView-D31xz8zv.js:180 — bundled Playwright trace viewer asset
```

→ `scripts/sonar-utils.mjs` reads SonarQube reports via HTTP API. Does NOT start/stop SonarQube.

**Search 6** (Security tools: CodeQL, ciscat, kube-bench, semgrep, checkov): ~20KB results, all noise

```
./.venv/lib/python3.11/site-packages/pygments/lexers/codeql.py — Pygments CodeQL lexer (third-party)
./.venv/lib/python3.11/site-packages/pygments/lexers/_mapping.py:96 — CodeQLLexer registration (third-party)
./playwright-report/... — Bundled Playwright report assets
```

→ Zero repo-owned references to CodeQL, ciscat, kube-bench, semgrep, or checkov orchestration.

**Search 7** (qwen-stack references): Multiple hits, all external references

```
./src/knowledge/ingest/embedder.js:2    — Comment: "via the live qwen-stack embeddings service"
./src/knowledge/ingest/embedder.js:41   — Comment: "qwen-stack embeddings service in token-budget-aware batched requests"
./.claude/AGENTS.md:18                  — "Scan reports: /home/pawan/qwen-stack/reports/"
./.claude/mcp-usage-guide.md:57        — "cd /home/pawan/qwen-stack && docker compose up -d llm"
./.claude/mcp-usage-guide.md:64        — "docker compose up -d llm in qwen-stack dir"
./unified-theatre-continuity-summary.md — Multiple architectural references to qwen-stack
./inspect.json:72,213,301-303          — Docker inspect output of qwen-stack container
```

→ All references point to `/home/pawan/qwen-stack` as an **external** Docker Compose project. None are repo-owned orchestration.

## Code Evidence

### `src/storage/run-migrations.ts` — Postgres Connection (NOT Orchestration)

```typescript
// Lines 1-8
import pg from "pg";
const { Pool } = pg;
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "code-index-migrations");

// Lines 63-77 (CLI entry)
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  // ...
  await runMigrations(url);
}
```

→ Connects to an **already-running** Postgres instance via `DATABASE_URL`. No `docker run`, `spawn`, `exec`, or container management. Assumes Postgres is externally provisioned.

### `scripts/sonar-utils.mjs` — SonarQube API Client (NOT Orchestration)

```javascript
// Lines 26-33
export function getSonarToken() {
  const token = process.env.SONAR_TOKEN;
  if (!token) {
    throw new Error(
      "SONAR_TOKEN environment variable is not set. Set it to a SonarQube user token...",
    );
  }
  return token;
}

// Lines 43-54
export async function fetchJson(url, token) {
  const res = await fetch(url, { headers: authHeader(token) });
  // ...
  return res.json();
}
```

→ HTTP client for SonarQube REST API. Assumes SonarQube is **already running** at some URL. No container management.

### `src/knowledge/ingest/embedder.js` — qwen-stack Embedding Client (External)

```javascript
// Lines 2-4
/**
 * embedder.js — Batch text embedding via the live qwen-stack embeddings service.
 * Calls POST /v1/embeddings on the OpenAI-compatible endpoint (qwen3-emb-4b, 2560 dimensions).
 */

// Lines 13-14
const EMBEDDINGS_BASE_URL =
  process.env.EMBEDDINGS_URL ?? "http://localhost:8081";
```

→ HTTP client that calls the qwen-stack embeddings service at `localhost:8081`. Does NOT start/stop the container. Assumes it's externally managed.

### `.claude/mcp-usage-guide.md` — Manual Docker Command (External)

```markdown
## Prerequisites

Docker LLM must be running:
cd /home/pawan/qwen-stack && docker compose up -d llm
```

→ This is a **manual prerequisite instruction** pointing to `/home/pawan/qwen-stack` — an external directory outside the repo. Not programmatic orchestration within the repo.

### `inspect.json` — Docker Inspect Dump (External)

```json
{
  "com.docker.compose.project": "qwen-stack",
  "com.docker.compose.project.config_files": "/home/pawan/qwen-stack/docker-compose.yml",
  "com.docker.compose.project.working_dir": "/home/pawan/qwen-stack"
}
```

→ Static Docker inspect output of a qwen-stack container. Reference data, not orchestration code.

## Verdict

**Missing**

## Notes

- **Zero Docker files** (`docker-compose*.yml`, `Dockerfile`) exist in the repo.
- **Zero programmatic Docker/container orchestration** in source code — no `docker run`, `docker compose up`, `child_process.spawn("docker")`, or Docker SDK usage.
- All tooling (Postgres, SonarQube, qwen-stack embeddings) is assumed to be **externally managed** and already running. The repo only contains HTTP clients that connect to these services.
- The only `docker compose` command in the entire repo is a manual instruction in `.claude/mcp-usage-guide.md` pointing to `/home/pawan/qwen-stack` — an external directory.
- Security tools (CodeQL, ciscat, kube-bench, semgrep, checkov) have zero repo-owned orchestration references.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Missing.**

No `docker-compose*.yml` or `Dockerfile` in this repo. Tooling (Postgres, Sonar, qwen-stack, security scanners) is externally assumed. `inspect.json` and docs reference `/home/pawan/qwen-stack` as a separate compose project — correctly distinguished. No material corrections.
