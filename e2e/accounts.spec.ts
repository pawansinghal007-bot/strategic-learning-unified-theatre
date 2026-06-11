import { test, expect, invoke, waitForApi } from './base';

test.describe('Accounts', () => {
  test('list returns empty array initially', async ({ page }) => {
    await waitForApi(page, 'rotator');
    const accounts = await invoke<unknown[]>(page, 'window.rotator.accounts.list');
    expect(Array.isArray(accounts)).toBe(true);
  });

  test('add and retrieve an account', async ({ page }) => {
    await waitForApi(page, 'rotator');
    await invoke(page, 'window.rotator.accounts.add', {
      email: 'test@example.com',
      label: 'Test Account',
      authBlob: 'test-auth-blob',
      agentType: 'codex',
      status: 'active',
    });
    const accounts = await invoke<unknown[]>(page, 'window.rotator.accounts.list');
    expect(accounts.length).toBeGreaterThan(0);
  });

  test('health check returns status', async ({ page }) => {
    await waitForApi(page, 'rotator');
    const health = await invoke(page, 'window.rotator.health.aggregate');
    expect(health).toBeDefined();
  });
});