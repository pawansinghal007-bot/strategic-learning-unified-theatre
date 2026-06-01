import {
  ProviderAdapter,
  ProviderName,
  ProviderRequest,
  ProviderResponse,
} from "../shared/contracts/provider";
import {
  providerRequestSchema,
  providerResponseSchema,
} from "../shared/schemas/provider.schema";
import {
  RoutingNoProviderError,
  ValidationFailedError,
} from "../shared/errors";
import { logger } from "../shared/logging/logger";
import { LocalProviderAdapter } from "./providers/local";

export interface GatewayOptions {
  providers?: Partial<Record<ProviderName, ProviderAdapter>>;
  defaultOrder?: ProviderName[];
}

export class Gateway {
  private readonly providers: Partial<Record<ProviderName, ProviderAdapter>>;
  private readonly defaultOrder: ProviderName[];

  constructor(options: GatewayOptions = {}) {
    this.providers = {
      local: new LocalProviderAdapter(),
      ...options.providers,
    };
    this.defaultOrder = options.defaultOrder ?? ["local"];
  }

  async ask(request: ProviderRequest): Promise<ProviderResponse> {
    const parsedRequest = providerRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      throw new ValidationFailedError("Invalid provider request", {
        issues: parsedRequest.error.issues,
      });
    }

    const candidates = this.resolveCandidates(parsedRequest.data);
    if (!candidates.length) {
      throw new RoutingNoProviderError("No provider candidates available");
    }

    logger.info("gateway.ask.start", {
      requestId: parsedRequest.data.requestId,
      workspaceId: parsedRequest.data.workspaceId,
      intent: parsedRequest.data.intent,
      candidates,
    });

    const errors: Array<{ provider: string; message: string }> = [];

    for (const providerName of candidates) {
      const provider = this.providers[providerName];
      if (!provider) {
        logger.warn("gateway.provider.missing", { provider: providerName });
        continue;
      }

      try {
        logger.info("gateway.provider.try", {
          requestId: parsedRequest.data.requestId,
          provider: providerName,
        });

        const rawResponse = await provider.ask(parsedRequest.data);
        const normalizedResponse = this.normalizeResponse(
          rawResponse,
          providerName,
          parsedRequest.data.requestId,
        );

        const parsedResponse =
          providerResponseSchema.safeParse(normalizedResponse);
        if (!parsedResponse.success) {
          throw new ValidationFailedError("Invalid provider response", {
            provider: providerName,
            issues: parsedResponse.error.issues,
          });
        }

        logger.info("gateway.ask.success", {
          requestId: parsedRequest.data.requestId,
          provider: providerName,
          model: parsedResponse.data.model,
        });

        return parsedResponse.data;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ provider: providerName, message });
        logger.warn("gateway.provider.failed", {
          requestId: parsedRequest.data.requestId,
          provider: providerName,
          error: message,
        });
      }
    }

    logger.error("gateway.ask.failed", {
      requestId: parsedRequest.data.requestId,
      errors,
    });

    throw new RoutingNoProviderError("All providers failed for the request", {
      errors,
    });
  }

  private resolveCandidates(request: ProviderRequest): ProviderName[] {
    if (request.constraints?.preferredProvider) {
      return [
        request.constraints.preferredProvider,
        ...this.defaultOrder.filter(
          (p) => p !== request.constraints?.preferredProvider,
        ),
      ];
    }

    if (request.constraints?.requiresWeb && this.providers.perplexity) {
      return [
        "perplexity",
        ...this.defaultOrder.filter((p) => p !== "perplexity"),
      ];
    }

    if (request.constraints?.privacyMode === "local-only") {
      return ["local"];
    }

    return this.defaultOrder.filter(
      (provider) => !request.constraints?.excludedProviders?.includes(provider),
    );
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

export const gateway = new Gateway();
