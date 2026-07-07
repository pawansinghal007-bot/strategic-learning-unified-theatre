// src/shared/contracts/provider.ts
export type ProviderName =
  | "openai"
  | "anthropic"
  | "gemini"
  | "groq"
  | "perplexity"
  | "local"
  | "custom";

export type ProviderCapability =
  | "chat"
  | "streaming"
  | "tool_use"
  | "web_research"
  | "reasoning"
  | "summarization"
  | "code_generation"
  | "embeddings"
  | "vision"
  | "offline"
  | "private_mode";

export type WorkspaceIntent =
  | "coding"
  | "architecture"
  | "research"
  | "summarization"
  | "planning"
  | "debugging"
  | "tool_use"
  | "analysis"
  | "general";

export type PrivacyMode = "cloud" | "hybrid" | "local-only";

export interface ProviderRequestConstraints {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  budgetTier?: "low" | "balanced" | "premium";
  privacyMode?: PrivacyMode;
  requiresWeb?: boolean;
  requiresTools?: boolean;
  preferredProvider?: ProviderName;
  excludedProviders?: ProviderName[];
}

export interface ProviderRequest {
  requestId: string;
  workspaceId?: string;
  prompt: string;
  systemPrompt?: string;
  intent?: WorkspaceIntent;
  context?: string[];
  metadata?: Record<string, unknown>;
  constraints?: ProviderRequestConstraints;
  stream?: boolean;
  /**
   * Raw user prompt text (without workspace context or system prompt).
   * When provided, enforcePromptBudget() will use this as the explicit
   * boundary to protect user content from truncation.
   *
   * Rationale: Blind end-truncation without a known user-prompt boundary
   * is rejected as unsafe because it may silently cut into the user's own
   * prompt text, losing critical instructions or context. By requiring
   * callers to pass the raw user prompt explicitly, we ensure the budget
   * guard can always identify and preserve the user's input regardless of
   * whether workspace context injection was enabled.
   */
  userPrompt?: string;
}

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
}

export interface RoutingReason {
  code:
    | "preferred_provider"
    | "capability_match"
    | "health_preference"
    | "quota_fallback"
    | "latency_preference"
    | "privacy_constraint"
    | "manual_override"
    | "default_selection"
    | "policy_source";
  message: string;
}

export interface ProviderResponse {
  requestId: string;
  provider: ProviderName;
  model: string;
  outputText: string;
  finishReason?: "stop" | "length" | "tool_call" | "error" | "unknown";
  usage?: ProviderUsage;
  routingReasons?: RoutingReason[];
  raw?: unknown;
}

export interface TokenChunk {
  requestId: string;
  provider: ProviderName;
  delta: string;
  done?: boolean;
}

export interface ProviderHealth {
  provider: ProviderName;
  available: boolean;
  status:
    | "healthy"
    | "degraded"
    | "rate_limited"
    | "auth_error"
    | "offline"
    | "unknown";
  latencyMs?: number;
  lastCheckedAt?: string;
  message?: string;
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  ask(req: ProviderRequest): Promise<ProviderResponse>;
  stream?(req: ProviderRequest): AsyncIterable<TokenChunk>;
  health?(): Promise<ProviderHealth>;
  capabilities(): ProviderCapability[];
}
