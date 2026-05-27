import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempDir: string;
let healthStatePath: string;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'health-state-test-'));
  healthStatePath = path.join(tempDir, 'health-state.json');
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function readHealthState(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      lastKnownGoodVersion: typeof parsed.lastKnownGoodVersion === 'string' ? parsed.lastKnownGoodVersion : undefined,
      pendingVersion: typeof parsed.pendingVersion === 'string' ? parsed.pendingVersion : undefined,
      rollbackRequested: parsed.rollbackRequested === true,
    };
  } catch {
    return {};
  }
}

function writeHealthState(filePath: string, state: Record<string, unknown>) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

function markPendingVersion(filePath: string, current: string, next: string) {
  const state = readHealthState(filePath);
  const nextState = {
    lastKnownGoodVersion: state.lastKnownGoodVersion || current,
    pendingVersion: next,
  };
  writeHealthState(filePath, nextState);
}

function clearPendingVersionAsGood(filePath: string, current: string) {
  const state = readHealthState(filePath);
  const nextState: Record<string, unknown> = {
    lastKnownGoodVersion: current,
  };
  if (state.rollbackRequested) {
    nextState.rollbackRequested = true;
  }
  writeHealthState(filePath, nextState);
}

function markRollbackRequested(filePath: string) {
  const state = readHealthState(filePath);
  const nextState: Record<string, unknown> = {
    lastKnownGoodVersion: state.lastKnownGoodVersion,
    rollbackRequested: true,
  };
  writeHealthState(filePath, nextState);
}

describe('health-state persistence', () => {
  it('returns {} when the health state file does not exist', () => {
    expect(readHealthState(healthStatePath)).toEqual({});
  });

  it('round-trips lastKnownGoodVersion through write and read', () => {
    writeHealthState(healthStatePath, { lastKnownGoodVersion: '1.0.0' });
    expect(readHealthState(healthStatePath)).toEqual({ lastKnownGoodVersion: '1.0.0', pendingVersion: undefined, rollbackRequested: false });
  });

  it('markPendingVersion sets lastKnownGoodVersion and pendingVersion', () => {
    markPendingVersion(healthStatePath, '1.0.0', '1.0.1');
    expect(readHealthState(healthStatePath)).toEqual({ lastKnownGoodVersion: '1.0.0', pendingVersion: '1.0.1', rollbackRequested: false });
  });

  it('clearPendingVersionAsGood clears pendingVersion and updates lastKnownGoodVersion', () => {
    writeHealthState(healthStatePath, { lastKnownGoodVersion: '1.0.0', pendingVersion: '1.0.1' });
    clearPendingVersionAsGood(healthStatePath, '1.0.1');
    expect(readHealthState(healthStatePath)).toEqual({ lastKnownGoodVersion: '1.0.1', pendingVersion: undefined, rollbackRequested: false });
  });

  it('markRollbackRequested clears pendingVersion', () => {
    writeHealthState(healthStatePath, { lastKnownGoodVersion: '1.0.0', pendingVersion: '1.0.1' });
    markRollbackRequested(healthStatePath);
    expect(readHealthState(healthStatePath)).toEqual({ lastKnownGoodVersion: '1.0.0', pendingVersion: undefined, rollbackRequested: true });
  });
});
