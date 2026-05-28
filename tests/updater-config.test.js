import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'electron-ui', 'main.cjs'), 'utf8');

test('main.cjs wires updater config and health checks', () => {
  expect(source).toContain('function readUpdateConfig');
  expect(source).toContain('async function handleStartupHealth');
  expect(source).toContain('function setupAutoUpdater');
  expect(source).toContain('autoUpdater.channel');
  expect(source).toContain('function markPendingVersion');
});
