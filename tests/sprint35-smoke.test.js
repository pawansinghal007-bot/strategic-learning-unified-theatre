import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  recordRoutingDecision,
  resetRoutingHistory,
  listRoutingHistoryForWorkspace,
  getWorkspaceRoutingSummary,
  getWorkspaceProviderTrends,
  getGlobalWorkspaceAnalytics,
  getProviderComparisonAcrossWorkspaces,
  exportWorkspaceAnalyticsJson,
  exportWorkspaceAnalyticsCsv,
} from '../src/llm/routing-history.js';

const WS = 'sprint35-ws';

function req(id, provider, workspaceId) {
  return { requestId: id, workspaceId: workspaceId || WS, prompt: 'test' };
}

describe('Sprint 35 smoke tests — filter by provider', () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it('listRoutingHistoryForWorkspace filters by provider', () => {
    recordRoutingDecision({
      request: req('r1', 'openai'),
      provider: 'openai',
      model: 'm',
      success: true,
      reason: 'ok',
      latencyMs: 100,
    });
    recordRoutingDecision({
      request: req('r2', 'groq'),
      provider: 'groq',
      model: 'm',
      success: true,
      reason: 'fast',
      latencyMs: 50,
    });

    const openaiOnly = listRoutingHistoryForWorkspace(WS, 50, {
      provider: 'openai',
    });
    expect(openaiOnly).toHaveLength(1);
    expect(openaiOnly[0].provider).toBe('openai');
  });

  it('getWorkspaceRoutingSummary filters by provider', () => {
    recordRoutingDecision({
      request: req('r3', 'openai'),
      provider: 'openai',
      model: 'm',
      success: true,
      reason: 'ok',
    });
    recordRoutingDecision({
      request: req('r4', 'groq'),
      provider: 'groq',
      model: 'm',
      success: false,
      reason: 'fail',
    });

    const summary = getWorkspaceRoutingSummary(WS, { provider: 'openai' });
    expect(summary.total).toBe(1);
    expect(summary.providerCounts.openai).toBe(1);
  });

  it('getWorkspaceProviderTrends filters by provider', () => {
    recordRoutingDecision({
      request: req('r5', 'local'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'private',
    });
    recordRoutingDecision({
      request: req('r6', 'openai'),
      provider: 'openai',
      model: 'm',
      success: true,
      reason: 'ok',
    });

    const trends = getWorkspaceProviderTrends(WS, { provider: 'local' });
    expect(trends).toHaveLength(1);
    expect(trends[0].provider).toBe('local');
  });
});

describe('Sprint 35 smoke tests — filter by time range', () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it('listRoutingHistoryForWorkspace filters by startTime', () => {
    const now = Date.now();
    recordRoutingDecision({
      request: req('t1', 'local'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'ok',
    });

    const after = listRoutingHistoryForWorkspace(WS, 50, {
      startTime: now + 60000,
    });
    expect(after).toHaveLength(0);

    const before = listRoutingHistoryForWorkspace(WS, 50, {
      startTime: now - 60000,
    });
    expect(before).toHaveLength(1);
  });

  it('listRoutingHistoryForWorkspace filters by endTime', () => {
    const now = Date.now();
    recordRoutingDecision({
      request: req('t2', 'local'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'ok',
    });

    const before = listRoutingHistoryForWorkspace(WS, 50, {
      endTime: now - 60000,
    });
    expect(before).toHaveLength(0);

    const after = listRoutingHistoryForWorkspace(WS, 50, {
      endTime: now + 60000,
    });
    expect(after).toHaveLength(1);
  });
});

describe('Sprint 35 smoke tests — global and comparison with filter', () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it('getGlobalWorkspaceAnalytics filters by provider', () => {
    recordRoutingDecision({
      request: req('g1', 'openai', 'ws-a'),
      provider: 'openai',
      model: 'm',
      success: true,
      reason: 'ok',
    });
    recordRoutingDecision({
      request: req('g2', 'groq', 'ws-b'),
      provider: 'groq',
      model: 'm',
      success: true,
      reason: 'fast',
    });

    const rows = getGlobalWorkspaceAnalytics({ provider: 'openai' });
    const ids = rows.map((r) => r.workspaceId);
    expect(ids).toContain('ws-a');
    expect(ids).not.toContain('ws-b');
  });

  it('getProviderComparisonAcrossWorkspaces filters by provider', () => {
    recordRoutingDecision({
      request: req('c1', 'openai', 'ws-x'),
      provider: 'openai',
      model: 'm',
      success: true,
      reason: 'ok',
    });
    recordRoutingDecision({
      request: req('c2', 'gemini', 'ws-y'),
      provider: 'gemini',
      model: 'm',
      success: true,
      reason: 'ok',
    });

    const rows = getProviderComparisonAcrossWorkspaces({ provider: 'openai' });
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('openai');
  });
});

describe('Sprint 35 smoke tests — export with filter', () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it('exportWorkspaceAnalyticsJson includes filter in output', () => {
    recordRoutingDecision({
      request: req('e1', 'local'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'private',
    });

    const text = exportWorkspaceAnalyticsJson(WS, { provider: 'local' });
    const parsed = JSON.parse(text);
    expect(parsed.filter.provider).toBe('local');
    expect(parsed.analytics.summary.total).toBe(1);
  });

  it('exportWorkspaceAnalyticsCsv returns header for filtered empty result', () => {
    const text = exportWorkspaceAnalyticsCsv(WS, { provider: 'nonexistent' });
    const lines = text.trim().split('\n');
    expect(lines[0]).toContain('bucket');
    expect(lines).toHaveLength(1);
  });
});

describe('Sprint 35 smoke tests — file existence and surface', () => {
  it('workspace-report-handlers.cjs exists', () => {
    expect(
      existsSync(
        join(process.cwd(), 'electron-ui/ipc/workspace-report-handlers.cjs'),
      ),
    ).toBe(true);
  });

  it('workspace-report-handlers.cjs contains workspaceReport:save', () => {
    const content = readFileSync(
      join(process.cwd(), 'electron-ui/ipc/workspace-report-handlers.cjs'),
      'utf-8',
    );
    expect(content).toContain('workspaceReport:save');
    expect(content).toContain('showSaveDialog');
  });

  it('preload.cjs exposes workspaceReport namespace', () => {
    const content = readFileSync(
      join(process.cwd(), 'electron-ui/preload.cjs'),
      'utf-8',
    );
    expect(content).toContain('workspaceReport');
    expect(content).toContain('workspaceReport:save');
  });

  it('preload.cjs workspaceRouting methods accept filter', () => {
    const content = readFileSync(
      join(process.cwd(), 'electron-ui/preload.cjs'),
      'utf-8',
    );
    expect(content).toContain('workspaceRouting:analytics", workspaceId, filter');
  });

  it('dashboard includes filter controls and save buttons', () => {
    const html = readFileSync(
      join(process.cwd(), 'src/ui/provider-dashboard.html'),
      'utf-8',
    );
    expect(html).toContain('filter-provider');
    expect(html).toContain('filter-start');
    expect(html).toContain('filter-end');
    expect(html).toContain('save-json-report');
    expect(html).toContain('save-html-report');
    expect(html).toContain('workspaceReport.save');
  });

  it('dashboard preserves Sprint 25–34 compatibility strings', () => {
    const html = readFileSync(
      join(process.cwd(), 'src/ui/provider-dashboard.html'),
      'utf-8',
    );
    expect(html).toContain('Workspace Analytics');
    expect(html).toContain('Provider Trends');
    expect(html).toContain('Decision Timeline');
    expect(html).toContain('metric-success-rate');
    expect(html).toContain('metric-error-rate');
    expect(html).toContain('metric-latency');
    expect(html).toContain('workspaceRouting.analytics');
  });

  it('routing-history.ts exports RoutingHistoryFilter', () => {
    const content = readFileSync(
      join(process.cwd(), 'src/llm/routing-history.ts'),
      'utf-8',
    );
    expect(content).toContain('RoutingHistoryFilter');
    expect(content).toContain('matchesFilter');
  });
});
