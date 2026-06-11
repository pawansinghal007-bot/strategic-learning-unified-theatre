import { _electron as electron, test as base, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export { expect };

export const test = base.extend<{ app: ElectronApplication; page: Page }>({
  app: async ({}, use) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    const home = path.join(root, 'home');
    const stateDir = path.join(root, 'state');
    const dbPath = path.join(stateDir, 'app.db');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(stateDir, { recursive: true });
    const app = await electron.launch({
      args: [path.join(process.cwd(), 'electron-ui', 'main.cjs')],
      env: {
        ...process.env,
        HOME: home,
        DB_PATH: dbPath,
        ROTATOR_STATE_DIR: stateDir,
        VSCODE_ROTATOR_MOCK_LLM: '1',
        NODE_ENV: 'test',
        NODE_OPTIONS: '--max-old-space-size=8192',
        ROTATOR_LOG_LEVEL: 'info',
        ROTATOR_LOG_SINK: 'stdout',
      },
    });
    await use(app);
    await app.close().catch(() => {});
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await expect(page.locator('body')).toBeVisible();
    await use(page);
  },
});

export async function invoke<T>(page: Page, expr: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ({ expr, args }) => {
      const fn = new Function('args', `return (${expr})(...args);`);
      return fn(args);
    },
    { expr, args }
  );
}

export async function waitForApi(page: Page, namespace: string): Promise<void> {
  await expect.poll(
    () => page.evaluate((ns) => {
      const v = Reflect.get(window, ns);
      return Boolean(v && typeof v === 'object');
    }, namespace),
    { message: `window.${namespace} should be available`, timeout: 10000 }
  ).toBe(true);
}