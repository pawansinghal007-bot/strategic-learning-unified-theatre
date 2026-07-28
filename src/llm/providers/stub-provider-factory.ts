/**
 * src/llm/providers/stub-provider-factory.ts
 *
 * Factory for creating stub LLM provider adapter classes.
 * Eliminates boilerplate duplication across grok.ts, groq.ts, openai.ts and
 * any future stub providers.
 *
 * Usage:
 *   export const GrokProviderAdapter = createStubProviderClass({ ... });
 *   const adapter = new GrokProviderAdapter(); // works as expected
 */

import {
  ProviderCapability,
  ProviderName,
  ProviderRequest,
  ProviderResponse,
} from "../../shared/contracts/provider";
import { BaseProviderAdapter } from "./base";

/** Per-provider configuration for a stub adapter. */
export interface StubProviderConfig {
  /** Provider name — must be a valid ProviderName. */
  readonly name: ProviderName;
  /** Environment variable that holds the API key (checked at execute time). */
  readonly apiKeyEnv: string;
  /** Model identifier reported in the response. */
  readonly model: string;
  /** Prefix prepended to the prompt in outputText (e.g. "[grok stub]"). */
  readonly outputPrefix: string;
  /** Routing message included in routingReasons[0]. */
  readonly routingMessage: string;
}

const STUB_CAPABILITIES: ProviderCapability[] = [
  "chat",
  "streaming",
  "tool_use",
  "summarization",
  "code_generation",
];

/**
 * Create a stub provider adapter class from a config object.
 * Returns a constructor so callers can use `new AdapterClass()` normally.
 *
 * @param config - Provider-specific configuration
 * @returns A class extending BaseProviderAdapter, ready to instantiate
 */
export function createStubProviderClass(
  config: StubProviderConfig,
): new () => BaseProviderAdapter {
  class StubAdapter extends BaseProviderAdapter {
    readonly name: ProviderName = config.name;

    capabilities(): ProviderCapability[] {
      return STUB_CAPABILITIES;
    }

    protected async execute(req: ProviderRequest): Promise<ProviderResponse> {
      if (!process.env[config.apiKeyEnv]) {
        throw new Error(`401 unauthorized: missing API key for ${config.name}`);
      }

      return {
        requestId: req.requestId,
        provider: this.name,
        model: config.model,
        outputText: `${config.outputPrefix} ${req.prompt}`,
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
            message: config.routingMessage,
          },
        ],
        raw: { stub: true, provider: config.name },
      };
    }
  }

  return StubAdapter;
}
