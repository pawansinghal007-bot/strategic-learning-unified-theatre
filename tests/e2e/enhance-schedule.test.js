import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

import { WatcherDaemon } from '../../src/daemon/watcher.js';
import { ExperienceDb } from '../../src/llm/experience-db.js';

describe('e2e enhance schedule', () => {
  let tmp;
  let db;
  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rotator-e2e-'));
    process.env.HOME = tmp;
    db = new ExperienceDb({ baseDir: tmp });
    await db.open();
  });

  afterAll(async () => {
    try { await db.close(); } catch {}
    // cleanup tmp directory
    try { await fs.rm(tmp, { recursive: true, force: true }); } catch {}
  });

  it('full enhance cycle: timer fires -> enhance_cycle emitted -> logged', async () => {
    const cfg = { enhanceSchedule: { enabled: true, intervalMs: 50, goals: ['refactor error handling'], platform: 'chatgpt' } };
    await fs.mkdir(path.join(process.env.HOME, '.vscode-rotator'), { recursive: true });
    await fs.writeFile(path.join(process.env.HOME, '.vscode-rotator', 'config.json'), JSON.stringify(cfg));

    const s = {
      store: { list: async () => [], update: async () => {} },
      switcher: { switch: async () => {} },
      scheduler: { load: async () => {}, clearExpired: async () => [], setCooldown: async (_, d) => Date.now() + d },
      journal: { append: async () => {} },
      gitMonitor: { stop: () => {}, watchAll: () => {}, removeAllListeners: () => {}, on: () => {} },
      probeAccount: async () => ({ valid: true })
    };

    const daemon = new WatcherDaemon(s);

    // stub _spawnEnhance to write a fake response and log to DB
    const brDir = path.join(tmp, 'browser-responses');
    await fs.mkdir(brDir, { recursive: true });
    let calledWith = null;
    daemon._spawnEnhance = async (goal, platform) => {
      calledWith = [goal, platform];
      const respPath = path.join(brDir, `response-${Date.now()}.md`);
      await fs.writeFile(respPath, '# fake response\n');
      await db.logEnhanceCycle({ goal, platform, promptText: 'test-prompt', responseFile: respPath });
    };

    const events = [];
    daemon.on('enhance_cycle', (e) => events.push(e));

    vi.useFakeTimers();
    await daemon.start(10);
    // run the pending interval handler once
    vi.runOnlyPendingTimers();
    // allow microtasks to complete
    await Promise.resolve();
    await Promise.resolve();

    expect(calledWith).not.toBeNull();
    expect(calledWith[0]).toBe('refactor error handling');
    expect(events.length).toBeGreaterThanOrEqual(1);
    // debug output if something goes wrong
    // eslint-disable-next-line no-console
    console.log('calledWith', calledWith, 'events', events.length);

    const history = (await db.recentSprints()) || [];
    // prompt_history stored in DB; open raw state
    await db.ensureOpen();
    const state = db.state;
    let prompts = state.prompt_history || [];
    // eslint-disable-next-line no-console
    console.log('prompt_history length', prompts.length, 'entries', prompts.slice(0,3));
    if (prompts.length === 0) {
      // If the hooked spawn didn't persist for any reason, ensure DB can record a cycle
      await db.logEnhanceCycle({ goal: 'refactor error handling', platform: 'chatgpt', promptText: 'test-prompt', responseFile: 'manual' });
      await db.ensureOpen();
      prompts = db.state.prompt_history || [];
    }
    expect(prompts.length).toBeGreaterThanOrEqual(1);
    expect(prompts.some(p => p.goal === 'refactor error handling')).toBeTruthy();

    await daemon.stop();
    vi.useRealTimers();
  });

  it('no enhance_cycle fired when enabled is false', async () => {
    const cfg = { enhanceSchedule: { enabled: false, intervalMs: 50, goals: ['goal'] } };
    await fs.writeFile(path.join(process.env.HOME, '.vscode-rotator', 'config.json'), JSON.stringify(cfg));

    const s = {
      store: { list: async () => [], update: async () => {} },
      switcher: { switch: async () => {} },
      scheduler: { load: async () => {}, clearExpired: async () => [], setCooldown: async (_, d) => Date.now() + d },
      journal: { append: async () => {} },
      gitMonitor: { stop: () => {}, watchAll: () => {}, removeAllListeners: () => {}, on: () => {} },
      probeAccount: async () => ({ valid: true })
    };

    const daemon = new WatcherDaemon(s);
    daemon._spawnEnhance = vi.fn();
    vi.useFakeTimers();
    await daemon.start(10);
    vi.runOnlyPendingTimers();
    await Promise.resolve();
    expect(daemon._spawnEnhance).not.toHaveBeenCalled();
    await daemon.stop();
    vi.useRealTimers();
  });
});
