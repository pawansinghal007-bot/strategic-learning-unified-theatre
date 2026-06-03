import {
  ProviderAdapter,
  ProviderCapability,
  ProviderHealth,
  ProviderName,
  ProviderRequest,
  ProviderResponse,
  TokenChunk,
} from '../../shared/contracts/provider';
import { normalizeProviderError } from '../../shared/errors';
import { logger } from '../../shared/logging/logger';

export abstract class BaseProviderAdapter implements ProviderAdapter {
  abstract readonly name: ProviderName;

  abstract capabilities(): ProviderCapability[];

  async health(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      available: true,
      status: 'healthy',
      lastCheckedAt: new Date().toISOString(),
      message: `${this.name} adapter loaded`,
    };
  }

  async *stream(req: ProviderRequest): AsyncIterable<TokenChunk> {
    const response = await this.ask(req);
    yield {
      requestId: req.requestId,
      provider: this.name,
      delta: response.outputText,
      done: true,
    };
  }

  async ask(req: ProviderRequest): Promise<ProviderResponse> {
    try {
      const result = await this.execute(req);
      return {
        requestId: req.requestId,
        provider: this.name,
        model: result.model || `${this.name}-unknown-model`,
        outputText: result.outputText ?? '',
        finishReason: result.finishReason ?? 'unknown',
        usage: result.usage,
        routingReasons: result.routingReasons,
        raw: result.raw ?? result,
      };
    } catch (error) {
      const normalized = normalizeProviderError(this.name, error);
      logger.warn('provider.execute.failed', {
        provider: this.name,
        requestId: req.requestId,
        error: normalized.message,
      });
      throw normalized;
    }
  }

  protected abstract execute(req: ProviderRequest): Promise<ProviderResponse>;
}
