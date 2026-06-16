import { existsSync } from 'fs';
import { loadDashboardSurface } from './dashboard-loader.js';
import { join } from 'path';
import {
  getProviderPolicy,
  setRoutingMode,
  allowProvider,
  blockProvider,
  setManualProvider,
  resetProviderPolicy,
  applyPolicyToCandidates,
} from '../src/policies/provider-policy.js';
import { explainRoutingSelection } from '../src/llm/routing-explainer.js';
import { Gateway } from '../src/llm/gateway.js';
import { resetProviderHealth } from '../src/llm/provider-health.js';
import { resetProviderUsage } from '../src/llm/provider-usage.js';
import { resetRoutingHistory, getRoutingHistory } from '../src/llm/routing-history.js';

const ALL = ['groq', 'gemini', 'openai', 'perplexity', 'local'];

describe('Sprint 27 smoke tests — provider policy engine', () => {
  beforeEach(() => {
    resetProviderPolicy();
  });

  it('getProviderPolicy returns defaults', () => {
    const p = getProviderPolicy();
    expect(p.routingMode).toBe('cloud');
    expect(p.manualProvider).toBeNull();
    expect(p.blockedProviders).toEqual([]);
  });

  it('setRoutingMode local-only restricts to local only', () => {
    setRoutingMode('local-only');
    const candidates = applyPolicyToCandidates(ALL);
    expect(candidates).toEqual(['local']);
  });

  it('setRoutingMode cloud excludes local', () => {
    setRoutingMode('cloud');
    const candidates = applyPolicyToCandidates(ALL);
    expect(candidates).not.toContain('local');
  });

  it('setRoutingMode hybrid includes local', () => {
    setRoutingMode('hybrid');
    const candidates = applyPolicyToCandidates(ALL);
    expect(candidates).toContain('local');
  });

  it('blockProvider removes provider from candidates', () => {
    setRoutingMode('hybrid');
    blockProvider('groq');
    const candidates = applyPolicyToCandidates(ALL);
    expect(candidates).not.toContain('groq');
  });

  it('allowProvider re-adds a blocked provider', () => {
    setRoutingMode('hybrid');
    blockProvider('groq');
    allowProvider('groq');
    const candidates = applyPolicyToCandidates(ALL);
    expect(candidates).toContain('groq');
  });

  it('setManualProvider pins provider to front of candidates', () => {
    setRoutingMode('hybrid');
    setManualProvider('local');
    const candidates = applyPolicyToCandidates(ALL);
    expect(candidates[0]).toBe('local');
  });

  it('setManualProvider throws when provider is blocked', () => {
    setRoutingMode('hybrid');
    blockProvider('groq');
    expect(() => setManualProvider('groq')).toThrow();
  });

  it('resetProviderPolicy restores defaults', () => {
    setRoutingMode('local-only');
    blockProvider('groq');
    resetProviderPolicy();
    const p = getProviderPolicy();
    expect(p.routingMode).toBe('cloud');
    expect(p.blockedProviders).toEqual([]);
  });
});

describe('Sprint 27 smoke tests — policy-aware gateway', () => {
  beforeEach(() => {
    resetProviderPolicy();
    resetProviderHealth();
    resetProviderUsage();
    resetRoutingHistory();
  });

  it('gateway.ask() routes to local when local-only mode set', async () => {
    setRoutingMode('local-only');
    const gw = new Gateway();
    const response = await gw.ask({ requestId: 'smoke-27-1', prompt: 'local only test' });
    expect(response.provider).toBe('local');
  });

  it('gateway.ask() records routing decision with policy reason', async () => {
    setRoutingMode('local-only');
    const gw = new Gateway();
    await gw.ask({ requestId: 'smoke-27-2', prompt: 'policy reason test' });
    const history = getRoutingHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].reason).toContain('local');
  });

  it('gateway.ask() throws when all candidates blocked by policy', async () => {
    setRoutingMode('hybrid');
    ALL.forEach((p) => blockProvider(p));
    const gw = new Gateway();
    await expect(
      gw.ask({ requestId: 'smoke-27-3', prompt: 'no candidates' })
    ).rejects.toThrow();
  });
});

describe('Sprint 27 smoke tests — policy explainer', () => {
  beforeEach(() => {
    resetProviderPolicy();
  });

  it('explains local-only mode', () => {
    setRoutingMode('local-only');
    const reason = explainRoutingSelection({ requestId: 'r', prompt: 'p' }, 'local');
    expect(reason).toContain('local-only');
  });

  it('explains manual provider pinning', () => {
    setRoutingMode('hybrid');
    setManualProvider('local');
    const reason = explainRoutingSelection({ requestId: 'r', prompt: 'p' }, 'local');
    expect(reason).toContain('pinned');
  });
});

describe('Sprint 27 smoke tests — file existence', () => {
  it('provider-policy.ts exists', () => {
    expect(existsSync(join(process.cwd(), 'src/policies/provider-policy.ts'))).toBe(true);
  });

  it('provider-policy-handlers.cjs exists', () => {
    expect(existsSync(join(process.cwd(), 'electron-ui/ipc/provider-policy-handlers.cjs'))).toBe(true);
  });

  it('llm-policy CLI file exists', () => {
    expect(existsSync(join(process.cwd(), 'src/cli/llm-policy.ts'))).toBe(true);
  });

  it('dashboard references providerPolicy', () => {
    const { readFileSync } = require('fs');
    const html = loadDashboardSurface()
    expect(html).toContain('providerPolicy');
  });
});
