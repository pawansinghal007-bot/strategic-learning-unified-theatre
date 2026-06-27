import {
  ProviderCapability,
  ProviderRequest,
  ProviderResponse,
} from "../../shared/contracts/provider";
import { BaseProviderAdapter } from "./base";

export class GeminiProviderAdapter extends BaseProviderAdapter {
  readonly name = "gemini" as const;

  capabilities(): ProviderCapability[] {
    return ["chat", "streaming", "summarization", "reasoning", "vision"];
  }

  protected async execute(req: ProviderRequest): Promise<ProviderResponse> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("401 unauthorized: missing API key for gemini");
    }

    return {
      requestId: req.requestId,
      provider: this.name,
      model: "gemini-2.0-flash",
      outputText: `[gemini stub] ${req.prompt}`,
      finishReason: "stop",
      usage: {
        inputTokens: req.prompt.length,
        outputTokens: Math.ceil(req.prompt.length * 0.75),
        totalTokens: req.prompt.length + Math.ceil(req.prompt.length * 0.75),
        estimatedCostUsd: 0,
        latencyMs: 90,
      },
      routingReasons: [
        {
          code: "default_selection",
          message: "Gemini adapter selected from configured provider set.",
        },
      ],
      raw: { stub: true, provider: "gemini" },
    };
  }
}
