import { test, expect, invoke, waitForApi } from './base';

test.describe('Git', () => {
  test('watchedRepos returns array', async ({ page }) => {
    await waitForApi(page, 'rotator');
    const repos = await invoke<unknown[]>(page, 'window.rotator.git.watchedRepos');
    expect(Array.isArray(repos)).toBe(true);
  });
});