import { readFileSync } from "node:fs";
import path from "node:path";

describe("preload IPC surface", () => {
  const preloadPath = path.resolve(process.cwd(), "electron-ui", "preload.cjs");

  const source = readFileSync(preloadPath, "utf8");

  it("imports ipcRenderer only from electron", () => {
    const ipcRendererRequireLines = source
      .split(/\r?\n/)
      .filter(
        (line) => line.includes("ipcRenderer") && line.includes("require("),
      );

    expect(ipcRendererRequireLines).toHaveLength(1);

    expect(ipcRendererRequireLines[0]).toMatch(/require\(['"]electron['"]\)/);
  });

  it("uses contextBridge for renderer exposure", () => {
    expect(source).toContain("contextBridge.exposeInMainWorld");
  });

  it("exposes the expected bridge names", () => {
    expect(source).toContain('contextBridge.exposeInMainWorld("rotator"');

    expect(source).toContain(
      'contextBridge.exposeInMainWorld("providerTelemetry"',
    );
  });

  it("does not expose raw ipcRenderer to window", () => {
    expect(source).not.toContain("globalThis.ipcRenderer");

    expect(source).not.toMatch(
      /exposeInMainWorld\s*\(\s*["'][^"']+["']\s*,\s*ipcRenderer/,
    );
  });

  it("does not expose unrestricted ipcRenderer.send", () => {
    expect(source).not.toContain("ipcRenderer.send(");
  });

  it("uses invoke-based request APIs", () => {
    expect(source).toContain("ipcRenderer.invoke(");
  });

  it("defines providerTelemetry surface", () => {
    expect(source).toContain("providerTelemetry:getStatus");

    expect(source).toContain("providerTelemetry:getUsage");

    expect(source).toContain("providerTelemetry:resetHealth");

    expect(source).toContain("providerTelemetry:resetUsage");

    expect(source).toContain("providerTelemetry:resetAll");
  });
});
