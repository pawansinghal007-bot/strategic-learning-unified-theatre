# V7 — Provider Routing Targets (Engine 5: AI Router)

## Commands Run

```bash
# Read the three core routing modules
cat src/policies/provider-policy.ts
cat src/llm/routing-explainer.ts
cat src/llm/routing-history.ts

# Read the ProviderName type definition and policy presets
cat src/shared/contracts/provider.ts
cat src/policies/policy-presets.ts

# Search for "kiro", "codex", "copilot" across the entire repo
grep -rni "kiro\|codex\|copilot" --include="*.ts" --include="*.js" --include="*.json" --include="*.md"
```

## Terminal Output

### Search: "kiro" | "codex" | "copilot"

```
Found 242 matches in 58 files for "kiro|codex|copilot"

Relevant source code matches (non-doc, non-test):
- src/accounts/schema.js:10: export const AgentTypeSchema = z.enum(["vscode", "github", "codex", "trae", "other"]);
- src/accounts/health.js:122: if (!["codex", "vscode", "github"].includes(account.agentType))
- src/cli.js:553: if (account.agentType === "codex")
- src/internal/paths.js:55: if (agentType === "codex") return homedirPath(".codex", "auth.json");
- renderer/screens/BrowserAutomation.jsx:5: { value: "codex", label: "Codex" }
- renderer/screens/Accounts.jsx:6: github: "https://github.com/features/copilot"
- electron-ui/ipc/handlers.cjs:55: github: "https://github.com/features/copilot"
- schema.json:21: "enum": ["vscode", "codex", "trae", "other"]

CRITICAL FINDING: None of these 242 matches appear in the provider routing modules
(src/policies/provider-policy.ts, src/llm/routing-explainer.ts, src/llm/routing-history.ts,
src/shared/contracts/provider.ts, src/policies/policy-presets.ts).

"codex" appears as an AgentType (agent identity / auth target), NOT as a ProviderName (LLM routing target).
"kiro" appears only in documentation files (sprint notes, MCP client verification docs).
"copilot" appears as a URL reference (github.com/features/copilot) and in documentation.
```

## Code Evidence

### 1. ProviderName Type Definition — `src/shared/contracts/provider.ts:2-8`

```typescript
// src/shared/contracts/provider.ts
export type ProviderName =
  | "openai"
  | "anthropic"
  | "gemini"
  | "groq"
  | "perplexity"
  | "local"
  | "custom";
```

**7 distinct provider/target strings defined.**

### 2. Policy Presets — `src/policies/policy-presets.ts:3-12`

```typescript
// src/policies/policy-presets.ts
const CLOUD_PROVIDERS: ProviderName[] = [
  "groq",
  "gemini",
  "openai",
  "perplexity",
];
const ALL_PROVIDERS: ProviderName[] = [
  "groq",
  "gemini",
  "openai",
  "perplexity",
  "local",
];
```

**Note**: `ALL_PROVIDERS` (used by `getAllProviders()`) contains only 5 of the 7 `ProviderName` values. `"anthropic"` and `"custom"` are defined in the type but NOT included in `ALL_PROVIDERS`. They will be filtered out by `normalizeProviders()` in `provider-policy.ts` (line 42: `filter((v) => ALL_PROVIDERS.includes(v))`).

### 3. Default Policy — `src/policies/provider-policy.ts:33-40`

```typescript
// src/policies/provider-policy.ts
const DEFAULT_POLICY: PolicyState = {
  routingMode: "cloud",
  allowedProviders: ["groq", "gemini", "openai", "perplexity", "local"],
  blockedProviders: [],
  manualProvider: null,
  activePreset: "default",
  updatedAt: Date.now(),
};
```

### 4. Policy Presets — `src/policies/policy-presets.ts:14-82`

Five presets, each defining allowed/blocked providers:

```typescript
// src/policies/policy-presets.ts
export const POLICY_PRESETS = {
  default: {
    // allowedProviders: ["groq", "gemini", "openai", "perplexity"]
    // blockedProviders: []
  },
  coding: {
    // allowedProviders: ["groq", "openai", "gemini", "local"]
    // blockedProviders: ["perplexity"], manualProvider: "groq"
  },
  research: {
    // allowedProviders: ["perplexity", "gemini", "openai"]
    // blockedProviders: ["groq", "local"], manualProvider: "perplexity"
  },
  private: {
    // allowedProviders: ["local"]
    // blockedProviders: [], manualProvider: "local"
  },
  enterprise: {
    // allowedProviders: ["openai", "gemini", "local"]
    // blockedProviders: ["groq", "perplexity"]
  },
};
```

### 5. Intent-Based Routing — `src/llm/routing-explainer.ts:139-153`

```typescript
// src/llm/routing-explainer.ts
function getIntentBasedExplanation(
  request: { intent?: string },
  provider: string,
): string | undefined {
  if (request.intent === "research" && provider === "perplexity") {
    return "Selected Perplexity because the request intent is research-oriented.";
  }
  if (request.intent === "summarization" && provider === "gemini") {
    return "Selected Gemini because it is prioritized for fast summarization.";
  }
  if (request.intent === "coding" && provider === "groq") {
    return "Selected Groq because it is prioritized for fast coding assistance.";
  }
  if (request.intent === "architecture" && provider === "openai") {
    return "Selected OpenAI because the request appears architecture-oriented.";
  }
  return undefined;
}
```

**Intent-to-provider mapping**: research→perplexity, summarization→gemini, coding→groq, architecture→openai.

### 6. Routing History — `src/llm/routing-history.ts:14-28`

```typescript
// src/llm/routing-history.ts
type RoutingDecisionInput = {
  request: {
    requestId: string;
    workspaceId?: string;
    intent?: string;
  };
  provider: string;
  model: string;
  success: boolean;
  reason: string;
  fallbackFrom?: string;
  latencyMs?: number;
  errorMessage?: string;
};
```

**No hardcoded provider list** — uses generic `string` for provider field. Records are stored in `routing-history.json` with a max of 200 entries.

### 7. "kiro", "codex", "copilot" — NOT Provider Routing Targets

These strings appear in the codebase but in a **different context** (AgentType, not ProviderName):

```javascript
// src/accounts/schema.js:10 — AgentType (identity/auth), NOT a provider
export const AgentTypeSchema = z.enum(["vscode", "github", "codex", "trae", "other"]);

// src/internal/paths.js:55 — Auth file path resolution for agent types
if (agentType === "codex") return homedirPath(".codex", "auth.json");

// renderer/screens/BrowserAutomation.jsx:5 — Browser automation target selector
{ value: "codex", label: "Codex" }
```

**"kiro"** appears only in documentation files (`.claude/sprints/`, `docs/mcp-client-verification-sprint107.md`, `master_timeline_sprints_101_plus.md`) — never in source code.

**"copilot"** appears as a URL (`github.com/features/copilot`) in `renderer/screens/Accounts.jsx` and `electron-ui/ipc/handlers.cjs` — never as a provider name.

## Verdict

**Confirmed built**

## Notes

The provider routing system is built and functional with 7 `ProviderName` values defined (`openai`, `anthropic`, `gemini`, `groq`, `perplexity`, `local`, `custom`), though only 5 are routable at runtime (`anthropic` and `custom` are excluded from `ALL_PROVIDERS`). Policy presets, intent-based routing, sensitive-task detection, and routing history are all wired. "kiro", "codex", and "copilot" are NOT provider routing targets — they appear as agent types (identity/auth targets) or in documentation only.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Confirmed built.**

`ProviderName` in `src/shared/contracts/provider.ts` is: `openai | anthropic | gemini | groq | perplexity | local | custom`. Routing explainer hard-codes intent targets (perplexity/gemini/groq/openai/local). Searches for kiro/codex/copilot correctly show they are **not** provider-routing targets (codex/copilot appear as account `agentType` / login URLs only). Note: this item was in the “partial” bucket of the prompt script, but the file’s Confirmed-built verdict is correct for “what targets exist.” No material corrections.
