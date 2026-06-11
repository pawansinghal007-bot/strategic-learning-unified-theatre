import { test, expect, invoke, waitForApi } from './base';

test.describe('Provider Policy', () => {
  test('get returns current policy', async ({ page }) => {
    await waitForApi(page, 'providerPolicy');
    const policy = await invoke(page, 'window.providerPolicy.get');
    expect(policy).toBeDefined();
  });

  test('list presets returns array', async ({ page }) => {
    await waitForApi(page, 'providerPolicy');
    const presets = await invoke<unknown[]>(page, 'window.providerPolicy.listPresets');
    expect(Array.isArray(presets)).toBe(true);
  });
});