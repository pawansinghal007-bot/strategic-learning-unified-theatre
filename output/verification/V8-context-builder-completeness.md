# V8 — Context Builder Completeness (Engine 4: Context Builder)

## Commands Run

```bash
# Read the gateway module (full file)
cat src/llm/gateway.ts

# Read the request-context module (the only context source imported by gateway)
cat src/memory/request-context.ts

# List all imports in gateway.ts
grep -n "^import " src/llm/gateway.ts

# Search for RAG, book content, PMBOK, TMF, prior mistakes, prompt history in gateway.ts
grep -rni "rag\|book.*content\|pmbok\|tmf\|prior.*mistake\|mistake.*track\|prompt.*history\|experience.*db\|knowledge.*graph" src/llm/gateway.ts

# Search for same in request-context.ts
grep -rni "rag\|book.*content\|pmbok\|tmf\|prior.*mistake\|mistake.*track\|prompt.*history\|experience.*db\|knowledge.*graph" src/memory/request-context.ts

# Search for imports of mistake/experience/knowledge/rag/pmbok/tmf/book in gateway.ts
grep -ni "import.*mistake\|import.*experience\|import.*knowledge\|import.*rag\|import.*pmbok\|import.*tmf\|import.*book" src/llm/gateway.ts

# Search for same in request-context.ts
grep -ni "import.*mistake\|import.*experience\|import.*knowledge\|import.*rag\|import.*pmbok\|import.*tmf\|import.*book" src/memory/request-context.ts

# Search for buildRequestContextPrompt consumers across the repo
grep -rn "buildRequestContextPrompt" --include="*.ts" --include="*.js"
```

## Terminal Output

### Imports in gateway.ts

```
Found 13 import statements in src/llm/gateway.ts:
1:  import { ProviderAdapter, ProviderName, ProviderRequest, ProviderResponse, TokenChunk } from "../shared/contracts/provider";
8:  import { providerRequestSchema, providerResponseSchema, tokenChunkSchema } from "../shared/schemas/provider.schema";
13: import { DomainError, RoutingNoProviderError, ValidationFailedError } from "../shared/errors";
18: import { logger } from "../shared/logging/logger";
19: import { GeminiProviderAdapter, GroqProviderAdapter, LocalProviderAdapter, OpenAIProviderAdapter, PerplexityProviderAdapter } from "./providers";
26: import { getProviderHealthSnapshot, isProviderAvailable, markProviderFromError } from "./provider-health";
31: import { recordProviderFailure, recordProviderSuccess } from "./provider-usage";
32: import { evaluateWorkspaceQuotaStatus, recordWorkspaceQuotaUsage } from "../governance/workspace-quotas.js";
36: import { explainRoutingSelection } from "./routing-explainer";
37: import { recordRoutingDecision } from "./routing-history";
38: import { applyPolicyToCandidatesWithReason, getState } from "../policies/provider-policy";
42: import { buildRequestContextPrompt } from "../memory/request-context";
43: import { truncateToTokens } from "./agent-loop-guard.js";
```

### Search: RAG/book content/PMBOK/TMF/prior mistakes/prompt history in gateway.ts

```
Found 0 matches.
Zero matches for RAG, book content, PMBOK, TMF, prior mistakes, prompt history, experience DB, or knowledge graph in src/llm/gateway.ts.
```

### Search: Same in request-context.ts

```
Found 1 match (false positive — "storage" in import path):
src/memory/request-context.ts:1: import { readJsonFile, writeJsonFile } from "../llm/storage";
Zero actual matches for RAG, book content, PMBOK, TMF, prior mistakes, prompt history, experience DB, or knowledge graph.
```

### Search: Imports of mistake/experience/knowledge/rag/pmbok/tmf/book in gateway.ts

```
Found 0 matches.
```

### Search: Same in request-context.ts

```
Found 1 match (false positive — "storage" in import path):
src/memory/request-context.ts:1: import { readJsonFile, writeJsonFile } from "../llm/storage";
Zero actual matches.
```

### Search: buildRequestContextPrompt consumers

```
Found 51 matches in 19 files:
- src/llm/gateway.ts:42 (import), line ~440 (call in injectContextIntoRequest)
- electron-ui/ipc/workspace-handlers.cjs:63 (import + call)
- tests/sprint29-smoke.test.js (test)
- tests/sprint30-smoke.test.js (test)
- tests/memory/request-context-coverage.test.ts (test)
- tests/llm/gateway-*.test.ts (multiple test files, mocked)
- output/audit-*/function_catalog.csv (audit artifacts)
- strategic-learning-unified-theatre-ai-snapshot-sprint29-t1 (documentation)
- strategic-learning-unified-theatre-ai-snapshot-sprint30-t1 (documentation)
```

## Code Evidence

### 1. Gateway Imports — `src/llm/gateway.ts:1-43`

```typescript
// src/llm/gateway.ts
import {
  ProviderAdapter,
  ProviderName,
  ProviderRequest,
  ProviderResponse,
  TokenChunk,
} from "../shared/contracts/provider";
import {
  providerRequestSchema,
  providerResponseSchema,
  tokenChunkSchema,
} from "../shared/schemas/provider.schema";
import {
  DomainError,
  RoutingNoProviderError,
  ValidationFailedError,
} from "../shared/errors";
import { logger } from "../shared/logging/logger";
import {
  GeminiProviderAdapter,
  GroqProviderAdapter,
  LocalProviderAdapter,
  OpenAIProviderAdapter,
  PerplexityProviderAdapter,
} from "./providers";
import {
  getProviderHealthSnapshot,
  isProviderAvailable,
  markProviderFromError,
} from "./provider-health";
import { recordProviderFailure, recordProviderSuccess } from "./provider-usage";
import {
  evaluateWorkspaceQuotaStatus,
  recordWorkspaceQuotaUsage,
} from "../governance/workspace-quotas.js";
import { explainRoutingSelection } from "./routing-explainer";
import { recordRoutingDecision } from "./routing-history";
import {
  applyPolicyToCandidatesWithReason,
  getState,
} from "../policies/provider-policy";
import { buildRequestContextPrompt } from "../memory/request-context";
import { truncateToTokens } from "./agent-loop-guard.js";
```

**Only one context-building import**: `buildRequestContextPrompt` from `../memory/request-context`. No imports for RAG, mistake tracker, experience DB, knowledge graph, PMBOK/TMF docs, or prompt history.

### 2. Context Injection — `src/llm/gateway.ts:436-456`

```typescript
// src/llm/gateway.ts
private async injectContextIntoRequest(
  requestData: ProviderRequest,
): Promise<ProviderRequest> {
  if (!requestData.workspaceId) {
    return requestData;
  }

  try {
    const contextPrompt = buildRequestContextPrompt(requestData.workspaceId);
    if (contextPrompt) {
      // Preserve userPrompt if provided (for explicit boundary in budget enforcement)
      const userPrompt = requestData.userPrompt || requestData.prompt;
      return {
        ...requestData,
        prompt: `${contextPrompt}\n\nUser request: ${requestData.prompt}`,
        userPrompt, // Preserve explicit boundary
      };
    }
  } catch (error) {
    logNonFatalError(error, "context-injection");
  }

  return requestData;
}
```

**Single input source**: `buildRequestContextPrompt(workspaceId)` — prepends workspace context to the prompt.

### 3. Request Context Builder — `src/memory/request-context.ts:83-93`

```typescript
// src/memory/request-context.ts
export function buildRequestContextPrompt(
  workspaceId?: string | null,
): string | null {
  const context = getWorkspaceContext(workspaceId);
  if (!context?.summary?.trim()) return null;
  const lines = ["Workspace context:", context.summary.trim()];
  if (context.tags.length) lines.push(`Tags: ${context.tags.join(", ")}`);
  if (context.lastIntent) lines.push(`Last intent: ${context.lastIntent}`);
  return lines.join("\n");
}
```

**Data source**: `workspace-context.json` (stored via `saveWorkspaceContext()`). Contains: `summary` (max 500 chars), `tags` (string array), `lastIntent` (optional string).

### 4. Workspace Context Record — `src/memory/request-context.ts:6-12`

```typescript
// src/memory/request-context.ts
export interface WorkspaceContextRecord {
  workspaceId: string;
  summary: string;
  tags: string[];
  lastIntent?: string;
  updatedAt: number;
}
```

### 5. Budget Enforcement (trim logic) — `src/llm/gateway.ts:246-318`

```typescript
// src/llm/gateway.ts
export function enforcePromptBudget(
  prompt: string,
  constraints?: { maxTokens?: number },
  workspaceContext?: string,
  userPrompt?: string,
): { trimmedPrompt: string; originalLength: number; trimmedLength: number } {
  const DEFAULT_BUDGET_CHARS = 6000;
  const budgetChars =
    constraints?.maxTokens && constraints.maxTokens > 0
      ? constraints.maxTokens * 4
      : DEFAULT_BUDGET_CHARS;

  // Trim order: (a) drop workspace context, (b) truncate TOOL RESULT,
  // (c) preserve userPrompt boundary, (d) marker-based fallback
  // ...
}
```

**Pure trim/budget logic** — no context assembly, only reactive trimming of oversized prompts.

### 6. Context Sources NOT Present in Gateway

The following were explicitly searched for and **not found** in `src/llm/gateway.ts` or `src/memory/request-context.ts`:

| Expected Source                       | Present? | Evidence                                                        |
| ------------------------------------- | -------- | --------------------------------------------------------------- |
| RAG / vector search results           | ❌ No    | Zero matches for "rag", "vector", "embed", "retrieve"           |
| Book content / reference docs         | ❌ No    | Zero matches for "book", "reference", "doc"                     |
| PMBOK / TMF docs                      | ❌ No    | Zero matches for "pmbok", "tmf"                                 |
| Prior mistakes (MistakeTracker)       | ❌ No    | No import of `mistake-tracker.js` in gateway or request-context |
| Prompt history / conversation history | ❌ No    | Zero matches for "prompt.*history", "conversation.*history"     |
| Experience DB                         | ❌ No    | No import of experience-db in gateway or request-context        |
| Knowledge graph                       | ❌ No    | No import of knowledge-graph in gateway or request-context      |

**Note**: `MistakeTracker` exists in the repo (`src/llm/mistake-tracker.js`) and is imported by `vscode-extension/collector.js` (for recurring diagnostics), but is NOT imported by `gateway.ts` or `request-context.ts`.

## Verdict

**Partial/integration unclear**

## Notes

The gateway assembles exactly **one** context input source: the workspace context summary (500-char cap, from `workspace-context.json`). The context builder (`buildRequestContextPrompt`) injects summary + tags + last intent. RAG/book content, PMBOK/TMF docs, prior mistakes, prompt history, experience DB, and knowledge graph are **not pulled into the gateway**. The gateway contains substantial trim/budget logic (`enforcePromptBudget` with 4 trim steps), but the context assembly itself is minimal — a single workspace summary string.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Partial/integration unclear.**

`src/llm/gateway.ts` is dominated by trim/budget logic (`enforcePromptBudget`) plus workspace context via `buildRequestContextPrompt`. Zero matches in gateway for RAG/vector, PMBOK/TMF, MistakeTracker, prompt history, experience-db, knowledge-graph. Completeness gap is real: assembly is minimal; budget logic is substantial. No material corrections.
