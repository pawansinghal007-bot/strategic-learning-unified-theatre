import { ProviderCapability, ProviderRequest, ProviderResponse } from '../../shared/contracts/provider';
import { BaseProviderAdapter } from './base';

export class GroqProviderAdapter extends BaseProviderAdapter {
  readonly name = 'groq' as const;

  capabilities(): ProviderCapability[] {
    return ['chat', 'streaming', 'summarization', 'code_generation'];
  }

  protected async execute(req: ProviderRequest): Promise<ProviderResponse> {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('Missing GROQ_API_KEY');
    }

    return {
      requestId: req.requestId,
      provider: this.name,
      model: 'llama-3.3-70b-versatile',
      outputText: `[groq stub] ${req.prompt}`,
      finishReason: 'stop',
      usage: {
        inputTokens: req.prompt.length,
        outputTokens: Math.ceil(req.prompt.length * 0.7),
        totalTokens: req.prompt.length + Math.ceil(req.prompt.length * 0.7),
        estimatedCostUsd: 0,
        latencyMs: 40,
      },
      routingReasons: [
        {
          code: 'default_selection',
          message: 'Groq adapter selected from configured provider set.',
        },
      ],
      raw: { stub: true, provider: 'groq' },
    };
  }
}
