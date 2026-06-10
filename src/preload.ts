// src/preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("providerTelemetry", {
  getStatus: () => ipcRenderer.invoke("providerTelemetry:getStatus"),
  getUsage: () => ipcRenderer.invoke("providerTelemetry:getUsage"),
  getRoutingHistory: (limit?: number) => ipcRenderer.invoke("providerTelemetry:getRoutingHistory", limit),
  resetHealth: (provider?: string) => ipcRenderer.invoke("providerTelemetry:resetHealth", provider),
  resetUsage: (provider?: string) => ipcRenderer.invoke("providerTelemetry:resetUsage", provider),
  resetAll: (provider?: string) => ipcRenderer.invoke("providerTelemetry:resetAll", provider),
  resetRoutingHistory: () => ipcRenderer.invoke("providerTelemetry:resetRoutingHistory"),
});

contextBridge.exposeInMainWorld("providerPolicy", {
  get: () => ipcRenderer.invoke("providerPolicy:get"),
  listPresets: () => ipcRenderer.invoke("providerPolicy:listPresets"),
  applyPreset: (name: string) => ipcRenderer.invoke("providerPolicy:applyPreset", name),
  setMode: (mode: string) => ipcRenderer.invoke("providerPolicy:setMode", mode),
  allow: (provider: string) => ipcRenderer.invoke("providerPolicy:allow", provider),
  block: (provider: string) => ipcRenderer.invoke("providerPolicy:block", provider),
  setManualProvider: (provider: string | null) => ipcRenderer.invoke("providerPolicy:setManualProvider", provider),
  reset: () => ipcRenderer.invoke("providerPolicy:reset"),
});

contextBridge.exposeInMainWorld("workspacePolicy", {
  get: (workspaceId: string) => ipcRenderer.invoke("workspacePolicy:get", workspaceId),
  resolve: (workspaceId: string) => ipcRenderer.invoke("workspacePolicy:resolve", workspaceId),
  set: (workspaceId: string, policyPatch: Record<string, any>, options?: object) =>
    ipcRenderer.invoke("workspacePolicy:set", workspaceId, policyPatch, options),
  clear: (workspaceId: string) => ipcRenderer.invoke("workspacePolicy:clear", workspaceId),
  list: () => ipcRenderer.invoke("workspacePolicy:list"),
});

contextBridge.exposeInMainWorld("workspaceApproval", {
  list: (workspaceId?: string, status?: string) =>
    ipcRenderer.invoke("workspaceApproval:list", workspaceId, status),
  resolve: (approvalId: string, status: string, reviewedBy?: string, reviewNote?: string) =>
    ipcRenderer.invoke("workspaceApproval:resolve", approvalId, status, reviewedBy, reviewNote),
});

contextBridge.exposeInMainWorld("workspaceQuota", {
  get: (workspaceId: string) => ipcRenderer.invoke("workspaceQuota:get", workspaceId),
  list: () => ipcRenderer.invoke("workspaceQuota:list"),
  set: (workspaceId: string, quotaPatch: object, options?: object) =>
    ipcRenderer.invoke("workspaceQuota:set", workspaceId, quotaPatch, options),
  clear: (workspaceId: string, requestedBy?: string) =>
    ipcRenderer.invoke("workspaceQuota:clear", workspaceId, requestedBy),
  recordUsage: (workspaceId: string, payload?: object) =>
    ipcRenderer.invoke("workspaceQuota:recordUsage", workspaceId, payload),
  usage: (workspaceId: string, now?: number) =>
    ipcRenderer.invoke("workspaceQuota:usage", workspaceId, now),
  evaluate: (workspaceId: string, now?: number) =>
    ipcRenderer.invoke("workspaceQuota:evaluate", workspaceId, now),
  clearUsage: (workspaceId?: string) => ipcRenderer.invoke("workspaceQuota:clearUsage", workspaceId),
  rollup: (now?: number) => ipcRenderer.invoke("workspaceQuota:rollup", now),
  notifications: (workspaceId?: string) => ipcRenderer.invoke("workspaceQuota:notifications", workspaceId),
  resetDaily: (now?: number) => ipcRenderer.invoke("workspaceQuota:resetDaily", now),
});

contextBridge.exposeInMainWorld("workspaceContext", {
  get: (workspaceId: string) => ipcRenderer.invoke("workspaceContext:get", workspaceId),
  set: (workspaceId: string, payload: object) =>
    ipcRenderer.invoke("workspaceContext:set", workspaceId, payload),
  clear: (workspaceId: string) => ipcRenderer.invoke("workspaceContext:clear", workspaceId),
  buildPrompt: (workspaceId: string) => ipcRenderer.invoke("workspaceContext:buildPrompt", workspaceId),
});

contextBridge.exposeInMainWorld("workspaceRouting", {
  list: (workspaceId: string, limit?: number, filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:list", workspaceId, limit, filter),
  summary: (workspaceId: string, filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:summary", workspaceId, filter),
  trends: (workspaceId: string, filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:trends", workspaceId, filter),
  timeline: (workspaceId: string, limit?: number, filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:timeline", workspaceId, limit, filter),
  analytics: (workspaceId: string, filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:analytics", workspaceId, filter),
  buckets: (workspaceId: string, bucket: string, filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:buckets", workspaceId, bucket, filter),
  globalAnalytics: (filter?: object) => ipcRenderer.invoke("workspaceRouting:globalAnalytics", filter),
  providerComparison: (filter?: object) => ipcRenderer.invoke("workspaceRouting:providerComparison", filter),
  bucketChartSvg: (workspaceId: string, bucket: string, filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:bucketChartSvg", workspaceId, bucket, filter),
  providerComparisonChartSvg: (filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:providerComparisonChartSvg", filter),
  exportJson: (workspaceId: string, filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:exportJson", workspaceId, filter),
  exportCsv: (workspaceId: string, filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:exportCsv", workspaceId, filter),
  exportHtmlReport: (workspaceId: string, filter?: object) =>
    ipcRenderer.invoke("workspaceRouting:exportHtmlReport", workspaceId, filter),
  clear: (workspaceId: string) => ipcRenderer.invoke("workspaceRouting:clear", workspaceId),
});

contextBridge.exposeInMainWorld("workspaceReport", {
  save: (workspaceId: string, format: string, filter?: object) =>
    ipcRenderer.invoke("workspaceReport:save", workspaceId, format, filter),
});

contextBridge.exposeInMainWorld("audit", {
  list: (limit?: number, filter?: object) => ipcRenderer.invoke("audit:list", limit, filter),
  verify: (filter?: object) => ipcRenderer.invoke("audit:verify", filter),
  latest: (filter?: object) => ipcRenderer.invoke("audit:latest", filter),
  exportJson: (filter?: object) => ipcRenderer.invoke("audit:exportJson", filter),
  exportHtmlReport: (filter?: object) => ipcRenderer.invoke("audit:exportHtmlReport", filter),
});
