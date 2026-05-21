import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { loadOverrides, getSelectors, SELECTORS } from '../browser-selectors.js';

describe('browser-selectors.js', () => {
  describe('SELECTORS export', () => {
    it('exports all four platforms', () => {
      expect(SELECTORS).toHaveProperty('chatgpt');
      expect(SELECTORS).toHaveProperty('claude');
      expect(SELECTORS).toHaveProperty('gemini');
      expect(SELECTORS).toHaveProperty('perplexity');
    });

    it('each platform has responseContainer selector', () => {
      for (const platform of ['chatgpt', 'claude', 'gemini', 'perplexity']) {
        const sel = SELECTORS[platform];
        expect(sel).toHaveProperty('responseContainer');
        expect(typeof sel.responseContainer).toBe('string');
        expect(sel.responseContainer.length).toBeGreaterThan(0);
      }
    });

    it('each platform has completionDelay as positive integer', () => {
      for (const platform of ['chatgpt', 'claude', 'gemini', 'perplexity']) {
        const sel = SELECTORS[platform];
        expect(sel).toHaveProperty('completionDelay');
        expect(typeof sel.completionDelay).toBe('number');
        expect(sel.completionDelay).toBeGreaterThan(0);
        expect(Number.isInteger(sel.completionDelay)).toBe(true);
      }
    });

    it('each platform has streamingIndicator (string or null)', () => {
      for (const platform of ['chatgpt', 'claude', 'gemini', 'perplexity']) {
        const sel = SELECTORS[platform];
        expect(sel).toHaveProperty('streamingIndicator');
        const si = sel.streamingIndicator;
        expect(si === null || typeof si === 'string').toBe(true);
      }
    });
  });

  describe('getSelectors()', () => {
    it('returns selector config for a valid platform', () => {
      const sel = getSelectors('chatgpt');
      expect(sel).not.toBeNull();
      expect(sel).toHaveProperty('responseContainer');
      expect(sel).toHaveProperty('completionDelay');
    });

    it('returns null for unknown platform', () => {
      const sel = getSelectors('unknown-platform');
      expect(sel).toBeNull();
    });

    it('accepts pre-loaded merged config', () => {
      const merged = { custom: { responseContainer: 'div.custom' } };
      const sel = getSelectors('custom', merged);
      expect(sel).toEqual({ responseContainer: 'div.custom' });
    });
  });

  describe('loadOverrides()', () => {
    let tempDir;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-rotator-selectors-'));
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('returns defaults when override file does not exist', async () => {
      const result = await loadOverrides(path.join(tempDir, 'nonexistent.json'));
      expect(result).toEqual(SELECTORS);
    });

    it('deep-merges overrides into defaults', async () => {
      const overrideFile = path.join(tempDir, 'overrides.json');
      const overrides = {
        chatgpt: {
          completionDelay: 2000
        }
      };
      await fs.writeFile(overrideFile, JSON.stringify(overrides), 'utf8');

      const result = await loadOverrides(overrideFile);

      // ChatGPT completionDelay should be overridden
      expect(result.chatgpt.completionDelay).toBe(2000);
      // ChatGPT responseContainer should still be the default
      expect(result.chatgpt.responseContainer).toBe(SELECTORS.chatgpt.responseContainer);
      // Other platforms should be untouched
      expect(result.claude).toEqual(SELECTORS.claude);
      expect(result.gemini).toEqual(SELECTORS.gemini);
      expect(result.perplexity).toEqual(SELECTORS.perplexity);
    });

    it('overrides streaming indicator for a platform', async () => {
      const overrideFile = path.join(tempDir, 'overrides.json');
      const overrides = {
        claude: {
          streamingIndicator: 'div[data-streaming="true"]'
        }
      };
      await fs.writeFile(overrideFile, JSON.stringify(overrides), 'utf8');

      const result = await loadOverrides(overrideFile);
      expect(result.claude.streamingIndicator).toBe('div[data-streaming="true"]');
      expect(result.claude.responseContainer).toBe(SELECTORS.claude.responseContainer);
    });

    it('overrides multiple platforms simultaneously', async () => {
      const overrideFile = path.join(tempDir, 'overrides.json');
      const overrides = {
        gemini: { completionDelay: 3000 },
        perplexity: { completionDelay: 1000 }
      };
      await fs.writeFile(overrideFile, JSON.stringify(overrides), 'utf8');

      const result = await loadOverrides(overrideFile);
      expect(result.gemini.completionDelay).toBe(3000);
      expect(result.perplexity.completionDelay).toBe(1000);
      expect(result.chatgpt).toEqual(SELECTORS.chatgpt);
      expect(result.claude).toEqual(SELECTORS.claude);
    });

    it('logs warning and returns defaults on malformed JSON', async () => {
      const overrideFile = path.join(tempDir, 'malformed.json');
      await fs.writeFile(overrideFile, 'not valid json {', 'utf8');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await loadOverrides(overrideFile);
      expect(result).toEqual(SELECTORS);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('handles partial overrides (missing top-level platform)', async () => {
      const overrideFile = path.join(tempDir, 'partial.json');
      const overrides = {
        chatgpt: { completionDelay: 5000 }
        // claude, gemini, perplexity are not included
      };
      await fs.writeFile(overrideFile, JSON.stringify(overrides), 'utf8');

      const result = await loadOverrides(overrideFile);
      expect(result.chatgpt.completionDelay).toBe(5000);
      expect(result.claude).toEqual(SELECTORS.claude);
      expect(result.gemini).toEqual(SELECTORS.gemini);
      expect(result.perplexity).toEqual(SELECTORS.perplexity);
    });
  });
});
