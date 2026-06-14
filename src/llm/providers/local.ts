import {
  ProviderCapability,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
} from "../../shared/contracts/provider";
import { BaseProviderAdapter } from "./base";

export function resolveLlamaEndpoint() {
  const configured = process.env.VSCODE_ROTATOR_LLM_ENDPOINT?.trim();
  return configured || "http://localhost:8080/v1/chat/completions";
}

export class LocalProviderAdapter extends BaseProviderAdapter {
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

  protected async execute(req: ProviderRequest): Promise<ProviderResponse> {
    if (process.env.VSCODE_ROTATOR_MOCK_LLM) {
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

    const endpoint = resolveLlamaEndpoint();
    const model = process.env.VSCODE_ROTATOR_LLM_MODEL?.trim() || "llama3";
    const messages = [
      ...(req.systemPrompt
        ? [{ role: "system", content: req.systemPrompt }]
        : []),
      { role: "user", content: req.prompt },
    ];

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: req.constraints?.temperature ?? 0.2,
        max_tokens: req.constraints?.maxTokens ?? 512,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Llama server request failed (${response.status} ${response.statusText}): ${text}`,
      );
    }

    const json = await response.json();
    const outputText =
      json?.choices?.[0]?.message?.content ??
      json?.message?.content ??
      json?.response ??
      "";

    return {
      requestId: req.requestId,
      provider: this.name,
      model: json?.model ?? model,
      outputText,
      finishReason: json?.choices?.[0]?.finish_reason ?? "stop",
      usage: {
        inputTokens: json?.usage?.prompt_tokens ?? req.prompt.length,
        outputTokens: json?.usage?.completion_tokens ?? outputText.length,
        totalTokens:
          (json?.usage?.prompt_tokens ?? req.prompt.length) +
          (json?.usage?.completion_tokens ?? outputText.length),
        estimatedCostUsd: 0,
        latencyMs: json?.usage?.total_duration
          ? Math.max(1, Math.round(json.usage.total_duration / 1000000))
          : 0,
      },
      routingReasons: [
        {
          code: "default_selection",
          message:
            "Selected the local llama server endpoint configured for Docker.",
        },
      ],
      raw: json,
    };
  }
}
