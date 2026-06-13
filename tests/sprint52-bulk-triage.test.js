import { describe, it, expect } from 'vitest';

describe('Sprint 52 — applyBulkTriage unit tests', () => {
  it('applyBulkTriage is exported from triage module', async () => {
    const mod = await import('../src/security/security-overview/triage.js');
    expect(typeof mod.applyBulkTriage).toBe('function');
  });

  it('applies same status to all valid fingerprints', async () => {
    const { applyBulkTriage } = await import(
      '../src/security/security-overview/triage.js'
    );
    const result = applyBulkTriage(
      [],
      ['fp-1', 'fp-2', 'fp-3'],
      'accepted',
      'bulk resolution',
      'tester',
      1000,
    );
    expect(result).toHaveLength(3);
    for (const entry of result) {
      expect(entry.status).toBe('accepted');
      expect(entry.reason).toBe('bulk resolution');
      expect(entry.updatedBy).toBe('tester');
      expect(entry.updatedAt).toBe(1000);
    }
  });

  it('skips null and undefined fingerprints', async () => {
    const { applyBulkTriage } = await import(
      '../src/security/security-overview/triage.js'
    );
    const result = applyBulkTriage(
      [],
      ['fp-valid', null, undefined],
      'resolved',
      undefined,
      undefined,
      1,
    );
    expect(result).toHaveLength(1);
    expect(result[0].fingerprint).toBe('fp-valid');
  });

  it('skips empty string fingerprints', async () => {
    const { applyBulkTriage } = await import(
      '../src/security/security-overview/triage.js'
    );
    const result = applyBulkTriage([], ['', '  ', 'fp-ok'], 'suppressed', undefined, undefined, 1);
    const fps = result.map((e) => e.fingerprint);
    expect(fps).toContain('fp-ok');
    expect(fps).not.toContain('');
    expect(fps).not.toContain('  ');
  });

  it('returns existing entries unchanged when fingerprints is empty', async () => {
    const { applyBulkTriage } = await import(
      '../src/security/security-overview/triage.js'
    );
    const existing = [{ fingerprint: 'fp-x', status: 'open', updatedAt: 1 }];
    const result = applyBulkTriage(existing, [], 'accepted', undefined, undefined, 2);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('open');
  });

  it('updates an existing entry when fingerprint already present', async () => {
    const { applyBulkTriage } = await import(
      '../src/security/security-overview/triage.js'
    );
    const existing = [
      { fingerprint: 'fp-a', status: 'open', updatedAt: 1 },
    ];
    const result = applyBulkTriage(
      existing, ['fp-a'], 'resolved', 'closing', 'reviewer', 2,
    );
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('resolved');
    expect(result[0].reason).toBe('closing');
    expect(result[0].updatedAt).toBe(2);
  });

  it('is idempotent — applying same status twice does not duplicate entries', async () => {
    const { applyBulkTriage } = await import(
      '../src/security/security-overview/triage.js'
    );
    let entries = [];
    entries = applyBulkTriage(entries, ['fp-1', 'fp-2'], 'accepted', 'round1', 'user', 1);
    entries = applyBulkTriage(entries, ['fp-1', 'fp-2'], 'accepted', 'round2', 'user', 2);
    const fps = entries.map((e) => e.fingerprint);
    const unique = new Set(fps);
    expect(unique.size).toBe(fps.length);
  });

  it('does not mutate the input entries array', async () => {
    const { applyBulkTriage } = await import(
      '../src/security/security-overview/triage.js'
    );
    const existing = [{ fingerprint: 'fp-original', status: 'open', updatedAt: 1 }];
    const copy = [...existing];
    applyBulkTriage(existing, ['fp-new'], 'resolved', undefined, undefined, 2);
    expect(existing).toHaveLength(copy.length);
    expect(existing[0].fingerprint).toBe('fp-original');
  });

  it('normalizes invalid status values to a valid status', async () => {
    const { applyBulkTriage } = await import(
      '../src/security/security-overview/triage.js'
    );
    const result = applyBulkTriage([], ['fp-1'], 'garbage_invalid_status', undefined, undefined, 1);
    expect(result).toHaveLength(1);
    expect(typeof result[0].status).toBe('string');
    expect(result[0].status.length).toBeGreaterThan(0);
  });

  it('cooperates with upsertSecurityTriageEntry for single-entry and bulk together', async () => {
    const { applyBulkTriage, upsertSecurityTriageEntry, getSecurityTriageStatus } =
      await import('../src/security/security-overview/triage.js');

    let entries = [];
    entries = upsertSecurityTriageEntry(entries, {
      fingerprint: 'solo', status: 'open', updatedAt: 1,
    });
    expect(getSecurityTriageStatus('solo', entries)).toBe('open');

    entries = applyBulkTriage(entries, ['solo', 'fp-new'], 'suppressed', 'batch', 'user', 2);
    expect(getSecurityTriageStatus('solo', entries)).toBe('suppressed');
    expect(getSecurityTriageStatus('fp-new', entries)).toBe('suppressed');
  });
});
