import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  getProviderHealthSnapshot,
  resetProviderHealth,
  markProviderFromError,
} from '../src/llm/provider-health.js';
import {
  getProviderUsage,
  resetProviderUsage,
  recordProviderSuccess,
} from '../src/llm/provider-usage.js';
import { getProviderStatus } from '../src/llm/status.js';

describe('Sprint 25 — Provider Telemetry IPC and Dashboard', () => {
  // ARCHITECTURE VERIFICATION TESTS
  describe('File existence — verified paths', () => {
    it('IPC handler file exists', () => {
      const path = join(process.cwd(), 'electron-ui/ipc/provider-telemetry-handlers.cjs');
      expect(existsSync(path)).toBe(true);
    });

    it('Preload file exists', () => {
      const path = join(process.cwd(), 'electron-ui/preload.cjs');
      expect(existsSync(path)).toBe(true);
    });

    it('Dashboard file exists', () => {
      const path = join(process.cwd(), 'src/ui/provider-dashboard.html');
      expect(existsSync(path)).toBe(true);
    });

    it('Types file exists', () => {
      const path = join(process.cwd(), 'src/ui/types.d.ts');
      expect(existsSync(path)).toBe(true);
    });

    it('Main process file exists', () => {
      const path = join(process.cwd(), 'electron-ui/main.cjs');
      expect(existsSync(path)).toBe(true);
    });
  });

  // PRELOAD BRIDGE WIRING TESTS
  describe('Preload bridge — providerTelemetry exposure', () => {
    let preloadContent;

    beforeEach(() => {
      const preloadPath = join(process.cwd(), 'electron-ui/preload.cjs');
      preloadContent = readFileSync(preloadPath, 'utf8');
    });

    it('exposes providerTelemetry namespace', () => {
      expect(preloadContent).toContain('contextBridge.exposeInMainWorld("providerTelemetry"');
    });

    it('exposes getStatus method', () => {
      expect(preloadContent).toContain('getStatus:');
      expect(preloadContent).toContain('ipcRenderer.invoke("providerTelemetry:getStatus"');
    });

    it('exposes getUsage method', () => {
      expect(preloadContent).toContain('getUsage:');
      expect(preloadContent).toContain('ipcRenderer.invoke("providerTelemetry:getUsage"');
    });

    it('exposes resetHealth method', () => {
      expect(preloadContent).toContain('resetHealth:');
      expect(preloadContent).toContain('ipcRenderer.invoke("providerTelemetry:resetHealth"');
    });

    it('exposes resetUsage method', () => {
      expect(preloadContent).toContain('resetUsage:');
      expect(preloadContent).toContain('ipcRenderer.invoke("providerTelemetry:resetUsage"');
    });

    it('exposes resetAll method', () => {
      expect(preloadContent).toContain('resetAll:');
      expect(preloadContent).toContain('ipcRenderer.invoke("providerTelemetry:resetAll"');
    });
  });

  // IPC HANDLER REGISTRATION TESTS
  describe('IPC handler registration', () => {
    let handlerContent;

    beforeEach(() => {
      const handlerPath = join(process.cwd(), 'electron-ui/ipc/provider-telemetry-handlers.cjs');
      handlerContent = readFileSync(handlerPath, 'utf8');
    });

    it('registers getStatus handler', () => {
      expect(handlerContent).toContain('ipcMain.handle("providerTelemetry:getStatus"');
    });

    it('registers getUsage handler', () => {
      expect(handlerContent).toContain('ipcMain.handle("providerTelemetry:getUsage"');
    });

    it('registers resetHealth handler', () => {
      expect(handlerContent).toContain('ipcMain.handle("providerTelemetry:resetHealth"');
    });

    it('registers resetUsage handler', () => {
      expect(handlerContent).toContain('ipcMain.handle("providerTelemetry:resetUsage"');
    });

    it('registers resetAll handler', () => {
      expect(handlerContent).toContain('ipcMain.handle("providerTelemetry:resetAll"');
    });

    it('validates provider names', () => {
      expect(handlerContent).toContain('VALID_PROVIDERS');
      expect(handlerContent).toContain('isValidProvider');
    });

    it('requires status module', () => {
      expect(handlerContent).toContain('require("../../src/llm/status.js")');
    });

    it('requires provider-usage module', () => {
      expect(handlerContent).toContain('require("../../src/llm/provider-usage.js")');
    });
  });

  // DASHBOARD INTEGRATION TESTS
  describe('Dashboard integration', () => {
    let dashboardContent;

    beforeEach(() => {
      const dashboardPath = join(process.cwd(), 'src/ui/provider-dashboard.html');
      dashboardContent = readFileSync(dashboardPath, 'utf8');
    });

    it('is HTML document', () => {
      expect(dashboardContent).toContain('<!doctype html>');
    });

    it('references window.providerTelemetry', () => {
      expect(dashboardContent).toContain('window.providerTelemetry');
    });

    it('calls getStatus API', () => {
      expect(dashboardContent).toContain('getStatus');
    });

    it('displays provider grid', () => {
      expect(dashboardContent).toContain('providerGrid');
    });

    it('includes refresh button', () => {
      expect(dashboardContent).toContain('refreshBtn');
    });

    it('includes reset all button', () => {
      expect(dashboardContent).toContain('resetAllBtn');
    });

    it('implements reset health handler', () => {
      expect(dashboardContent).toContain('resetHealth');
    });

    it('implements reset usage handler', () => {
      expect(dashboardContent).toContain('resetUsage');
    });
  });

  // MAIN PROCESS WIRING TESTS
  describe('Main process wiring', () => {
    let mainContent;

    beforeEach(() => {
      const mainPath = join(process.cwd(), 'electron-ui/main.cjs');
      mainContent = readFileSync(mainPath, 'utf8');
    });

    it('requires provider telemetry handlers module', () => {
      expect(mainContent).toContain('require("./ipc/provider-telemetry-handlers.cjs")');
    });

    it('destructures registerProviderTelemetryHandlers', () => {
      expect(mainContent).toContain('registerProviderTelemetryHandlers');
    });

    it('calls registerProviderTelemetryHandlers()', () => {
      expect(mainContent).toContain('registerProviderTelemetryHandlers()');
    });
  });

  // TYPE DEFINITIONS TESTS
  describe('Type definitions', () => {
    let typesContent;

    beforeEach(() => {
      const typesPath = join(process.cwd(), 'src/ui/types.d.ts');
      typesContent = readFileSync(typesPath, 'utf8');
    });

    it('declares Window.providerTelemetry interface', () => {
      expect(typesContent).toContain('providerTelemetry:');
    });

    it('declares getStatus method signature', () => {
      expect(typesContent).toContain('getStatus');
    });

    it('declares getUsage method signature', () => {
      expect(typesContent).toContain('getUsage');
    });

    it('declares resetHealth method signature', () => {
      expect(typesContent).toContain('resetHealth');
    });

    it('declares resetUsage method signature', () => {
      expect(typesContent).toContain('resetUsage');
    });

    it('declares resetAll method signature', () => {
      expect(typesContent).toContain('resetAll');
    });
  });

  // SERVICE LAYER INTEGRATION TESTS
  describe('Service layer — health and usage functionality', () => {
    beforeEach(() => {
      resetProviderHealth();
      resetProviderUsage();
    });

    it('getProviderStatus returns array of provider records', () => {
      const status = getProviderStatus();
      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBeGreaterThan(0);
    });

    it('provider records include required fields', () => {
      const status = getProviderStatus();
      const firstRecord = status[0];
      expect(firstRecord).toHaveProperty('name');
      expect(firstRecord).toHaveProperty('available');
      expect(firstRecord).toHaveProperty('state');
      expect(firstRecord).toHaveProperty('totalTokens');
      expect(firstRecord).toHaveProperty('estimatedCostUsd');
    });

    it('getProviderUsage returns array of usage records', () => {
      const usage = getProviderUsage();
      expect(Array.isArray(usage)).toBe(true);
      expect(usage.length).toBeGreaterThan(0);
    });

    it('usage records include counter fields', () => {
      const usage = getProviderUsage();
      const firstRecord = usage[0];
      expect(firstRecord).toHaveProperty('requestCount');
      expect(firstRecord).toHaveProperty('successCount');
      expect(firstRecord).toHaveProperty('failureCount');
      expect(firstRecord).toHaveProperty('totalTokens');
    });

    it('recordProviderSuccess increments counters', () => {
      recordProviderSuccess('local', {
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          estimatedCostUsd: 0.01,
        },
      });
      const usage = getProviderUsage();
      const local = usage.find((r) => r.provider === 'local');
      expect(local.successCount).toBeGreaterThan(0);
      expect(local.totalTokens).toBeGreaterThan(0);
    });

    it('resetProviderHealth clears health state', () => {
      markProviderFromError('groq', new Error('test'));
      resetProviderHealth();
      const health = getProviderHealthSnapshot();
      expect(health.length).toBe(0);
    });

    it('resetProviderUsage clears usage state', () => {
      recordProviderSuccess('local', { usage: { totalTokens: 10 } });
      resetProviderUsage();
      const usage = getProviderUsage();
      const local = usage.find((r) => r.provider === 'local');
      expect(local.requestCount).toBe(0);
    });
  });

  // ARCHITECTURE CHAIN TESTS
  describe('Architecture chain — renderer to service', () => {
    it('preload bridge methods call correct IPC channels', () => {
      const preloadPath = join(process.cwd(), 'electron-ui/preload.cjs');
      const preloadContent = readFileSync(preloadPath, 'utf8');
      expect(preloadContent).toContain('ipcRenderer.invoke("providerTelemetry:getStatus"');
      expect(preloadContent).toContain('ipcRenderer.invoke("providerTelemetry:getUsage"');
    });

    it('IPC handlers require service modules', () => {
      const handlerPath = join(process.cwd(), 'electron-ui/ipc/provider-telemetry-handlers.cjs');
      const handlerContent = readFileSync(handlerPath, 'utf8');
      expect(handlerContent).toContain('require("../../src/llm/status.js")');
      expect(handlerContent).toContain('require("../../src/llm/provider-usage.js")');
    });

    it('dashboard calls preload methods that map to IPC handlers', () => {
      const dashboardPath = join(process.cwd(), 'src/ui/provider-dashboard.html');
      const dashboardContent = readFileSync(dashboardPath, 'utf8');
      expect(dashboardContent).toContain('window.providerTelemetry.getStatus');
      expect(dashboardContent).toContain('window.providerTelemetry.resetHealth');
    });
  });
});
