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
  applyPolicyToCandidates,
  applyPolicyToCandidatesWithReason,
  getState,
  selectPolicyExplanation,
} from "../policies/provider-policy";
import { buildRequestContextPrompt } from "../memory/request-context";

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

  async ask(request: ProviderRequest): Promise<ProviderResponse> {
    const parsedRequest = providerRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      throw new ValidationFailedError("Invalid provider request", {
        issues: parsedRequest.error.flatten(),
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
    try {
      const policyState = getState();
      if (
        !candidates.includes("local") &&
        !requestExcluded.includes("local") &&
        !policyState.blockedProviders.includes("local") &&
        this.providers.local
      ) {
        candidates = [...candidates, "local"];
      }
    } catch (_) {
      // If policy state is unavailable, fall back to simple check
      if (
        !candidates.includes("local") &&
        !requestExcluded.includes("local") &&
        this.providers.local
      ) {
        candidates = [...candidates, "local"];
      }
    }

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
      const provider = this.providers[providerName];
      if (!provider) {
        logger.warn("gateway.provider.missing", { provider: providerName });
        continue;
      }

      if (!isProviderAvailable(providerName)) {
        unavailableProviders.push(providerName);
        logger.info("gateway.provider.skipped_unhealthy", {
          provider: providerName,
        });
        continue;
      }

      const startedAt = Date.now();
      let selectedProviderName: ProviderName = providerName;
      let selectedProvider: ProviderAdapter | undefined = provider;

      if (parsedRequest.data.workspaceId) {
        const quotaDecision = applyWorkspaceQuotaEnforcement({
          workspaceId: parsedRequest.data.workspaceId,
          provider: providerName,
          now: startedAt,
        });

        if (quotaDecision.blocked) {
          logger.warn("gateway.provider.blocked_by_workspace_quota", {
            workspaceId: parsedRequest.data.workspaceId,
            provider: providerName,
          });
          throw Object.assign(new Error("Workspace quota exceeded"), {
            code: "WORKSPACE_QUOTA_EXCEEDED",
            workspaceId: parsedRequest.data.workspaceId,
            quota: quotaDecision.quota,
          });
        }

        if (
          quotaDecision.shouldFallback &&
          quotaDecision.provider &&
          quotaDecision.provider !== providerName &&
          this.providers[quotaDecision.provider as ProviderName]
        ) {
          fallbackFrom = providerName;
          selectedProviderName = quotaDecision.provider as ProviderName;
          selectedProvider = this.providers[selectedProviderName];
        }

        if (quotaDecision.shouldAlert || quotaDecision.thresholdReached) {
          logger.warn("gateway.workspace_quota.alert", {
            workspaceId: parsedRequest.data.workspaceId,
            provider: providerName,
            fallbackProvider: quotaDecision.provider,
            thresholdReached: quotaDecision.thresholdReached,
            shouldAlert: quotaDecision.shouldAlert,
          });
        }
      }

      try {
        logger.info("gateway.provider.try", {
          requestId: parsedRequest.data.requestId,
          provider: selectedProviderName,
        });

        // Inject workspace context into prompt if available
        let requestData = parsedRequest.data;
        if (requestData.workspaceId) {
          try {
            const contextPrompt = buildRequestContextPrompt(
              requestData.workspaceId,
            );
            if (contextPrompt) {
              requestData = {
                ...requestData,
                prompt: `${contextPrompt}\n\nUser request: ${requestData.prompt}`,
              };
            }
          } catch (_) {
            /* context injection is non-fatal */
          }
        }

        const rawResponse = await selectedProvider!.ask(requestData);
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
            issues: parsedResponse.error.flatten(),
          });
        }

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

        return {
          ...parsedResponse.data,
          routingReasons: [
            ...(parsedResponse.data.routingReasons ?? []),
            { code: "default_selection", message: reason },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        try {
          recordProviderFailure(selectedProviderName);
        } catch (_) {
          /* non-fatal */
        }

        if (error instanceof DomainError) {
          try {
            markProviderFromError(selectedProviderName, error);
          } catch (_) {
            /* non-fatal */
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

        errors.push({ provider: selectedProviderName, message });
        fallbackFrom = providerName;

        logger.warn("gateway.provider.failed", {
          requestId: parsedRequest.data.requestId,
          provider: selectedProviderName,
          error: message,
        });
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
        issues: parsedRequest.error.flatten(),
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
    try {
      const streamPolicyState = getState();
      if (
        !candidates.includes("local") &&
        !streamRequestExcluded.includes("local") &&
        !streamPolicyState.blockedProviders.includes("local") &&
        this.providers.local
      ) {
        const preferred = parsedRequest.data.constraints?.preferredProvider;
        candidates =
          preferred === "local"
            ? ["local", ...candidates]
            : [...candidates, "local"];
      }
    } catch (_) {
      if (
        !candidates.includes("local") &&
        !streamRequestExcluded.includes("local") &&
        this.providers.local
      ) {
        const preferred = parsedRequest.data.constraints?.preferredProvider;
        candidates =
          preferred === "local"
            ? ["local", ...candidates]
            : [...candidates, "local"];
      }
    }

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
              issues: parsedChunk.error.flatten(),
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

export const gateway = new Gateway();
