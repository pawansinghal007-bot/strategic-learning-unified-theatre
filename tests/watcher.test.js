import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { WatcherDaemon } from '../src/daemon/watcher.js';

function makeStubs() {
  return {
    store: {
      list: async () => [],
      update: async () => {}
    },
    switcher: { switch: async () => {} },
    scheduler: { load: async () => {}, clearExpired: async () => [], setCooldown: async (_, d) => Date.now() + d },
    journal: { append: async () => {} },
    gitMonitor: { stop: () => {}, watchAll: () => {}, removeAllListeners: () => {}, on: () => {} },
    probeAccount: async () => ({ valid: true })
  };
}

describe('enhanceSchedule daemon hook', () => {
  let originalHome;
  let originalLogLevel;
  let originalLogSink;
  beforeEach(() => {
    originalHome = process.env.HOME;
    originalLogLevel = process.env.ROTATOR_LOG_LEVEL;
    originalLogSink = process.env.ROTATOR_LOG_SINK;
    process.env.ROTATOR_LOG_LEVEL = 'info';
    process.env.ROTATOR_LOG_SINK = 'stdout';
  });
  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalLogLevel === undefined) {
      delete process.env.ROTATOR_LOG_LEVEL;
    } else {
      process.env.ROTATOR_LOG_LEVEL = originalLogLevel;
    }
    if (originalLogSink === undefined) {
      delete process.env.ROTATOR_LOG_SINK;
    } else {
      process.env.ROTATOR_LOG_SINK = originalLogSink;
    }
    try { vi.useRealTimers(); } catch {}
  });

  it('does not create enhanceTimer when enhanceSchedule is null', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rotator-test-'));
    process.env.HOME = tmp;

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    await daemon.start(10);
    expect(daemon.enhanceTimer == null).toBeTruthy();
    // advance timers to ensure nothing fires
    vi.useFakeTimers();
    vi.advanceTimersByTime(60000);
    await daemon.stop();
  });

  it('does not create enhanceTimer when enabled is false', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rotator-test-'));
    process.env.HOME = tmp;
    // write config with enhanceSchedule.enabled = false
    const cfg = { enhanceSchedule: { enabled: false, intervalMs: 50, goals: ['g'] } };
    await fs.mkdir(path.join(process.env.HOME, '.vscode-rotator'), { recursive: true });
    await fs.writeFile(path.join(process.env.HOME, '.vscode-rotator', 'config.json'), JSON.stringify(cfg));

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    // stub _spawnEnhance so if accidentally called we can detect
    daemon._spawnEnhance = vi.fn();
    await daemon.start(10);
    vi.useFakeTimers();
    vi.advanceTimersByTime(60000);
    expect(daemon._spawnEnhance).not.toHaveBeenCalled();
    expect(daemon.enhanceTimer == null).toBeTruthy();
    await daemon.stop();
  });

  it('emits enhance_cycle for each goal when poll tick fires', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rotator-test-'));
    process.env.HOME = tmp;
    const cfg = { enhanceSchedule: { enabled: true, intervalMs: 50, goals: ['goal-a', 'goal-b'], platform: 'chatgpt' } };
    await fs.mkdir(path.join(process.env.HOME, '.vscode-rotator'), { recursive: true });
    await fs.writeFile(path.join(process.env.HOME, '.vscode-rotator', 'config.json'), JSON.stringify(cfg));

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    daemon._spawnEnhance = vi.fn().mockResolvedValue(undefined);

    const events = [];
    daemon.on('enhance_cycle', (e) => events.push(e));

    vi.useFakeTimers();
    await daemon.start(10);
    vi.advanceTimersByTime(60000);
    // allow any pending promises to resolve
    await Promise.resolve();

    expect(daemon._spawnEnhance).toHaveBeenCalledTimes(2);
    expect(daemon._spawnEnhance).toHaveBeenCalledWith('goal-a', 'chatgpt');
    expect(daemon._spawnEnhance).toHaveBeenCalledWith('goal-b', 'chatgpt');
    expect(events.length).toBe(2);
    for (const ev of events) {
      expect(typeof ev.goal).toBe('string');
      expect(typeof ev.platform).toBe('string');
      expect(typeof ev.timestamp).toBe('string');
    }

    await daemon.stop();
    vi.useRealTimers();
  });

  it('does not re-trigger within intervalMs window (thrash guard)', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rotator-test-'));
    process.env.HOME = tmp;
    const cfg = { enhanceSchedule: { enabled: true, intervalMs: 604800000, goals: ['goal-x'] } };
    await fs.mkdir(path.join(process.env.HOME, '.vscode-rotator'), { recursive: true });
    await fs.writeFile(path.join(process.env.HOME, '.vscode-rotator', 'config.json'), JSON.stringify(cfg));

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    daemon._spawnEnhance = vi.fn().mockResolvedValue(undefined);

    vi.useFakeTimers();
    await daemon.start(10);
    vi.advanceTimersByTime(60000); // first poll
    await Promise.resolve();
    vi.advanceTimersByTime(60000); // second poll within big interval
    await Promise.resolve();

    expect(daemon._spawnEnhance).toHaveBeenCalledTimes(1);
    await daemon.stop();
    vi.useRealTimers();
  });

  it('clears enhanceTimer on stop()', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rotator-test-'));
    process.env.HOME = tmp;
    const cfg = { enhanceSchedule: { enabled: true, intervalMs: 604800000, goals: ['g'] } };
    await fs.mkdir(path.join(process.env.HOME, '.vscode-rotator'), { recursive: true });
    await fs.writeFile(path.join(process.env.HOME, '.vscode-rotator', 'config.json'), JSON.stringify(cfg));

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    daemon._spawnEnhance = vi.fn().mockResolvedValue(undefined);
    await daemon.start(10);
    expect(daemon.enhanceTimer != null).toBeTruthy();
    await daemon.stop();
    expect(daemon.enhanceTimer == null).toBeTruthy();
  });

  it('emits structured rotation logs while preserving switch behavior', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rotator-test-'));
    process.env.HOME = tmp;

    const accounts = [
      {
        id: 'acct-current',
        status: 'active',
        lastUsed: new Date(Date.now() + 10),
        cooldownUntil: null
      },
      {
        id: 'acct-next',
        status: 'active',
        lastUsed: null,
        cooldownUntil: null
      }
    ];

    const s = makeStubs();
    s.store.list = async () => accounts;
    s.store.update = vi.fn(async () => {});
    s.switcher.switch = vi.fn(async () => ({ ok: true }));
    s.probeAccount = vi.fn(async (acct) => (
      acct.id === 'acct-current'
        ? { valid: false, remainingRequests: 0, resetAt: new Date(Date.now() + 1000), error: 'quota exhausted' }
        : { valid: true, remainingRequests: 100, resetAt: null, error: null }
    ));

    const output = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((line) => {
      output.push(String(line));
      return true;
    });

    try {
      const daemon = new WatcherDaemon(s);
      await daemon.start(1000);
      await daemon.stop();
    } finally {
      writeSpy.mockRestore();
    }

    expect(s.switcher.switch).toHaveBeenCalledWith('acct-next', { dryRun: false });
    const entries = output.map((line) => JSON.parse(line));
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'info',
          module: 'watcher',
          msg: 'rotation.start',
          correlationId: 'acct-current',
          reason: 'quota exhausted',
          action: 'cooldown'
        }),
        expect.objectContaining({
          level: 'info',
          module: 'watcher',
          msg: 'rotation.success',
          correlationId: 'acct-current',
          reason: 'quota exhausted',
          action: 'switch',
          targetAccountId: 'acct-next'
        })
      ])
    );
  });
});
