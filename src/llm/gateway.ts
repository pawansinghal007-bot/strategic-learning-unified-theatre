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
            issues: parsedResponse.error.flatten(),
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

  async *stream(request: ProviderRequest): AsyncIterable<TokenChunk> {
    const parsedRequest = providerRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      throw new ValidationFailedError("Invalid provider request for stream", {
        issues: parsedRequest.error.flatten(),
      });
    }

    const candidates = this.resolveCandidates(parsedRequest.data);
    if (!candidates.length) {
      throw new RoutingNoProviderError(
        "No provider candidates available for stream",
      );
    }

    const providerName = candidates[0];
    const provider = this.providers[providerName];

    if (!provider?.stream) {
      throw new RoutingNoProviderError(
        `Provider ${providerName} does not support streaming`,
      );
    }

    logger.info("gateway.stream.start", {
      requestId: parsedRequest.data.requestId,
      provider: providerName,
    });

    for await (const chunk of provider.stream(parsedRequest.data)) {
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

    logger.info("gateway.stream.success", {
      requestId: parsedRequest.data.requestId,
      provider: providerName,
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
