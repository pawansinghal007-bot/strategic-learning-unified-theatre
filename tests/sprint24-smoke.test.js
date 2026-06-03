import {
  markProviderFromError,
  isProviderAvailable,
  getProviderHealthSnapshot,
  resetProviderHealth,
  markProviderHealthy,
} from '../src/llm/provider-health.js';
import {
  recordProviderSuccess,
  recordProviderFailure,
  getProviderUsage,
  resetProviderUsage,
} from '../src/llm/provider-usage.js';
import {
  getProviderStatus,
  resetAllProviderTelemetry,
} from '../src/llm/status.js';
import {
  ProviderAuthError,
  ProviderQuotaError,
  ProviderTimeoutError,
} from '../src/shared/errors/index.js';

describe('Sprint 24 smoke tests — persistent health', () => {
  beforeEach(() => {
    resetProviderHealth();
  });

  it('markProviderFromError persists health state', () => {
    markProviderFromError('groq', new ProviderQuotaError('quota'));
    const snapshot = getProviderHealthSnapshot();
    expect(snapshot.some((r) => r.provider === 'groq')).toBe(true);
  });

  it('isProviderAvailable returns false after marking unhealthy', () => {
    markProviderFromError('openai', new ProviderAuthError('bad key'));
    expect(isProviderAvailable('openai')).toBe(false);
  });

  it('markProviderHealthy removes provider from persisted state', () => {
    markProviderFromError('gemini', new ProviderTimeoutError('timeout'));
    markProviderHealthy('gemini');
    expect(isProviderAvailable('gemini')).toBe(true);
  });

  it('resetProviderHealth clears all persisted health state', () => {
    markProviderFromError('groq', new ProviderQuotaError('quota'));
    markProviderFromError('openai', new ProviderAuthError('auth'));
    resetProviderHealth();
    expect(getProviderHealthSnapshot().length).toBe(0);
  });

  it('resetProviderHealth clears single provider', () => {
    markProviderFromError('groq', new ProviderQuotaError('quota'));
    markProviderFromError('openai', new ProviderAuthError('auth'));
    resetProviderHealth('groq');
    expect(isProviderAvailable('groq')).toBe(true);
    expect(isProviderAvailable('openai')).toBe(false);
  });
});

describe('Sprint 24 smoke tests — persistent usage', () => {
  beforeEach(() => {
    resetProviderUsage();
  });

  it('recordProviderSuccess persists usage counters', () => {
    recordProviderSuccess('local', {
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0 },
    });
    const rows = getProviderUsage();
    const local = rows.find((r) => r.provider === 'local');
    expect(local.successCount).toBe(1);
    expect(local.totalTokens).toBe(30);
  });

  it('recordProviderFailure persists failure counts', () => {
    recordProviderFailure('groq');
    const rows = getProviderUsage();
    const groq = rows.find((r) => r.provider === 'groq');
    expect(groq.failureCount).toBe(1);
  });

  it('counters accumulate across multiple calls', () => {
    recordProviderSuccess('local', { usage: { totalTokens: 10 } });
    recordProviderSuccess('local', { usage: { totalTokens: 20 } });
    const rows = getProviderUsage();
    const local = rows.find((r) => r.provider === 'local');
    expect(local.successCount).toBe(2);
    expect(local.totalTokens).toBe(30);
  });

  it('resetProviderUsage clears all persisted usage', () => {
    recordProviderSuccess('local', { usage: { totalTokens: 10 } });
    resetProviderUsage();
    const rows = getProviderUsage();
    const local = rows.find((r) => r.provider === 'local');
    expect(local.requestCount).toBe(0);
  });
});

describe('Sprint 24 smoke tests — resetAllProviderTelemetry', () => {
  beforeEach(() => {
    resetProviderHealth();
    resetProviderUsage();
  });

  it('resetAllProviderTelemetry clears both health and usage', () => {
    markProviderFromError('groq', new ProviderQuotaError('quota'));
    recordProviderSuccess('groq', { usage: { totalTokens: 10 } });
    resetAllProviderTelemetry();
    expect(isProviderAvailable('groq')).toBe(true);
    const rows = getProviderUsage();
    const groq = rows.find((r) => r.provider === 'groq');
    expect(groq.requestCount).toBe(0);
  });

  it('resetAllProviderTelemetry clears single provider only', () => {
    markProviderFromError('groq', new ProviderQuotaError('quota'));
    markProviderFromError('openai', new ProviderAuthError('auth'));
    resetAllProviderTelemetry('groq');
    expect(isProviderAvailable('groq')).toBe(true);
    expect(isProviderAvailable('openai')).toBe(false);
  });

  it('getProviderStatus reflects persisted state', () => {
    markProviderFromError('groq', new ProviderQuotaError('quota'));
    recordProviderSuccess('local', { usage: { totalTokens: 50 } });
    const rows = getProviderStatus();
    const groq = rows.find((r) => r.name === 'groq');
    const local = rows.find((r) => r.name === 'local');
    expect(groq.state).toBe('exhausted');
    expect(local.totalTokens).toBe(50);
  });
});
