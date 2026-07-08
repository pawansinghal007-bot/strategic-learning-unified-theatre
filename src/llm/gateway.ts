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
import { estimateTokens, truncateToTokens } from "./agent-loop-guard.js";

/**
 * Non-fatal error handler for gateway operations.
 * Catches and logs errors that should not halt the request flow.
 */
function logNonFatalError(error: unknown, context: string): void {
  logger.warn("gateway.non-fatal-error", {
    context,
    error: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Budget guard: trim oversized prompts before provider dispatch.
 * Trim order: (a) drop workspace context first, (b) truncate TOOL RESULT from end,
 * (c) never truncate userPrompt itself.
 *
 * Exported for testing. Internal callers should continue to use it directly.
 *
 * @param prompt - The full composite prompt (workspace context + user request)
 * @param constraints - Optional budget constraints (maxTokens)
 * @param workspaceContext - The workspace context prefix if injected
 * @param userPrompt - **EXPLICIT user prompt boundary** (preferred approach).
 *   When provided, this is used as the definitive boundary to protect user content.
 *   This is safer than inferring the boundary from string markers because:
 *   - If includeWorkspaceContext was false (the default since Sprint 109),
 *     the "User request:" marker never appears, so blind end-truncation
 *     could silently cut into the user's own prompt text.
 *   - By requiring callers to pass the raw user prompt explicitly, we ensure
 *     the budget guard can always identify and preserve the user's input.
 *   - Blind end-truncation without a known boundary was rejected as unsafe
 *     because it may lose critical user instructions or context.
 */
export function enforcePromptBudget(
  prompt: string,
  constraints?: { maxTokens?: number },
  workspaceContext?: string,
  userPrompt?: string,
): { trimmedPrompt: string; originalLength: number; trimmedLength: number } {
  const DEFAULT_BUDGET_CHARS = 6000;
  const budgetChars =
    constraints?.maxTokens && constraints.maxTokens > 0
      ? constraints.maxTokens * 4 // Convert tokens to chars (4 chars/token)
      : DEFAULT_BUDGET_CHARS;

  const originalLength = prompt.length;

  // If within budget, return as-is
  if (originalLength <= budgetChars) {
    return {
      trimmedPrompt: prompt,
      originalLength,
      trimmedLength: originalLength,
    };
  }

  // Step (a): Try dropping workspace context first if present
  if (workspaceContext && prompt.startsWith(workspaceContext)) {
    const remainingPrompt = prompt.slice(workspaceContext.length).trimStart();
    // Check if remaining is within budget (accounting for the "User request:" prefix)
    const userRequestPrefix = "User request: ";
    if (remainingPrompt.startsWith(userRequestPrefix)) {
      const userPromptFromMarker = remainingPrompt.slice(
        userRequestPrefix.length,
      );
      // If user prompt alone is within budget, return just it
      if (userPromptFromMarker.length <= budgetChars) {
        logger.warn("gateway.prompt.trimmed", {
          reason: "workspace_context_dropped",
          originalLength,
          trimmedLength: userPromptFromMarker.length,
          workspaceContextLength: workspaceContext.length,
        });
        return {
          trimmedPrompt: userPromptFromMarker,
          originalLength,
          trimmedLength: userPromptFromMarker.length,
        };
      }
    }
  }

  // Step (b): Truncate TOOL RESULT content from the end, keeping most recent portion
  // Look for patterns like "TOOL RESULT:" or "Tool output:" at the end
  const toolResultPatterns = [
    /(\n\n)?TOOL RESULT:[\s\S]*$/i,
    /(\n\n)?Tool output:[\s\S]*$/i,
    /(\n\n)?TOOL OUTPUT:[\s\S]*$/i,
  ];

  let trimmedPrompt = prompt;
  for (const pattern of toolResultPatterns) {
    const match = prompt.match(pattern);
    if (match) {
      const toolResultStart = match.index ?? 0;
      const nonToolPart = prompt.slice(0, toolResultStart);
      const toolResultPart = prompt.slice(toolResultStart);

      // Keep non-tool part entirely, truncate tool result
      if (nonToolPart.length <= budgetChars) {
        const availableSpace = budgetChars - nonToolPart.length;
        const truncatedToolResult = truncateToTokens(
          toolResultPart,
          Math.max(availableSpace / 4, 100), // min 100 chars worth of tokens
          { fromEnd: true }, // Keep most recent (tail) portion
        );
        trimmedPrompt = nonToolPart + truncatedToolResult;
        break;
      }
    }
  }

  // Step (c): If still over budget, use explicit userPrompt boundary if provided
  // This is the PREFERRED approach - explicit boundary via userPrompt parameter
  if (trimmedPrompt.length > budgetChars && userPrompt) {
    // Find the userPrompt in the trimmedPrompt to establish the boundary
    const userPromptIndex = trimmedPrompt.indexOf(userPrompt);
    if (userPromptIndex >= 0) {
      const contextPart = trimmedPrompt.slice(0, userPromptIndex);
      const userPromptText = trimmedPrompt.slice(userPromptIndex);

      // Keep at least some context, but ensure userPrompt is intact
      const minContextChars = 500; // minimum context to keep
      if (userPromptText.length <= budgetChars - minContextChars) {
        const availableSpace = budgetChars - userPromptText.length;
        trimmedPrompt =
          contextPart.slice(0, availableSpace).trimEnd() +
          "\n\n" +
          userPromptText;
      }
      // If userPrompt alone exceeds budget, leave it untrimmed with warning below
    }
  }

  // Fallback: If still over budget and no explicit boundary, try marker-based approach
  if (trimmedPrompt.length > budgetChars) {
    // Try to find userPrompt marker
    const userRequestMatch = trimmedPrompt.match(/User request:[\s\S]*$/);
    if (userRequestMatch) {
      const userRequestStart = userRequestMatch.index ?? 0;
      const contextPart = trimmedPrompt.slice(0, userRequestStart);
      const userPromptFromMarker = trimmedPrompt.slice(userRequestStart);

      // Keep at least some context, but ensure userPrompt is intact
      const minContextChars = 500; // minimum context to keep
      if (userPromptFromMarker.length <= budgetChars - minContextChars) {
        const availableSpace = budgetChars - userPromptFromMarker.length;
        trimmedPrompt =
          contextPart.slice(0, availableSpace).trimEnd() +
          "\n\n" +
          userPromptFromMarker;
      }
    } else {
      // No clear marker and no explicit userPrompt boundary
      // CRITICAL: Do NOT silently truncate - log warning and return untrimmed
      // Blind end-truncation without a known boundary was rejected as unsafe
      // because it may silently cut into the user's own prompt text, losing
      // critical instructions or context. The caller must ensure userPrompt
      // is provided or accept that oversized prompts will pass through.
      logger.warn("gateway.prompt.cannot-truncate-no-boundary", {
        reason: "budget_exceeded_but_no_user_prompt_boundary",
        originalLength,
        budgetChars,
        note: "Prompt exceeds budget but cannot be safely trimmed without explicit userPrompt boundary. Passing through untrimmed to avoid losing user content.",
      });
      return {
        trimmedPrompt: prompt,
        originalLength,
        trimmedLength: originalLength,
      };
    }
  }

  const trimmedLength = trimmedPrompt.length;
  if (trimmedLength < originalLength) {
    logger.warn("gateway.prompt.truncated", {
      reason: "budget_exceeded",
      originalLength,
      trimmedLength,
      budgetChars,
    });
  }

  return { trimmedPrompt, originalLength, trimmedLength };
}

export interface GatewayOptions {
  providers?: Partial<Record<ProviderName, ProviderAdapter>>;
  defaultOrder?: ProviderName[];
}

export interface GatewayQuotaDecision {
  allowed: boolean;
  blocked: boolean;
  shouldFallback: boolean;
  shouldAlert: boolean;
  thresholdReached: boolean;
  provider: string | null;
  quota: ReturnType<typeof evaluateWorkspaceQuotaStatus>;
}

export class Gateway {
  private readonly providers: Partial<Record<ProviderName, ProviderAdapter>>;
  private readonly defaultOrder: ProviderName[];

  constructor(options: GatewayOptions = {}) {
    this.providers = {
      local: new LocalProviderAdapter(),
      openai: new OpenAIProviderAdapter(),
      gemini: new GeminiProviderAdapter(),
      groq: new GroqProviderAdapter(),
      perplexity: new PerplexityProviderAdapter(),
      ...options.providers,
    };
    this.defaultOrder = options.defaultOrder ?? [
      "groq",
      "gemini",
      "openai",
      "perplexity",
      "local",
    ];
  }

  // Helper function to handle quota decision logic
  private handleQuotaDecision(
    providerName: ProviderName,
    workspaceId: string,
    startedAt: number,
    fallbackFrom: ProviderName | undefined,
  ): {
    selectedProviderName: ProviderName;
    selectedProvider: ProviderAdapter | undefined;
    shouldContinue: boolean;
  } {
    const quotaDecision = applyWorkspaceQuotaEnforcement({
      workspaceId,
      provider: providerName,
      now: startedAt,
    });

    if (quotaDecision.blocked) {
      logger.warn("gateway.provider.blocked_by_workspace_quota", {
        workspaceId,
        provider: providerName,
      });
      throw Object.assign(new Error("Workspace quota exceeded"), {
        code: "WORKSPACE_QUOTA_EXCEEDED",
        workspaceId,
        quota: quotaDecision.quota,
      });
    }

    let selectedProviderName: ProviderName = providerName;
    let selectedProvider: ProviderAdapter | undefined =
      this.providers[providerName];

    if (
      quotaDecision.shouldFallback &&
      quotaDecision.provider &&
      quotaDecision.provider !== providerName &&
      this.providers[quotaDecision.provider as ProviderName]
    ) {
      selectedProviderName = quotaDecision.provider as ProviderName;
      selectedProvider = this.providers[selectedProviderName];
    }

    if (quotaDecision.shouldAlert || quotaDecision.thresholdReached) {
      logger.warn("gateway.workspace_quota.alert", {
        workspaceId,
        provider: providerName,
        fallbackProvider: quotaDecision.provider,
        thresholdReached: quotaDecision.thresholdReached,
        shouldAlert: quotaDecision.shouldAlert,
      });
    }

    return { selectedProviderName, selectedProvider, shouldContinue: true };
  }

  private validateProviderAvailable(
    providerName: ProviderName,
    unavailableProviders: ProviderName[],
  ): { valid: boolean; provider?: ProviderAdapter; error?: string } {
    const provider = this.providers[providerName];
    if (!provider) {
      logger.warn("gateway.provider.missing", { provider: providerName });
      return { valid: false, error: "Provider not found" };
    }

    if (!isProviderAvailable(providerName)) {
      unavailableProviders.push(providerName);
      logger.info("gateway.provider.skipped_unhealthy", {
        provider: providerName,
      });
      return { valid: false, error: "Provider unavailable" };
    }

    return { valid: true, provider };
  }

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

  /**
   * Extract workspace context from the full prompt.
   * The workspace context is everything before "User request:".
   */
  private extractWorkspaceContext(
    fullPrompt: string,
    userPrompt: string,
  ): string {
    const userRequestPrefix = "User request: ";
    const userRequestIndex = fullPrompt.indexOf(userRequestPrefix + userPrompt);

    if (userRequestIndex > 0) {
      return fullPrompt.slice(0, userRequestIndex);
    }

    // Fallback: try to find just "User request:" marker
    const simpleIndex = fullPrompt.indexOf(userRequestPrefix);
    if (simpleIndex > 0) {
      return fullPrompt.slice(0, simpleIndex);
    }

    return "";
  }

  private recordSuccessResponse(
    selectedProviderName: ProviderName,
    parsedResponse: any,
    parsedRequest: any,
    fallbackFrom: ProviderName | undefined,
    unavailableProviders: ProviderName[],
    policyReason: string,
    startedAt: number,
  ): void {
    recordProviderSuccess(selectedProviderName, parsedResponse.data);

    const reason = explainRoutingSelection(
      parsedRequest.data,
      selectedProviderName,
      {
        fallbackFrom,
        unavailableProviders,
        policyApplied: true,
        policyReason,
      },
    );

    recordRoutingDecision({
      request: parsedRequest.data,
      provider: selectedProviderName,
      model: parsedResponse.data.model,
      success: true,
      reason,
      fallbackFrom,
      latencyMs: Date.now() - startedAt,
    });

    logger.info("gateway.ask.success", {
      requestId: parsedRequest.data.requestId,
      provider: selectedProviderName,
      model: parsedResponse.data.model,
      reason,
    });
  }

  private recordFailureResponse(
    selectedProviderName: ProviderName,
    providerName: ProviderName,
    error: unknown,
    parsedRequest: any,
    fallbackFrom: ProviderName | undefined,
    startedAt: number,
  ): void {
    const message = error instanceof Error ? error.message : String(error);

    try {
      recordProviderFailure(selectedProviderName);
    } catch (error) {
      logNonFatalError(error, "record-provider-failure");
    }

    if (error instanceof DomainError) {
      try {
        markProviderFromError(selectedProviderName, error);
      } catch (error) {
        logNonFatalError(error, "mark-provider-from-error");
      }
    }

    const reason = `Provider ${selectedProviderName} failed and the gateway moved to fallback.`;

    recordRoutingDecision({
      request: parsedRequest.data,
      provider: selectedProviderName,
      model: "unknown-model",
      success: false,
      reason,
      fallbackFrom,
      latencyMs: Date.now() - startedAt,
      errorMessage: message,
    });

    logger.warn("gateway.provider.failed", {
      requestId: parsedRequest.data.requestId,
      provider: selectedProviderName,
      error: message,
    });
  }

  // Helper function to handle provider request processing
  private async processProviderRequest(
    providerName: ProviderName,
    parsedRequest: {
      success: boolean;
      data: ProviderRequest;
      error: any;
    },
    fallbackFrom: ProviderName | undefined,
    unavailableProviders: ProviderName[],
    policyReason: string,
  ): Promise<{
    response?: ProviderResponse;
    error?: { provider: string; message: string };
    newFallbackFrom?: ProviderName;
  }> {
    const validation = this.validateProviderAvailable(
      providerName,
      unavailableProviders,
    );
    if (!validation.valid) {
      return {
        error: { provider: providerName, message: validation.error! },
      };
    }

    const startedAt = Date.now();
    let selectedProviderName: ProviderName = providerName;
    let selectedProvider: ProviderAdapter | undefined = validation.provider;

    if (parsedRequest.data.workspaceId) {
      const { selectedProviderName: qName, selectedProvider: qProvider } =
        this.handleQuotaDecision(
          providerName,
          parsedRequest.data.workspaceId,
          startedAt,
          fallbackFrom,
        );
      selectedProviderName = qName;
      selectedProvider = qProvider;
    }

    try {
      logger.info("gateway.provider.try", {
        requestId: parsedRequest.data.requestId,
        provider: selectedProviderName,
      });

      let requestData = await this.injectContextIntoRequest(parsedRequest.data);

      // Enforce prompt budget before dispatching to provider
      // Extract workspace context for budget enforcement
      const workspaceContext = this.extractWorkspaceContext(
        requestData.prompt,
        requestData.userPrompt || requestData.prompt,
      );
      const budgetResult = enforcePromptBudget(
        requestData.prompt,
        requestData.constraints,
        workspaceContext,
        requestData.userPrompt, // Pass explicit userPrompt boundary
      );

      if (budgetResult.trimmedLength < budgetResult.originalLength) {
        logger.warn("gateway.prompt.budget_enforced", {
          requestId: requestData.requestId,
          originalLength: budgetResult.originalLength,
          trimmedLength: budgetResult.trimmedLength,
          reason: "budget_exceeded",
        });
      }

      const rawResponse = await selectedProvider!.ask({
        ...requestData,
        prompt: budgetResult.trimmedPrompt,
      });
      const normalizedResponse = this.normalizeResponse(
        rawResponse,
        selectedProviderName,
        parsedRequest.data.requestId,
      );

      const parsedResponse =
        providerResponseSchema.safeParse(normalizedResponse);
      if (!parsedResponse.success) {
        throw new ValidationFailedError("Invalid provider response", {
          provider: selectedProviderName,
          issues: parsedResponse.error.flatten,
        });
      }

      this.recordSuccessResponse(
        selectedProviderName,
        parsedResponse,
        parsedRequest,
        fallbackFrom,
        unavailableProviders,
        policyReason,
        startedAt,
      );

      return {
        response: {
          ...parsedResponse.data,
          routingReasons: [
            ...(parsedResponse.data.routingReasons ?? []),
            {
              code: "default_selection",
              message: explainRoutingSelection(
                parsedRequest.data,
                selectedProviderName,
                {
                  fallbackFrom,
                  unavailableProviders,
                  policyApplied: true,
                  policyReason,
                },
              ),
            },
          ],
        },
      };
    } catch (error) {
      this.recordFailureResponse(
        selectedProviderName,
        providerName,
        error,
        parsedRequest,
        fallbackFrom,
        startedAt,
      );

      return {
        error: {
          provider: selectedProviderName,
          message: error instanceof Error ? error.message : String(error),
        },
        newFallbackFrom: providerName,
      };
    }
  }

  async ask(request: ProviderRequest): Promise<ProviderResponse> {
    const parsedRequest = providerRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      throw new ValidationFailedError("Invalid provider request", {
        issues: parsedRequest.error.flatten,
      });
    }

    const baseCandidates = this.resolveCandidates(parsedRequest.data);
    let { candidates, policyReason } = applyPolicyToCandidatesWithReason(
      baseCandidates,
      parsedRequest.data,
    );

    // If policy (e.g. cloud mode) stripped local but every cloud provider
    // subsequently fails, we still need a last-resort escape hatch.
    // Only append local when: not already in list, not request-excluded,
    // and not explicitly blocked by the active policy.
    const requestExcluded =
      parsedRequest.data.constraints?.excludedProviders ?? [];
    this.appendLocalIfAvailable(candidates, requestExcluded);

    if (!candidates.length) {
      throw new RoutingNoProviderError(
        "No provider candidates available after policy filtering",
      );
    }

    logger.info("gateway.ask.start", {
      requestId: parsedRequest.data.requestId,
      workspaceId: parsedRequest.data.workspaceId,
      intent: parsedRequest.data.intent,
      candidates,
      policyReason,
      health: getProviderHealthSnapshot(),
    });

    const errors: Array<{ provider: string; message: string }> = [];
    const unavailableProviders: ProviderName[] = [];
    let fallbackFrom: ProviderName | undefined;

    for (const providerName of candidates) {
      const result = await this.processProviderRequest(
        providerName,
        parsedRequest,
        fallbackFrom,
        unavailableProviders,
        policyReason,
      );

      if (result.response) {
        return result.response;
      }

      if (result.error) {
        errors.push(result.error);
        if (result.newFallbackFrom) {
          fallbackFrom = result.newFallbackFrom;
        }
      }
    }

    logger.error("gateway.ask.failed", {
      requestId: parsedRequest.data.requestId,
      errors,
      health: getProviderHealthSnapshot(),
    });

    throw new RoutingNoProviderError("All providers failed for the request", {
      errors,
    });
  }

  async *stream(request: ProviderRequest): AsyncIterable<TokenChunk> {
    const parsedRequest = providerRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      throw new ValidationFailedError("Invalid provider request for stream", {
        issues: parsedRequest.error.flatten,
      });
    }

    const baseCandidates = this.resolveCandidates(parsedRequest.data);
    let { candidates, policyReason } = applyPolicyToCandidatesWithReason(
      baseCandidates,
      parsedRequest.data,
    );

    // Same local fallback logic as ask() — policy may have stripped local
    // in cloud mode, but stream() should still reach it if preferred or needed.
    // Honour preferredProvider: if local was explicitly preferred, put it first.
    const streamRequestExcluded =
      parsedRequest.data.constraints?.excludedProviders ?? [];
    this.appendLocalIfAvailableForStream(
      candidates,
      streamRequestExcluded,
      parsedRequest.data.constraints?.preferredProvider,
    );

    if (!candidates.length) {
      throw new RoutingNoProviderError(
        "No provider candidates available for stream",
      );
    }

    const providerName = candidates.find((name) => {
      const provider = this.providers[name];
      return provider?.stream && isProviderAvailable(name);
    });

    if (!providerName) {
      throw new RoutingNoProviderError(
        "No streaming-capable healthy provider available",
      );
    }

    const provider = this.providers[providerName]!;
    const startedAt = Date.now();

    logger.info("gateway.stream.start", {
      requestId: parsedRequest.data.requestId,
      provider: providerName,
      policyReason,
    });

    try {
      for await (const chunk of provider.stream!(parsedRequest.data)) {
        const parsedChunk = tokenChunkSchema.safeParse(chunk);
        if (!parsedChunk.success) {
          throw new ValidationFailedError(
            "Invalid token chunk from provider stream",
            {
              provider: providerName,
              issues: parsedChunk.error.flatten,
            },
          );
        }
        yield parsedChunk.data;
      }

      const reason = explainRoutingSelection(parsedRequest.data, providerName, {
        policyApplied: true,
        policyReason,
      });

      recordRoutingDecision({
        request: parsedRequest.data,
        provider: providerName,
        model: "streaming-model",
        success: true,
        reason,
        latencyMs: Date.now() - startedAt,
      });

      logger.info("gateway.stream.success", {
        requestId: parsedRequest.data.requestId,
        provider: providerName,
        reason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      recordProviderFailure(providerName);

      if (error instanceof DomainError) {
        markProviderFromError(providerName, error);
      }

      recordRoutingDecision({
        request: parsedRequest.data,
        provider: providerName,
        model: "streaming-model",
        success: false,
        reason: `Streaming failed on ${providerName}.`,
        latencyMs: Date.now() - startedAt,
        errorMessage: message,
      });

      logger.warn("gateway.stream.failed", {
        requestId: parsedRequest.data.requestId,
        provider: providerName,
        error: message,
      });

      throw error;
    }
  }

  private resolveCandidates(request: ProviderRequest): ProviderName[] {
    const applyRequestExclusions = (providers: ProviderName[]) =>
      providers.filter(
        (provider) =>
          !request.constraints?.excludedProviders?.includes(provider),
      );

    if (request.constraints?.preferredProvider) {
      return applyRequestExclusions([
        request.constraints.preferredProvider,
        ...this.defaultOrder.filter(
          (p) => p !== request.constraints.preferredProvider,
        ),
      ]);
    }

    if (request.constraints?.requiresWeb && this.providers.perplexity) {
      return applyRequestExclusions([
        "perplexity",
        ...this.defaultOrder.filter((p) => p !== "perplexity"),
      ]);
    }

    if (request.constraints?.privacyMode === "local-only") {
      return applyRequestExclusions(["local"]);
    }

    return applyRequestExclusions(this.defaultOrder);
  }

  private normalizeResponse(
    response: ProviderResponse,
    provider: ProviderName,
    requestId: string,
  ): ProviderResponse {
    return {
      requestId,
      provider,
      model: response.model || "unknown-model",
      outputText: response.outputText ?? "",
      finishReason: response.finishReason ?? "unknown",
      usage: response.usage,
      routingReasons: response.routingReasons,
      raw: response.raw ?? response,
    };
  }
}

export function applyWorkspaceQuotaEnforcement(input: {
  workspaceId: string;
  provider: string;
  countUsage?: boolean;
  now?: number;
}): GatewayQuotaDecision {
  const now = input.now ?? Date.now();

  if (input.countUsage !== false) {
    recordWorkspaceQuotaUsage({
      workspaceId: input.workspaceId,
      timestamp: now,
      provider: input.provider,
    });
  }

  const quota = evaluateWorkspaceQuotaStatus(input.workspaceId, now);

  return {
    allowed: quota.allowed,
    blocked: quota.blocked,
    shouldFallback: quota.shouldFallback,
    shouldAlert: quota.shouldAlert,
    thresholdReached: quota.thresholdReached,
    provider: quota.shouldFallback ? quota.fallbackProvider : input.provider,
    quota,
  };
}

export function enforceWorkspaceQuotaOrThrow(input: {
  workspaceId: string;
  provider: string;
  countUsage?: boolean;
  now?: number;
}) {
  const decision = applyWorkspaceQuotaEnforcement(input);

  if (decision.blocked) {
    const error = new Error("Workspace quota exceeded");
    (error as any).code = "WORKSPACE_QUOTA_EXCEEDED";
    (error as any).workspaceId = input.workspaceId;
    (error as any).quota = decision.quota;
    throw error;
  }

  return decision;
}

// Lazy singleton — instantiated on first access, not at module load time.
// This prevents adapter constructors from running during test imports,
// which would crash without API keys / Ollama before any mock can intercept.
let _gateway: Gateway | undefined;
export const gateway = new Proxy({} as Gateway, {
  get(_target, prop) {
    _gateway ??= new Gateway();
    return (_gateway as any)[prop];
  },
});

// ── Helper methods for cognitive complexity reduction ────────────────────────
Gateway.prototype.appendLocalIfAvailable = function (
  this: Gateway,
  candidates: ProviderName[],
  requestExcluded: ProviderName[],
): void {
  try {
    const policyState = getState();
    if (
      !candidates.includes("local") &&
      !requestExcluded.includes("local") &&
      !policyState.blockedProviders.includes("local") &&
      this.providers.local
    ) {
      candidates.push("local");
    }
  } catch (error) {
    logNonFatalError(error, "appendLocalIfAvailable-policy-state");
    if (
      !candidates.includes("local") &&
      !requestExcluded.includes("local") &&
      this.providers.local
    ) {
      candidates.push("local");
    }
  }
};

Gateway.prototype.appendLocalIfAvailableForStream = function (
  this: Gateway,
  candidates: ProviderName[],
  requestExcluded: ProviderName[],
  preferredProvider?: string,
): void {
  try {
    const policyState = getState();
    if (
      !candidates.includes("local") &&
      !requestExcluded.includes("local") &&
      !policyState.blockedProviders.includes("local") &&
      this.providers.local
    ) {
      if (preferredProvider === "local") {
        candidates.unshift("local");
      } else {
        candidates.push("local");
      }
    }
  } catch (error) {
    logNonFatalError(error, "appendLocalIfAvailableForStream-policy-state");
    if (
      !candidates.includes("local") &&
      !requestExcluded.includes("local") &&
      this.providers.local
    ) {
      if (preferredProvider === "local") {
        candidates.unshift("local");
      } else {
        candidates.push("local");
      }
    }
  }
};
