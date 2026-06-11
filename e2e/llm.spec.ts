import { test, expect, invoke, waitForApi } from './base';

test.describe('LLM', () => {
  test('status returns current llm state', async ({ page }) => {
    await waitForApi(page, 'rotator');
    const status = await invoke(page, 'window.rotator.llm.status');
    expect(status).toBeDefined();
  });
});