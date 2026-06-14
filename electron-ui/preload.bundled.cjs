const __importMetaUrl = typeof __filename === 'string' ? require('url').pathToFileURL(__filename).href : globalThis.location?.href;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/shared/ipc/contract.ts
var contract_exports = {};
__export(contract_exports, {
  IPC_CHANNELS: () => IPC_CHANNELS,
  IPC_CONTRACT_VERSION: () => IPC_CONTRACT_VERSION,
  ipcContract: () => ipcContract
});
var IPC_CONTRACT_VERSION, IPC_CHANNELS, ipcContract;
var init_contract = __esm({
  "src/shared/ipc/contract.ts"() {
    IPC_CONTRACT_VERSION = 1;
    IPC_CHANNELS = {
      /** Receives captured browser response payloads from isolated capture contexts. */
      captureResponse: "ipc:capture-response",
      /** Sends tray-originated commands into the application control surface. */
      trayCommand: "ipc:tray-command",
      /** Requests log-view operations from the renderer. */
      logView: "ipc:log-view",
      /** Requests robot runner actions from the renderer. */
      robotRunnerAction: "ipc:robot-runner-action",
      /** Fetches the aggregate application health model. */
      healthGet: "health:get",
      /** Streams structured log entries from main to renderer. */
      logEvent: "log:event",
      /** Switches the embedded browser pane to a named platform. */
      browserSwitchPlatform: "browser:switchPlatform",
      /** Toggles embedded browser pane visibility. */
      browserSetVisible: "browser:setVisible",
      /** Navigates the embedded browser pane to a URL. */
      browserNavigate: "browser:navigate"
    };
    ipcContract = {
      version: IPC_CONTRACT_VERSION,
      channels: IPC_CHANNELS
    };
  }
});

// electron-ui/preload.cjs
var { contextBridge, ipcRenderer } = require("electron");
var {
  IPC_CHANNELS: IPC_CHANNELS2,
  IPC_CONTRACT_VERSION: IPC_CONTRACT_VERSION2
} = (init_contract(), __toCommonJS(contract_exports));
function invoke(channel, op, payload) {
  return ipcRenderer.invoke(channel, { v: IPC_CONTRACT_VERSION2, op, payload });
}
contextBridge.exposeInMainWorld("rotator", {
  accounts: {
    list: () => ipcRenderer.invoke("accounts:list"),
    listDetails: () => ipcRenderer.invoke("accounts:listDetails"),
    info: (id) => ipcRenderer.invoke("accounts:info", id),
    add: (a) => ipcRenderer.invoke("accounts:add", a),
    capture: (payload) => ipcRenderer.invoke("accounts:capture", payload),
    update: (id, p) => ipcRenderer.invoke("accounts:update", id, p),
    remove: (id) => ipcRenderer.invoke("accounts:remove", id),
    health: (id) => ipcRenderer.invoke("accounts:health", id)
  },
  switcher: {
    switch: (id) => ipcRenderer.invoke("switcher:switch", id)
  },
  daemon: {
    status: () => ipcRenderer.invoke("daemon:status"),
    pause: () => ipcRenderer.invoke("daemon:pause"),
    resume: () => ipcRenderer.invoke("daemon:resume"),
    onEvent: (cb) => ipcRenderer.on("daemon:event", (_, d) => cb(d)),
    offEvent: (cb) => ipcRenderer.removeListener("daemon:event", cb)
  },
  git: {
    status: (p) => ipcRenderer.invoke("git:status", p),
    watchedRepos: () => ipcRenderer.invoke("git:watchedRepos"),
    addRepo: (p) => ipcRenderer.invoke("git:addRepo", p),
    removeRepo: (p) => ipcRenderer.invoke("git:removeRepo", p),
    pickDir: () => ipcRenderer.invoke("git:pickDir")
  },
  journal: {
    tail: (n) => ipcRenderer.invoke("journal:tail", n),
    rawMd: () => ipcRenderer.invoke("journal:rawMd")
  },
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    set: (p) => ipcRenderer.invoke("config:set", p)
  },
  llm: {
    status: () => ipcRenderer.invoke("llm:status"),
    setup: (opts) => ipcRenderer.invoke("llm:setup", opts),
    ask: (opts) => ipcRenderer.invoke("llm:ask", opts)
  },
  browser: {
    send: (opts) => ipcRenderer.invoke("browser:send", opts),
    login: (opts) => ipcRenderer.invoke("browser:login", opts),
    listResponses: (opts) => ipcRenderer.invoke("browser:listResponses", opts),
    getResponse: (filename) => ipcRenderer.invoke("browser:getResponse", filename),
    clearResponses: (opts) => ipcRenderer.invoke("browser:clearResponses", opts),
    listPrompts: () => ipcRenderer.invoke("browser:listPrompts"),
    addPrompt: (prompt) => ipcRenderer.invoke("browser:addPrompt", prompt),
    updatePrompt: (id, updates) => ipcRenderer.invoke("browser:updatePrompt", id, updates),
    deletePrompt: (id) => ipcRenderer.invoke("browser:deletePrompt", id),
    runPrompt: (opts) => ipcRenderer.invoke("browser:runPrompt", opts),
    // Sprint 11 Embedded browser pane APIs
    switchPlatform: (name) => ipcRenderer.invoke("browser:switchPlatform", name),
    navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
    setVisible: (visible) => ipcRenderer.invoke("browser:setVisible", visible),
    onCapture: (cb) => ipcRenderer.on("capture:done", (_, payload) => cb(payload)),
    offCapture: (cb) => ipcRenderer.removeListener("capture:done", cb),
    onNavigation: (cb) => ipcRenderer.on("browser:navigation", (_, payload) => cb(payload)),
    offNavigation: (cb) => ipcRenderer.removeListener("browser:navigation", cb)
  },
  robot: {
    runSuite: (opts) => ipcRenderer.invoke("robot:runSuite", opts),
    runFile: (filePath, opts) => ipcRenderer.invoke("robot:runFile", filePath, opts),
    listFiles: () => ipcRenderer.invoke("robot:listFiles"),
    readFile: (filePath) => ipcRenderer.invoke("robot:readFile", filePath),
    openFile: (filePath) => ipcRenderer.invoke("robot:openFile", filePath),
    tddCheck: (opts) => ipcRenderer.invoke("robot:tddCheck", opts),
    generateSkeleton: (filePath) => ipcRenderer.invoke("robot:generateSkeleton", filePath),
    pickSourceFile: () => ipcRenderer.invoke("robot:pickSourceFile"),
    pickRobotFile: () => ipcRenderer.invoke("robot:pickRobotFile")
  },
  app: {
    version: () => ipcRenderer.invoke("app:version"),
    openUrl: (url) => ipcRenderer.invoke("app:openUrl", url)
  },
  logs: {
    onEvent(handler) {
      if (typeof handler !== "function") return () => {
      };
      const wrapped = (_event, payload) => handler(payload);
      ipcRenderer.on("log:event", wrapped);
      return () => ipcRenderer.removeListener("log:event", wrapped);
    }
  },
  health: {
    aggregate() {
      return ipcRenderer.invoke("health:get");
    }
  },
  captureResponse: (payload) => invoke(IPC_CHANNELS2.captureResponse, "captureResponse", payload),
  trayCommand: (payload) => invoke(IPC_CHANNELS2.trayCommand, "trayCommand", payload),
  logView: (payload) => invoke(IPC_CHANNELS2.logView, "logView", payload),
  robotRunnerAction: (payload) => invoke(IPC_CHANNELS2.robotRunnerAction, "robotRunnerAction", payload)
});
contextBridge.exposeInMainWorld("providerTelemetry", {
  getStatus: () => ipcRenderer.invoke("providerTelemetry:getStatus"),
  getUsage: () => ipcRenderer.invoke("providerTelemetry:getUsage"),
  resetHealth: (provider) => ipcRenderer.invoke("providerTelemetry:resetHealth", provider),
  resetUsage: (provider) => ipcRenderer.invoke("providerTelemetry:resetUsage", provider),
  resetAll: (provider) => ipcRenderer.invoke("providerTelemetry:resetAll", provider),
  getRoutingHistory: (limit) => ipcRenderer.invoke("providerTelemetry:getRoutingHistory", limit),
  resetRoutingHistory: () => ipcRenderer.invoke("providerTelemetry:resetRoutingHistory")
});
contextBridge.exposeInMainWorld("providerPolicy", {
  get: () => ipcRenderer.invoke("providerPolicy:get"),
  listPresets: () => ipcRenderer.invoke("providerPolicy:listPresets"),
  applyPreset: (name) => ipcRenderer.invoke("providerPolicy:applyPreset", name),
  setMode: (mode) => ipcRenderer.invoke("providerPolicy:setMode", mode),
  allow: (provider) => ipcRenderer.invoke("providerPolicy:allow", provider),
  block: (provider) => ipcRenderer.invoke("providerPolicy:block", provider),
  setManualProvider: (provider) => ipcRenderer.invoke("providerPolicy:setManualProvider", provider),
  reset: () => ipcRenderer.invoke("providerPolicy:reset")
});
contextBridge.exposeInMainWorld("workspacePolicy", {
  get: (workspaceId) => ipcRenderer.invoke("workspacePolicy:get", workspaceId),
  set: (workspaceId, policyPatch, options) => ipcRenderer.invoke(
    "workspacePolicy:set",
    workspaceId,
    policyPatch,
    options
  ),
  clear: (workspaceId) => ipcRenderer.invoke("workspacePolicy:clear", workspaceId),
  list: () => ipcRenderer.invoke("workspacePolicy:list"),
  resolve: (workspaceId) => ipcRenderer.invoke("workspacePolicy:resolve", workspaceId)
});
contextBridge.exposeInMainWorld("workspaceContext", {
  get: (workspaceId) => ipcRenderer.invoke("workspaceContext:get", workspaceId),
  set: (workspaceId, payload) => ipcRenderer.invoke("workspaceContext:set", workspaceId, payload),
  clear: (workspaceId) => ipcRenderer.invoke("workspaceContext:clear", workspaceId),
  buildPrompt: (workspaceId) => ipcRenderer.invoke("workspaceContext:prompt", workspaceId)
});
contextBridge.exposeInMainWorld("workspaceRouting", {
  list: (workspaceId, limit, filter) => ipcRenderer.invoke("workspaceRouting:list", workspaceId, limit, filter),
  summary: (workspaceId, filter) => ipcRenderer.invoke("workspaceRouting:summary", workspaceId, filter),
  trends: (workspaceId, filter) => ipcRenderer.invoke("workspaceRouting:trends", workspaceId, filter),
  timeline: (workspaceId, limit, filter) => ipcRenderer.invoke("workspaceRouting:timeline", workspaceId, limit, filter),
  analytics: (workspaceId, filter) => ipcRenderer.invoke("workspaceRouting:analytics", workspaceId, filter),
  buckets: (workspaceId, bucket, filter) => ipcRenderer.invoke("workspaceRouting:buckets", workspaceId, bucket, filter),
  globalAnalytics: (filter) => ipcRenderer.invoke("workspaceRouting:globalAnalytics", filter),
  exportJson: (workspaceId, filter) => ipcRenderer.invoke("workspaceRouting:exportJson", workspaceId, filter),
  exportCsv: (workspaceId, filter) => ipcRenderer.invoke("workspaceRouting:exportCsv", workspaceId, filter),
  providerComparison: (filter) => ipcRenderer.invoke("workspaceRouting:providerComparison", filter),
  bucketChartSvg: (workspaceId, bucket, filter) => ipcRenderer.invoke(
    "workspaceRouting:bucketChartSvg",
    workspaceId,
    bucket,
    filter
  ),
  providerComparisonChartSvg: (filter) => ipcRenderer.invoke("workspaceRouting:providerComparisonChartSvg", filter),
  exportHtmlReport: (workspaceId, filter) => ipcRenderer.invoke(
    "workspaceRouting:exportHtmlReport",
    workspaceId,
    filter
  ),
  clear: (workspaceId) => ipcRenderer.invoke("workspaceRouting:clear", workspaceId)
});
contextBridge.exposeInMainWorld("workspaceReport", {
  save: (workspaceId, format, filter) => ipcRenderer.invoke("workspaceReport:save", workspaceId, format, filter)
});
contextBridge.exposeInMainWorld("audit", {
  list: (limit, filter) => ipcRenderer.invoke("audit:list", limit, filter),
  verify: (filter) => ipcRenderer.invoke("audit:verify", filter),
  latest: (filter) => ipcRenderer.invoke("audit:latest", filter),
  exportJson: (filter) => ipcRenderer.invoke("audit:exportJson", filter),
  exportHtmlReport: (filter) => ipcRenderer.invoke("audit:exportHtmlReport", filter)
});
contextBridge.exposeInMainWorld("workspaceApproval", {
  list: (workspaceId, status) => ipcRenderer.invoke("workspaceApproval:list", workspaceId, status),
  resolve: (approvalId, status, reviewedBy, reviewNote) => ipcRenderer.invoke(
    "workspaceApproval:resolve",
    approvalId,
    status,
    reviewedBy,
    reviewNote
  )
});
contextBridge.exposeInMainWorld("workspaceQuota", {
  get: (workspaceId) => ipcRenderer.invoke("workspaceQuota:get", workspaceId),
  list: () => ipcRenderer.invoke("workspaceQuota:list"),
  set: (workspaceId, quotaPatch, options) => ipcRenderer.invoke("workspaceQuota:set", workspaceId, quotaPatch, options),
  clear: (workspaceId, requestedBy) => ipcRenderer.invoke("workspaceQuota:clear", workspaceId, requestedBy),
  recordUsage: (workspaceId, payload) => ipcRenderer.invoke("workspaceQuota:recordUsage", workspaceId, payload),
  usage: (workspaceId, now) => ipcRenderer.invoke("workspaceQuota:usage", workspaceId, now),
  evaluate: (workspaceId, now) => ipcRenderer.invoke("workspaceQuota:evaluate", workspaceId, now),
  clearUsage: (workspaceId) => ipcRenderer.invoke("workspaceQuota:clearUsage", workspaceId),
  rollup: (now) => ipcRenderer.invoke("workspaceQuota:rollup", now),
  latestNotification: (workspaceId) => ipcRenderer.invoke("workspaceQuota:latestNotification", workspaceId),
  notifications: (workspaceId) => ipcRenderer.invoke("workspaceQuota:notifications", workspaceId),
  resetDaily: (now) => ipcRenderer.invoke("workspaceQuota:resetDaily", now),
  onNotification(handler) {
    if (typeof handler !== "function") return () => {
    };
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("workspaceQuota:notification", wrapped);
    return () => ipcRenderer.removeListener("workspaceQuota:notification", wrapped);
  }
});
contextBridge.exposeInMainWorld("workspaceKnowledge", {
  ingest: (baseDir, featureArea) => ipcRenderer.invoke("knowledge:ingest", baseDir, featureArea),
  search: (queryText, options) => ipcRenderer.invoke("knowledge:search", queryText, options),
  buildPromptContext: (queryText, options) => ipcRenderer.invoke("knowledge:search", queryText, options)
});
contextBridge.exposeInMainWorld("secrets", {
  scan: (options) => ipcRenderer.invoke("secrets:scan", options)
});
contextBridge.exposeInMainWorld("workspaceRisks", {
  scanDependency: (basePath, options) => ipcRenderer.invoke("risks:scan:dependency", basePath, options),
  scanImage: (imageRef, options) => ipcRenderer.invoke("risks:scan:image", imageRef, options)
});
contextBridge.exposeInMainWorld("workspaceSecurity", {
  summarize: (payload) => ipcRenderer.invoke("security-overview:summarize", payload),
  saveBaseline: (baselinePath, fingerprints) => ipcRenderer.invoke(
    "security-overview:save-baseline",
    baselinePath,
    fingerprints
  ),
  loadSuppressions: (suppressionsPath) => ipcRenderer.invoke("security-overview:load-suppressions", suppressionsPath),
  saveSuppressions: (suppressionsPath, suppressions) => ipcRenderer.invoke(
    "security-overview:save-suppressions",
    suppressionsPath,
    suppressions
  ),
  loadTriage: (triagePath) => ipcRenderer.invoke("security-overview:load-triage", triagePath),
  setTriage: (triagePath, fingerprint, status, reason, updatedBy) => ipcRenderer.invoke(
    "security-overview:set-triage",
    triagePath,
    fingerprint,
    status,
    reason,
    updatedBy
  ),
  setTriageBulk: (triagePath, fingerprints, status, reason, updatedBy) => ipcRenderer.invoke(
    "security-overview:set-triage-bulk",
    triagePath,
    fingerprints,
    status,
    reason,
    updatedBy
  ),
  compareBaseline: (currentSnapshot, baselinePath) => ipcRenderer.invoke(
    "security-overview:compare-baseline",
    currentSnapshot,
    baselinePath
  ),
  explainIntroduced: (payload) => ipcRenderer.invoke("security-overview:explain-introduced", payload),
  getDriftClassification: (payload) => ipcRenderer.invoke("security-overview:get-drift-classification", payload),
  autoScan: (payload) => ipcRenderer.invoke("security-overview:auto-scan", payload),
  listDriftHistory: (historyPath) => ipcRenderer.invoke("security-overview:list-drift-history", historyPath)
});
