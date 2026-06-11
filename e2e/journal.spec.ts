import { test, expect, invoke, waitForApi } from './base';

test.describe('Journal', () => {
  test('tail returns recent entries', async ({ page }) => {
    await waitForApi(page, 'rotator');
    const entries = await invoke<unknown[]>(page, 'window.rotator.journal.tail', 10);
    expect(Array.isArray(entries)).toBe(true);
  });

  test('rawMd returns markdown string', async ({ page }) => {
    await waitForApi(page, 'rotator');
    const md = await invoke<string>(page, 'window.rotator.journal.rawMd');
    expect(typeof md).toBe('string');
  });
});