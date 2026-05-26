import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('preload IPC surface', () => {
  const preloadPath = path.resolve(process.cwd(), 'electron-ui', 'preload.cjs');
  const source = readFileSync(preloadPath, 'utf8');

  it('exposes a narrow bridge through contextBridge', () => {
    expect(source).toContain('contextBridge.exposeInMainWorld');
    expect(source).not.toMatch(/contextBridge\.exposeInMainWorld\([^)]*ipcRenderer/s);
  });

  it('does not expose raw ipcRenderer.send from preload', () => {
    expect(source).not.toContain('ipcRenderer.send');
  });

  it('gets ipcRenderer only from the electron require', () => {
    const ipcRendererRequireLines = source
      .split(/\r?\n/)
      .filter((line) => line.includes('ipcRenderer') && line.includes('require('));

    expect(ipcRendererRequireLines).toEqual([
      "const { contextBridge, ipcRenderer } = require('electron');"
    ]);
  });
});
