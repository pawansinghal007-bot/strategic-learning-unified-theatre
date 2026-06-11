import { test, expect, invoke, waitForApi } from './base';

test.describe('Audit', () => {
  test('list returns audit events', async ({ page }) => {
    await waitForApi(page, 'audit');
    const events = await invoke<unknown[]>(page, 'window.audit.list', 10);
    expect(Array.isArray(events)).toBe(true);
  });

  test('verify returns integrity result', async ({ page }) => {
    await waitForApi(page, 'audit');
    const result = await invoke(page, 'window.audit.verify');
    expect(result).toBeDefined();
  });
});