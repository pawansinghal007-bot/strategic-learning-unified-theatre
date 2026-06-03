import {
  ProviderCapability,
  ProviderRequest,
  ProviderResponse,
} from "../../shared/contracts/provider";
import { BaseProviderAdapter } from "./base";

export class OpenAIProviderAdapter extends BaseProviderAdapter {
  readonly name = "openai" as const;

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
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY");
    }

    return {
      requestId: req.requestId,
      provider: this.name,
      model: "gpt-4o-mini",
      outputText: `[openai stub] ${req.prompt}`,
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
          message: "OpenAI adapter selected from configured provider set.",
        },
      ],
      raw: { stub: true, provider: "openai" },
    };
  }
}
