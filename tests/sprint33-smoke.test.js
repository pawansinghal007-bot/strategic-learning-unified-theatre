import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  recordRoutingDecision,
  getRoutingHistory,
  resetRoutingHistory,
  listRoutingHistoryForWorkspace,
  getWorkspaceTimeBuckets,
  getGlobalWorkspaceAnalytics,
  exportWorkspaceAnalyticsJson,
  exportWorkspaceAnalyticsCsv,
} from '../src/llm/routing-history.js';

const WS_A = 'sprint33-ws-a';
const WS_B = 'sprint33-ws-b';

function fakeRequest(workspaceId, requestId) {
  return { requestId, workspaceId, prompt: 'test' };
}

describe('Sprint 33 smoke tests — time buckets', () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it('getWorkspaceTimeBuckets returns empty array for workspace with no history', () => {
    const rows = getWorkspaceTimeBuckets('nonexistent-ws', 'day');
    expect(rows).toEqual([]);
  });

  it('getWorkspaceTimeBuckets returns at least one bucket after recording', () => {
    recordRoutingDecision({
      request: fakeRequest(WS_A, 'r1'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'test',
      latencyMs: 100,
    });
    const rows = getWorkspaceTimeBuckets(WS_A, 'day');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('daily bucket successRate is 100 when all succeeded', () => {
    recordRoutingDecision({
      request: fakeRequest(WS_A, 'r2'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'test',
      latencyMs: 50,
    });
    const rows = getWorkspaceTimeBuckets(WS_A, 'day');
    expect(rows[0].successRate).toBe(100);
    expect(rows[0].failureCount).toBe(0);
  });

  it('daily bucket failureCount increments for failures', () => {
    recordRoutingDecision({
      request: fakeRequest(WS_A, 'r3'),
      provider: 'local',
      model: 'm',
      success: false,
      reason: 'test error',
      errorMessage: 'timeout',
    });
    const rows = getWorkspaceTimeBuckets(WS_A, 'day');
    expect(rows[0].failureCount).toBe(1);
    expect(rows[0].successCount).toBe(0);
  });

  it('bucket point includes required fields', () => {
    recordRoutingDecision({
      request: fakeRequest(WS_A, 'r4'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'ok',
    });
    const rows = getWorkspaceTimeBuckets(WS_A, 'day');
    const row = rows[0];
    expect(typeof row.bucket).toBe('string');
    expect(typeof row.total).toBe('number');
    expect(typeof row.successCount).toBe('number');
    expect(typeof row.failureCount).toBe('number');
    expect(typeof row.successRate).toBe('number');
    expect(typeof row.avgLatencyMs).toBe('number');
  });
});

describe('Sprint 33 smoke tests — global analytics', () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it('getGlobalWorkspaceAnalytics returns empty array when no history', () => {
    const rows = getGlobalWorkspaceAnalytics();
    expect(rows).toEqual([]);
  });

  it('getGlobalWorkspaceAnalytics returns one entry per workspace', () => {
    recordRoutingDecision({
      request: fakeRequest(WS_A, 'g1'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'ok',
      latencyMs: 120,
    });
    recordRoutingDecision({
      request: fakeRequest(WS_B, 'g2'),
      provider: 'local',
      model: 'm',
      success: false,
      reason: 'failed',
      errorMessage: 'timeout',
    });
    const rows = getGlobalWorkspaceAnalytics();
    const ids = rows.map((r) => r.workspaceId);
    expect(ids).toContain(WS_A);
    expect(ids).toContain(WS_B);
  });

  it('global analytics point includes required fields', () => {
    recordRoutingDecision({
      request: fakeRequest(WS_A, 'g3'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'ok',
    });
    const rows = getGlobalWorkspaceAnalytics();
    const row = rows[0];
    expect(typeof row.workspaceId).toBe('string');
    expect(typeof row.total).toBe('number');
    expect(typeof row.successRate).toBe('number');
    expect(typeof row.errorRate).toBe('number');
    expect(typeof row.avgLatencyMs).toBe('number');
  });

  it('global analytics sorted by total descending', () => {
    recordRoutingDecision({
      request: fakeRequest(WS_A, 'g4'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'ok',
    });
    recordRoutingDecision({
      request: fakeRequest(WS_B, 'g5'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'ok',
    });
    recordRoutingDecision({
      request: fakeRequest(WS_B, 'g6'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'ok',
    });
    const rows = getGlobalWorkspaceAnalytics();
    expect(rows[0].total).toBeGreaterThanOrEqual(rows[1].total);
  });
});

describe('Sprint 33 smoke tests — export helpers', () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it('exportWorkspaceAnalyticsJson returns valid JSON with workspaceId', () => {
    recordRoutingDecision({
      request: fakeRequest(WS_A, 'e1'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'ok',
    });
    const text = exportWorkspaceAnalyticsJson(WS_A);
    const parsed = JSON.parse(text);
    expect(parsed.workspaceId).toBe(WS_A);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.analytics).toBeTruthy();
  });

  it('exportWorkspaceAnalyticsCsv returns string with CSV header', () => {
    recordRoutingDecision({
      request: fakeRequest(WS_A, 'e2'),
      provider: 'local',
      model: 'm',
      success: true,
      reason: 'ok',
    });
    const text = exportWorkspaceAnalyticsCsv(WS_A);
    expect(text).toContain('bucket,total,successCount,failureCount,successRate,avgLatencyMs');
  });

  it('exportWorkspaceAnalyticsCsv returns header only for empty workspace', () => {
    const text = exportWorkspaceAnalyticsCsv('empty-ws');
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('bucket');
  });
});

describe('Sprint 33 smoke tests — IPC and surface files', () => {
  it('workspace-routing-handlers.cjs contains all Sprint 33 channels', () => {
    const content = readFileSync(
      join(process.cwd(), 'electron-ui/ipc/workspace-routing-handlers.cjs'),
      'utf-8',
    );
    expect(content).toContain('workspaceRouting:buckets');
    expect(content).toContain('workspaceRouting:globalAnalytics');
    expect(content).toContain('workspaceRouting:exportJson');
    expect(content).toContain('workspaceRouting:exportCsv');
  });

  it('preload.cjs exposes Sprint 33 workspaceRouting methods', () => {
    const content = readFileSync(join(process.cwd(), 'electron-ui/preload.cjs'), 'utf-8');
    expect(content).toContain('workspaceRouting:buckets');
    expect(content).toContain('workspaceRouting:globalAnalytics');
    expect(content).toContain('workspaceRouting:exportJson');
    expect(content).toContain('workspaceRouting:exportCsv');
  });

  it('dashboard contains Time Buckets panel', () => {
    const html = readFileSync(join(process.cwd(), 'src/ui/provider-dashboard.html'), 'utf-8');
    expect(html).toContain('Time Buckets');
    expect(html).toContain('Global Analytics');
    expect(html).toContain('workspaceRouting.buckets');
    expect(html).toContain('workspaceRouting.globalAnalytics');
  });

  it('dashboard preserves Sprint 32 compatibility strings', () => {
    const html = readFileSync(join(process.cwd(), 'src/ui/provider-dashboard.html'), 'utf-8');
    expect(html).toContain('Workspace Analytics');
    expect(html).toContain('Provider Trends');
    expect(html).toContain('Decision Timeline');
    expect(html).toContain('workspaceRouting.analytics');
  });

  it('routing-history.ts exports bucket and global functions', () => {
    const content = readFileSync(join(process.cwd(), 'src/llm/routing-history.ts'), 'utf-8');
    expect(content).toContain('getWorkspaceTimeBuckets');
    expect(content).toContain('getGlobalWorkspaceAnalytics');
    expect(content).toContain('exportWorkspaceAnalyticsJson');
    expect(content).toContain('exportWorkspaceAnalyticsCsv');
    expect(existsSync(join(process.cwd(), 'src/llm/routing-history.ts'))).toBe(true);
  });
});
