import {
  ProviderCapability,
  ProviderRequest,
  ProviderResponse,
} from "../../shared/contracts/provider";
import { BaseProviderAdapter } from "./base";

export class PerplexityProviderAdapter extends BaseProviderAdapter {
  readonly name = "perplexity" as const;

  capabilities(): ProviderCapability[] {
    return ["chat", "web_research", "summarization", "reasoning"];
  }

  protected async execute(req: ProviderRequest): Promise<ProviderResponse> {
    if (!process.env.PERPLEXITY_API_KEY) {
      throw new Error("Missing PERPLEXITY_API_KEY");
    }

    return {
      requestId: req.requestId,
      provider: this.name,
      model: "sonar",
      outputText: `[perplexity stub] ${req.prompt}`,
      finishReason: "stop",
      usage: {
        inputTokens: req.prompt.length,
        outputTokens: Math.ceil(req.prompt.length * 0.9),
        totalTokens: req.prompt.length + Math.ceil(req.prompt.length * 0.9),
        estimatedCostUsd: 0.0002,
        latencyMs: 160,
      },
      routingReasons: [
        {
          code: "default_selection",
          message: "Perplexity adapter selected from configured provider set.",
        },
      ],
      raw: { stub: true, provider: "perplexity" },
    };
  }
}
