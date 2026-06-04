import { existsSync } from 'fs';
import { join } from 'path';
import {
  recordRoutingDecision,
  getRoutingHistory,
  resetRoutingHistory,
} from '../src/llm/routing-history.js';
import { explainRoutingSelection } from '../src/llm/routing-explainer.js';
import { Gateway } from '../src/llm/gateway.js';
import {
  resetProviderHealth,
} from '../src/llm/provider-health.js';
import {
  resetProviderUsage,
} from '../src/llm/provider-usage.js';

describe('Sprint 26 smoke tests — routing history', () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it('getRoutingHistory returns empty array initially', () => {
    const history = getRoutingHistory();
    expect(history).toEqual([]);
  });

  it('recordRoutingDecision stores a success record', () => {
    recordRoutingDecision({
      request: { requestId: 'test-1', prompt: 'hello' },
      provider: 'local',
      model: 'local-dev-stub',
      success: true,
      reason: 'Selected local by default routing priority.',
    });
    const history = getRoutingHistory();
    expect(history.length).toBe(1);
    expect(history[0].provider).toBe('local');
    expect(history[0].success).toBe(true);
  });

  it('recordRoutingDecision stores a failure record', () => {
    recordRoutingDecision({
      request: { requestId: 'test-1', prompt: 'hello' },
      provider: 'groq',
      model: 'unknown-model',
      success: false,
      reason: 'Provider groq failed.',
      errorMessage: 'Missing GROQ_API_KEY',
    });
    const history = getRoutingHistory();
    expect(history[0].success).toBe(false);
    expect(history[0].errorMessage).toContain('GROQ_API_KEY');
  });

  it('records are returned newest first', () => {
    recordRoutingDecision({
      request: { requestId: 'test-1', prompt: 'hello' },
      provider: 'groq',
      model: 'm',
      success: false,
      reason: 'first',
    });
    recordRoutingDecision({
      request: { requestId: 'test-1', prompt: 'hello' },
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'second',
    });
    const history = getRoutingHistory();
    expect(history[0].reason).toBe('second');
  });

  it('getRoutingHistory respects limit', () => {
    for (let i = 0; i < 10; i++) {
      recordRoutingDecision({
        request: { requestId: 'test-1', prompt: 'hello' },
        provider: 'local',
        model: 'm',
        success: true,
        reason: 'r' + i,
      });
    }
    expect(getRoutingHistory(3).length).toBe(3);
  });

  it('resetRoutingHistory clears all records', () => {
    recordRoutingDecision({
      request: { requestId: 'test-1', prompt: 'hello' },
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'test',
    });
    resetRoutingHistory();
    expect(getRoutingHistory().length).toBe(0);
  });
});

describe('Sprint 26 smoke tests — routing explainer', () => {
  it('returns local-only reason for local-only privacy mode', () => {
    const reason = explainRoutingSelection(
      { requestId: 'test-1', prompt: 'hello', constraints: { privacyMode: 'local-only' } },
      'local',
    );
    expect(reason).toContain('local');
    expect(reason).toContain('privacy');
  });

  it('returns preferred provider reason when constraint matches', () => {
    const reason = explainRoutingSelection(
      { requestId: 'test-1', prompt: 'hello', constraints: { preferredProvider: 'groq' } },
      'groq',
    );
    expect(reason).toContain('groq');
    expect(reason).toContain('preferred');
  });

  it('returns fallback reason when fallbackFrom is set', () => {
    const reason = explainRoutingSelection(
      { requestId: 'test-1', prompt: 'hello' },
      'local',
      { fallbackFrom: 'groq' },
    );
    expect(reason).toContain('fallback');
    expect(reason).toContain('groq');
  });

  it('returns default priority reason for plain request', () => {
    const reason = explainRoutingSelection(
      { requestId: 'test-1', prompt: 'hello' },
      'local',
    );
    expect(reason).toBeTruthy();
    expect(typeof reason).toBe('string');
  });
});

describe('Sprint 26 smoke tests — gateway routing hooks', () => {
  beforeEach(() => {
    resetRoutingHistory();
    resetProviderHealth();
    resetProviderUsage();
  });

  it('gateway.ask() records a routing decision on success', async () => {
    const gw = new Gateway({ defaultOrder: ['local'] });
    await gw.ask({ requestId: 'smoke-26-1', prompt: 'test routing' });
    const history = getRoutingHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].provider).toBe('local');
    expect(history[0].success).toBe(true);
    expect(history[0].reason).toBeTruthy();
  });

  it('gateway.ask() records a failure decision when provider throws', async () => {
    const gw = new Gateway({
      defaultOrder: ['local'],
      providers: {
        local: {
          name: 'local',
          capabilities: () => [],
          ask: async () => {
            throw new Error('forced fail');
          },
        },
      },
    });
    await expect(gw.ask({ requestId: 'smoke-26-2', prompt: 'fail' })).rejects.toThrow();
    const history = getRoutingHistory();
    expect(history.some((r) => r.success === false)).toBe(true);
  });
});

describe('Sprint 26 smoke tests — file existence', () => {
  it('routing-history.ts exists', () => {
    expect(existsSync(join(process.cwd(), 'src/llm/routing-history.ts'))).toBe(true);
  });

  it('routing-explainer.ts exists', () => {
    expect(existsSync(join(process.cwd(), 'src/llm/routing-explainer.ts'))).toBe(true);
  });

  it('IPC handler file exists', () => {
    expect(existsSync(join(process.cwd(), 'electron-ui/ipc/provider-telemetry-handlers.cjs'))).toBe(true);
  });

  it('dashboard HTML contains getRoutingHistory reference', () => {
    const { readFileSync } = require('fs');
    const content = readFileSync(join(process.cwd(), 'src/ui/provider-dashboard.html'), 'utf-8');
    expect(content).toContain('getRoutingHistory');
  });

  it('llm-routing CLI file exists', () => {
    expect(existsSync(join(process.cwd(), 'src/cli/llm-routing.ts'))).toBe(true);
  });
});
