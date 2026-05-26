import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('BrowserWindow security defaults', () => {
  it('enables isolation and disables unsafe renderer access', () => {
    const mainPath = path.resolve(process.cwd(), 'electron-ui', 'main.cjs');
    const source = readFileSync(mainPath, 'utf8');

    expect(source).toContain('contextIsolation: true');
    expect(source).toContain('nodeIntegration: false');
    expect(source).toContain('sandbox: true');
  });
});
