/**
 * browser-selectors-branch-coverage.test.js
 *
 * Covers every uncovered branch in src/browser-selectors.js:
 *
 *   line 45  branch 0  deepMerge: !source truthy  → return target
 *   line 48  branch 1  deepMerge if: TRUE (nested object recursion)
 *   line 48  branch 2  deepMerge binary: !Array.isArray TRUE
 *            branch 2  deepMerge binary: Array value → else branch (Array.isArray TRUE)
 *            branch 2  deepMerge binary: null value  → else branch (null check)
 *   line 49  branch 3  result[key] || {}  → {} fallback (result[key] undefined)
 *            branch 3  result[key] || {}  → result[key] used (result[key] truthy)
 *   line 65  branch 5  customPath || path.join(...)  → path.join side (customPath null)
 *   line 66  branch 6  process.env.HOME || os.homedir() → HOME used / homedir() used
 *   line 75  branch 7  merged[platform] falsy (unknown platform key in overrides)
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadOverrides, getSelectors, SELECTORS } from '../src/browser-selectors.js';

describe('browser-selectors: branch coverage', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bs-branch-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── branch 0 (line 45): deepMerge(!source) → return target immediately ───
  // Triggered by passing `null` as an override value for a nested object key.
  // loadOverrides writes {"chatgpt": null} — deepMerge(target, null) hits !source.
  it('deepMerge returns target immediately when source is null (line 45 branch 0)', async () => {
    const file = path.join(tmpDir, 'null-source.json');
    // null value for chatgpt — deepMerge(DEFAULT_SELECTORS.chatgpt, null)
    await fs.writeFile(file, JSON.stringify({ chatgpt: null }), 'utf8');
    // merged[platform] check happens first; for this to reach deepMerge with null
    // we need the value to pass the if(merged[platform]) check but be null itself.
    // Since chatgpt is truthy in merged, deepMerge IS called with source=null → branch 0
    const result = await loadOverrides(file);
    // chatgpt should remain at defaults (deepMerge returned target unchanged)
    expect(result.chatgpt).toEqual(SELECTORS.chatgpt);
  });

  // ── branch 2 loc[2] (line 48): Array value → !Array.isArray FALSE → else ─
  // deepMerge sees an array value: passes !== null, passes typeof==='object',
  // but fails !Array.isArray → falls to else branch.
  it('deepMerge assigns array values directly (line 48 branch 2 - Array.isArray true)', async () => {
    const file = path.join(tmpDir, 'array-value.json');
    const overrides = {
      chatgpt: {
        // Array value: object but isArray → hits else branch, assigned directly
        allowedDomains: ['openai.com', 'chat.openai.com'],
        completionDelay: 2500,
      },
    };
    await fs.writeFile(file, JSON.stringify(overrides), 'utf8');
    const result = await loadOverrides(file);
    expect(result.chatgpt.allowedDomains).toEqual(['openai.com', 'chat.openai.com']);
    expect(result.chatgpt.completionDelay).toBe(2500);
    // Other chatgpt keys preserved from defaults
    expect(result.chatgpt.responseContainer).toBe(SELECTORS.chatgpt.responseContainer);
  });

  // ── branch 1 (line 48): deepMerge TRUE branch — nested object recursion ──
  // Also hits branch 3 loc[1] (result[key] truthy) and loc[0] ({} fallback).
  it('deepMerge recurses into nested objects (line 48 branch 1)', async () => {
    const file = path.join(tmpDir, 'nested.json');
    const overrides = {
      chatgpt: {
        // Nested object → branch 1 TRUE (recursive deepMerge call)
        timing: { completionDelay: 3000, retryMs: 500 },
        completionDelay: 1800,
      },
    };
    await fs.writeFile(file, JSON.stringify(overrides), 'utf8');
    const result = await loadOverrides(file);
    // timing is a new key not in defaults; result[key] is undefined → {} fallback (branch 3 loc[1])
    expect(result.chatgpt.timing).toEqual({ completionDelay: 3000, retryMs: 500 });
    expect(result.chatgpt.completionDelay).toBe(1800);
  });

  // ── branch 3 loc[0] (line 49): result[key] || {} → {} used (key absent) ──
  // When target has no matching key, `result[key]` is undefined → falsy → {}
  it('deepMerge uses {} fallback when target key is absent (line 49 branch 3 - {} side)', async () => {
    const file = path.join(tmpDir, 'new-nested-key.json');
    // 'extra' is a nested object not present in the default chatgpt selectors
    const overrides = {
      chatgpt: {
        extra: { foo: 'bar' },
      },
    };
    await fs.writeFile(file, JSON.stringify(overrides), 'utf8');
    const result = await loadOverrides(file);
    // deepMerge({}, {foo:'bar'}) → {foo:'bar'}
    expect(result.chatgpt.extra).toEqual({ foo: 'bar' });
  });

  // ── branch 5 loc[1] (line 65-66): customPath=null → uses path.join(...) ───
  // Also covers branch 6: process.env.HOME used when set.
  it('loadOverrides uses default path when customPath is null (line 65 branch 5)', async () => {
    // Point HOME at tmpDir so the default path is resolvable (won't exist → ENOENT → defaults)
    const origHome = process.env.HOME;
    process.env.HOME = tmpDir;
    try {
      const result = await loadOverrides(null); // customPath=null → hits path.join branch
      // File doesn't exist at tmpDir/.vscode-rotator/... → returns DEFAULT_SELECTORS
      expect(result).toEqual(SELECTORS);
    } finally {
      process.env.HOME = origHome;
    }
  });

  // ── branch 6 loc[1] (line 66): process.env.HOME absent → os.homedir() ────
  it('loadOverrides falls back to os.homedir() when HOME is unset (line 66 branch 6)', async () => {
    const origHome = process.env.HOME;
    delete process.env.HOME;
    // os.homedir() will return a real path; .vscode-rotator/browser-selectors.json won't exist
    try {
      const result = await loadOverrides(null);
      expect(result).toEqual(SELECTORS);
    } finally {
      process.env.HOME = origHome;
    }
  });

  // ── branch 7 loc[1] (line 75): merged[platform] falsy — unknown platform ─
  // If the override file has a key not in DEFAULT_SELECTORS, the if is false
  // and that key is silently skipped.
  it('loadOverrides ignores unknown platform keys (line 75 branch 7)', async () => {
    const file = path.join(tmpDir, 'unknown-platform.json');
    const overrides = {
      copilot: { responseContainer: 'div.copilot-response' }, // not in DEFAULT_SELECTORS
      chatgpt: { completionDelay: 999 },                       // known — still applied
    };
    await fs.writeFile(file, JSON.stringify(overrides), 'utf8');
    const result = await loadOverrides(file);
    // copilot is skipped entirely
    expect(result).not.toHaveProperty('copilot');
    // chatgpt override still applied
    expect(result.chatgpt.completionDelay).toBe(999);
  });
});
