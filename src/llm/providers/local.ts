import {
  ProviderAdapter,
  ProviderCapability,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
} from "../../shared/contracts/provider";

export class LocalProviderAdapter implements ProviderAdapter {
  readonly name = "local" as const;

  capabilities(): ProviderCapability[] {
    return [
      "chat",
      "offline",
      "private_mode",
      "summarization",
      "code_generation",
    ];
  }

  async health(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      available: true,
      status: "healthy",
      message: "Local provider available",
      lastCheckedAt: new Date().toISOString(),
    };
  }

  async ask(req: ProviderRequest): Promise<ProviderResponse> {
    return {
      requestId: req.requestId,
      provider: this.name,
      model: "local-dev-stub",
      outputText: `[local stub] ${req.prompt}`,
      finishReason: "stop",
      usage: {
        inputTokens: req.prompt.length,
        outputTokens: req.prompt.length,
        totalTokens: req.prompt.length * 2,
        estimatedCostUsd: 0,
        latencyMs: 5,
      },
      routingReasons: [
        {
          code: "default_selection",
          message: "Selected local adapter as the configured provider.",
        },
      ],
      raw: { stub: true },
    };
  }
}
