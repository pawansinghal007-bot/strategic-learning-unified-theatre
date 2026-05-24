// tests/auto-handoff.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { redact } from '../src/utils/redactor.js';

// ---------------------------------------------------------------------------
// Redactor unit tests
// These run without any file I/O and validate the core scrubbing logic.
// ---------------------------------------------------------------------------

describe('redact()', () => {
  it('removes Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig';

    const result = redact(input);

    expect(result).not.toMatch(/eyJhbGciOiJIUzI1NiJ9/);
    expect(result).toContain('Bearer [REDACTED]');
  });

  it('removes sk- prefixed API keys', () => {
    const input = 'key=sk-1234567890abcdef1234567890';

    const result = redact(input);

    expect(result).not.toContain('sk-1234567890');
    expect(result).toContain('sk-[REDACTED]');
  });

  it('removes generic secret assignments', () => {
    const cases = [
      'password: hunter2',
      "token='ghp_abc123def456ghi789'",
      'api_key=AKIA1234567890EXAMPLE',
    ];

    for (const c of cases) {
      const result = redact(c);

      expect(result).toContain('[REDACTED]');

      // Avoid empty-string edge cases caused by trailing quotes.
      const parts = c.split(/[=:'"]+/).filter(Boolean);
      const value = parts[parts.length - 1];

      if (value) {
        expect(result).not.toContain(value);
      }
    }
  });

  it('returns empty string for falsy input', () => {
    expect(redact('')).toBe('');
    expect(redact(null)).toBe('');
    expect(redact(undefined)).toBe('');
  });

  it('leaves benign text untouched', () => {
    const safe =
      'Continuing from auto-pause. Previous task: fetch user profile.';

    expect(redact(safe)).toBe(safe);
  });
});

// ---------------------------------------------------------------------------
// generateAutoHandoff integration tests
// ---------------------------------------------------------------------------

describe('generateAutoHandoff()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('passes redacted content to createHandoff and sets is_auto metadata', async () => {
    const mockCreateHandoff = vi
      .fn()
      .mockResolvedValue('/tmp/handoff.json');

    vi.doMock('../src/agent-handoff.js', () => ({
      createHandoff: mockCreateHandoff,
    }));

    const { generateAutoHandoff } = await import(
      '../src/auto-handoff.js'
    );

    const rawTask =
      'Using Bearer sk-abc123def456ghi789jkl012 to call the API';

    const resetTime = Date.now() + 3_600_000;

    const context = {
      currentTask: rawTask,
      currentGoal: 'Fetch user data',
      provider: 'openai',
      model: 'gpt-4o',
    };

    const result = await generateAutoHandoff(context, resetTime);

    expect(typeof result).toBe('string');
    expect(result).toContain('/tmp/handoff');

    expect(mockCreateHandoff).toHaveBeenCalledOnce();

    const passedPayload = mockCreateHandoff.mock.calls[0][0];

    expect(passedPayload.is_auto).toBe(true);
    expect(passedPayload.resume_target_time).toBe(resetTime);

    const payloadString = JSON.stringify(passedPayload);

    expect(payloadString).not.toContain(
      'sk-abc123def456ghi789jkl012'
    );

    expect(payloadString).not.toContain('Bearer sk-');

    expect(passedPayload.currentTask).toContain('[REDACTED]');
  });

  it('continuation_prompt does not contain raw secrets', async () => {
    const mockCreateHandoff = vi
      .fn()
      .mockResolvedValue('/tmp/handoff.json');

    vi.doMock('../src/agent-handoff.js', () => ({
      createHandoff: mockCreateHandoff,
    }));

    const { generateAutoHandoff } = await import(
      '../src/auto-handoff.js'
    );

    const context = {
      currentTask: 'password=SuperSecret99 must not leak',
      provider: 'anthropic',
    };

    await generateAutoHandoff(context, Date.now() + 3_600_000);

    expect(mockCreateHandoff).toHaveBeenCalledOnce();

    const payload = mockCreateHandoff.mock.calls[0][0];

    expect(payload.continuation_prompt).not.toContain(
      'SuperSecret99'
    );

    expect(payload.continuation_prompt).toContain('[REDACTED]');
  });
});