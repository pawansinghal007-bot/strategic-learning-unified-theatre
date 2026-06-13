import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Sprint 52 smoke tests — bulk triage surface', () => {
  it('triage.ts exports applyBulkTriage', async () => {
    const mod = await import('../src/security/security-overview/triage.js');
    expect(typeof mod.applyBulkTriage).toBe('function');
  });

  it('TRIAGE_STATUSES is exported and contains expected values', async () => {
    const mod = await import('../src/security/security-overview/triage.js');
    expect(Array.isArray(mod.TRIAGE_STATUSES)).toBe(true);
    expect(mod.TRIAGE_STATUSES).toContain('open');
    expect(mod.TRIAGE_STATUSES).toContain('suppressed');
    expect(mod.TRIAGE_STATUSES).toContain('accepted');
    expect(mod.TRIAGE_STATUSES).toContain('resolved');
  });

  it('IPC handler registers security-overview:set-triage-bulk', () => {
    const content = read('electron-ui/ipc/security-overview-handlers.cjs');
    expect(content).toContain('security-overview:set-triage-bulk');
    expect(content).toContain('applyBulkTriage');
  });

  it('IPC handler preserves all Sprint 46-51 channels', () => {
    const content = read('electron-ui/ipc/security-overview-handlers.cjs');
    const channels = [
      'security-overview:summarize',
      'security-overview:save-baseline',
      'security-overview:load-suppressions',
      'security-overview:save-suppressions',
      'security-overview:load-triage',
      'security-overview:set-triage',
      'security-overview:compare-baseline',
      'security-overview:explain-introduced',
      'security-overview:get-drift-classification',
    ];
    for (const ch of channels) {
      expect(content).toContain(ch);
    }
  });

  it('preload exposes setTriageBulk on workspaceSecurity', () => {
    const content = read('electron-ui/preload.cjs');
    expect(content).toContain('setTriageBulk');
    expect(content).toContain('security-overview:set-triage-bulk');
  });

  it('preload preserves Sprint 46-51 workspaceSecurity methods', () => {
    const content = read('electron-ui/preload.cjs');
    const methods = [
      'summarize', 'saveBaseline', 'loadSuppressions', 'saveSuppressions',
      'loadTriage', 'setTriage', 'compareBaseline',
      'explainIntroduced', 'getDriftClassification',
    ];
    for (const m of methods) {
      expect(content).toContain(m);
    }
  });

  it('types.d.ts declares setTriageBulk on workspaceSecurity', () => {
    const content = read('src/ui/types.d.ts');
    expect(content).toContain('setTriageBulk:');
  });

  it('types.d.ts has exactly one Window interface', () => {
    const content = read('src/ui/types.d.ts');
    const count = (content.match(/interface Window/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('master_timeline_sprints_1_54.md reflects Sprint 52 as active', () => {
    const content = read('master_timeline_sprints_1_54.md');
    expect(content).toContain('Sprint 52');
    expect(content).toContain('Sprint 51');
  });

  it('dashboard is unchanged — Sprint 44-51 surfaces still present', () => {
    const html = read('src/ui/provider-dashboard.html');
    expect(html).toContain('security-overview-panel');
    expect(html).toContain('security-drift-panel');
    expect(html).toContain('Workspace Analytics');
    expect(html).toContain('Audit Trail');
    expect(html).toContain('workspaceRouting.analytics');
  });

  it('security-overview index.ts still exports all 7 modules', () => {
    const content = read('src/security/security-overview/index.ts');
    const modules = [
      './schema', './baseline', './suppressions',
      './normalizer', './triage', './drift', './ai-explain',
    ];
    for (const m of modules) {
      expect(content).toContain(m);
    }
  });
});
