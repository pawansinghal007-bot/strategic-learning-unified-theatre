import {
  ProviderCapability,
  ProviderRequest,
  ProviderResponse,
} from "../../shared/contracts/provider";
import { BaseProviderAdapter } from "./base";

export class GroqProviderAdapter extends BaseProviderAdapter {
  readonly name = "groq" as const;

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
    if (!process.env.GROQ_API_KEY) {
      throw new Error("401 unauthorized: missing API key for groq");
    }

    return {
      requestId: req.requestId,
      provider: this.name,
      model: "llama3-8b-8192",
      outputText: `[groq stub] ${req.prompt}`,
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
          message: "Groq adapter selected from configured provider set.",
        },
      ],
      raw: { stub: true, provider: "groq" },
    };
  }
}
