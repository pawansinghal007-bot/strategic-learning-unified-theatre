import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    video: 'on',                    // record every test
    screenshot: 'on',               // screenshot on failure
    trace: 'on',                    // full trace for debugging
    launchOptions: {
      args: ['--no-sandbox'],
    },
  },
  projects: [
    {
      name: 'electron',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  outputDir: 'test-results',
});
