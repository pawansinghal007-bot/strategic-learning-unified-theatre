import {
  ProviderCapability,
  ProviderRequest,
  ProviderResponse,
} from "../../shared/contracts/provider";
import { BaseProviderAdapter } from "./base";

export class GrokProviderAdapter extends BaseProviderAdapter {
  readonly name = "grok" as const;

  capabilities(): ProviderCapability[] {
    return [
      "chat",
      "streaming",
      "tool_use",
      "summarization",
      "code_generation",
    ];
  }

  protected async execute(req: ProviderRequest): Promise<ProviderResponse> {
    if (!process.env.XAI_API_KEY) {
      throw new Error("401 unauthorized: missing API key for grok");
    }

    return {
      requestId: req.requestId,
      provider: this.name,
      model: "grok-3",
      outputText: `[grok stub] ${req.prompt}`,
      finishReason: "stop",
      usage: {
        inputTokens: req.prompt.length,
        outputTokens: Math.ceil(req.prompt.length * 0.8),
        totalTokens: req.prompt.length + Math.ceil(req.prompt.length * 0.8),
        estimatedCostUsd: 0.0001,
        latencyMs: 120,
      },
      routingReasons: [
        {
          code: "default_selection",
          message: "Grok adapter selected from configured provider set.",
        },
      ],
      raw: { stub: true, provider: "grok" },
    };
  }
}
