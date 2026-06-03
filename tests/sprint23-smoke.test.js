import {
  recordProviderSuccess,
  recordProviderFailure,
  getProviderUsage,
  resetProviderUsage,
} from '../src/llm/provider-usage.js';
import { Gateway } from '../src/llm/gateway.js';
import {
  resetProviderHealth,
} from '../src/llm/provider-health.js';

describe('Sprint 23 smoke tests — provider usage tracker', () => {
  beforeEach(() => {
    resetProviderUsage();
    resetProviderHealth();
  });

  it('getProviderUsage returns a row for each known provider', () => {
    const rows = getProviderUsage();
    expect(rows.length).toBe(5);
    const names = rows.map((r) => r.provider);
    expect(names).toContain('groq');
    expect(names).toContain('gemini');
    expect(names).toContain('openai');
    expect(names).toContain('perplexity');
    expect(names).toContain('local');
  });

  it('recordProviderSuccess increments requestCount and successCount', () => {
    recordProviderSuccess('local', {
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0 },
    });
    const rows = getProviderUsage();
    const local = rows.find((r) => r.provider === 'local');
    expect(local.requestCount).toBe(1);
    expect(local.successCount).toBe(1);
    expect(local.failureCount).toBe(0);
  });

  it('recordProviderSuccess accumulates token totals', () => {
    recordProviderSuccess('local', {
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0.001 },
    });
    recordProviderSuccess('local', {
      usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15, estimatedCostUsd: 0.0005 },
    });
    const rows = getProviderUsage();
    const local = rows.find((r) => r.provider === 'local');
    expect(local.totalTokens).toBe(45);
    expect(local.successCount).toBe(2);
  });

  it('recordProviderFailure increments requestCount and failureCount', () => {
    recordProviderFailure('groq');
    const rows = getProviderUsage();
    const groq = rows.find((r) => r.provider === 'groq');
    expect(groq.requestCount).toBe(1);
    expect(groq.failureCount).toBe(1);
    expect(groq.successCount).toBe(0);
  });

  it('resetProviderUsage clears all usage state', () => {
    recordProviderSuccess('local', { usage: { totalTokens: 10 } });
    recordProviderFailure('groq');
    resetProviderUsage();
    const rows = getProviderUsage();
    const local = rows.find((r) => r.provider === 'local');
    const groq = rows.find((r) => r.provider === 'groq');
    expect(local.requestCount).toBe(0);
    expect(groq.requestCount).toBe(0);
  });

  it('resetProviderUsage clears single provider only', () => {
    recordProviderSuccess('local', { usage: { totalTokens: 10 } });
    recordProviderFailure('groq');
    resetProviderUsage('groq');
    const rows = getProviderUsage();
    const local = rows.find((r) => r.provider === 'local');
    const groq = rows.find((r) => r.provider === 'groq');
    expect(local.requestCount).toBe(1);
    expect(groq.requestCount).toBe(0);
  });
});

describe('Sprint 23 smoke tests — gateway usage hooks', () => {
  beforeEach(() => {
    resetProviderUsage();
    resetProviderHealth();
  });

  it('gateway.ask() records success usage for local provider', async () => {
    const gateway = new Gateway({ defaultOrder: ['local'] });
    await gateway.ask({ requestId: 'smoke-23-1', prompt: 'usage test' });
    const rows = getProviderUsage();
    const local = rows.find((r) => r.provider === 'local');
    expect(local.successCount).toBe(1);
    expect(local.requestCount).toBe(1);
  });

  it('gateway.ask() records failure when provider throws', async () => {
    const gateway = new Gateway({
      defaultOrder: ['local'],
      providers: {
        local: {
          name: 'local',
          capabilities: () => [],
          ask: async () => { throw new Error('forced failure'); },
        },
      },
    });
    await expect(
      gateway.ask({ requestId: 'smoke-23-2', prompt: 'fail test' })
    ).rejects.toThrow();
    const rows = getProviderUsage();
    const local = rows.find((r) => r.provider === 'local');
    expect(local.failureCount).toBe(1);
  });

  it('gateway.ask() accumulates token totals across multiple calls', async () => {
    const gateway = new Gateway({ defaultOrder: ['local'] });
    await gateway.ask({ requestId: 'smoke-23-3a', prompt: 'first' });
    await gateway.ask({ requestId: 'smoke-23-3b', prompt: 'second' });
    const rows = getProviderUsage();
    const local = rows.find((r) => r.provider === 'local');
    expect(local.successCount).toBe(2);
    expect(local.totalTokens).toBeGreaterThan(0);
  });
});
