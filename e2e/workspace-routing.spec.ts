import { test, expect, invoke, waitForApi } from './base';

test.describe('Workspace Routing', () => {
  test('list returns routing decisions', async ({ page }) => {
    await waitForApi(page, 'workspaceRouting');
    const decisions = await invoke<unknown[]>(page, 'window.workspaceRouting.list', 'ws-1', 10);
    expect(Array.isArray(decisions)).toBe(true);
  });

  test('global analytics returns summary', async ({ page }) => {
    await waitForApi(page, 'workspaceRouting');
    const analytics = await invoke(page, 'window.workspaceRouting.globalAnalytics');
    expect(analytics).toBeDefined();
  });
});