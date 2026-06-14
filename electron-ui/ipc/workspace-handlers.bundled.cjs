const __importMetaUrl = typeof __filename === 'string' ? require('url').pathToFileURL(__filename).href : globalThis.location?.href;
"use strict";
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

// src/shared/logging/logger.ts
function write(level, message, context = {}) {
  const payload = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    message,
    ...context
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
var logger;
var init_logger = __esm({
  "src/shared/logging/logger.ts"() {
    logger = {
      info: (message, context) => write("info", message, context),
      warn: (message, context) => write("warn", message, context),
      error: (message, context) => write("error", message, context)
    };
  }
});

// src/llm/storage.ts
function getAppDir() {
  return process.env.UNIFIED_AI_DATA_DIR ?? (0, import_path.join)((0, import_os.homedir)(), ".unified-ai-workspace");
}
function ensureDir(path) {
  (0, import_fs.mkdirSync)((0, import_path.dirname)(path), { recursive: true });
}
function getStoragePath(fileName) {
  return (0, import_path.join)(getAppDir(), fileName);
}
function readJsonFile(fileName, fallback) {
  const filePath = getStoragePath(fileName);
  try {
    if (!(0, import_fs.existsSync)(filePath)) {
      return fallback;
    }
    const raw = (0, import_fs.readFileSync)(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    logger.warn("storage.read.failed", {
      fileName,
      error: error instanceof Error ? error.message : String(error)
    });
    return fallback;
  }
}
function writeJsonFile(fileName, value) {
  const filePath = getStoragePath(fileName);
  try {
    ensureDir(filePath);
    (0, import_fs.writeFileSync)(filePath, JSON.stringify(value, null, 2), "utf-8");
  } catch (error) {
    logger.error("storage.write.failed", {
      fileName,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
var import_fs, import_path, import_os;
var init_storage = __esm({
  "src/llm/storage.ts"() {
    import_fs = require("fs");
    import_path = require("path");
    import_os = require("os");
    init_logger();
  }
});

// src/policies/policy-presets.ts
function isPolicyPresetName(value) {
  return value in POLICY_PRESETS;
}
function getAllProviders() {
  return [...ALL_PROVIDERS];
}
var CLOUD_PROVIDERS, ALL_PROVIDERS, POLICY_PRESETS;
var init_policy_presets = __esm({
  "src/policies/policy-presets.ts"() {
    CLOUD_PROVIDERS = [
      "groq",
      "gemini",
      "openai",
      "perplexity"
    ];
    ALL_PROVIDERS = [
      "groq",
      "gemini",
      "openai",
      "perplexity",
      "local"
    ];
    POLICY_PRESETS = {
      default: {
        name: "default",
        label: "Default",
        description: "Balanced cloud routing with no special restrictions.",
        policy: {
          routingMode: "cloud",
          allowedProviders: [...CLOUD_PROVIDERS],
          blockedProviders: [],
          manualProvider: null
        }
      },
      coding: {
        name: "coding",
        label: "Coding mode",
        description: "Prefer fast coding providers while keeping cloud fallback available.",
        policy: {
          routingMode: "hybrid",
          allowedProviders: ["groq", "openai", "gemini", "local"],
          blockedProviders: ["perplexity"],
          manualProvider: "groq"
        }
      },
      research: {
        name: "research",
        label: "Research mode",
        description: "Prefer research and summarization providers.",
        policy: {
          routingMode: "cloud",
          allowedProviders: ["perplexity", "gemini", "openai"],
          blockedProviders: ["groq", "local"],
          manualProvider: "perplexity"
        }
      },
      private: {
        name: "private",
        label: "Private mode",
        description: "Route only to local for privacy-sensitive tasks.",
        policy: {
          routingMode: "local-only",
          allowedProviders: ["local"],
          blockedProviders: [],
          manualProvider: "local"
        }
      },
      enterprise: {
        name: "enterprise",
        label: "Enterprise mode",
        description: "Conservative approved-provider set with local fallback.",
        policy: {
          routingMode: "hybrid",
          allowedProviders: ["openai", "gemini", "local"],
          blockedProviders: ["groq", "perplexity"],
          manualProvider: null
        }
      }
    };
  }
});

// src/policies/sensitive-task-rules.ts
var init_sensitive_task_rules = __esm({
  "src/policies/sensitive-task-rules.ts"() {
  }
});

// src/policies/provider-policy.ts
function normalizeProviders(values) {
  return [...new Set(values)].filter((v) => ALL_PROVIDERS2.includes(v));
}
function sanitizePolicy(raw) {
  const routingMode = raw.routingMode ?? "cloud";
  let allowedProviders = normalizeProviders(
    raw.allowedProviders ?? DEFAULT_POLICY.allowedProviders
  );
  let blockedProviders = normalizeProviders(raw.blockedProviders ?? []);
  let manualProvider = raw.manualProvider ?? null;
  if (routingMode === "local-only") {
    allowedProviders = ["local"];
    blockedProviders = [];
    manualProvider = "local";
  }
  if (routingMode === "cloud") {
    if (!allowedProviders.length) {
      allowedProviders = [...DEFAULT_POLICY.allowedProviders];
    }
    if (manualProvider === "local") manualProvider = null;
  }
  if (routingMode === "hybrid" && !allowedProviders.length) {
    allowedProviders = [...ALL_PROVIDERS2];
  }
  if (manualProvider && !allowedProviders.includes(manualProvider)) {
    manualProvider = null;
  }
  const activePreset = raw.activePreset && isPolicyPresetName(raw.activePreset) ? raw.activePreset : "default";
  return {
    routingMode,
    allowedProviders,
    blockedProviders,
    manualProvider,
    activePreset,
    updatedAt: raw.updatedAt ?? Date.now()
  };
}
function getProviderPolicy() {
  if (state) return state;
  const raw = readJsonFile(POLICY_FILE, DEFAULT_POLICY);
  return sanitizePolicy(raw);
}
var POLICY_FILE, ALL_PROVIDERS2, DEFAULT_POLICY, state;
var init_provider_policy = __esm({
  "src/policies/provider-policy.ts"() {
    init_storage();
    init_logger();
    init_policy_presets();
    init_sensitive_task_rules();
    init_workspace_policy();
    POLICY_FILE = "provider-policy.json";
    ALL_PROVIDERS2 = getAllProviders();
    DEFAULT_POLICY = {
      routingMode: "cloud",
      allowedProviders: ["groq", "gemini", "openai", "perplexity", "local"],
      blockedProviders: [],
      manualProvider: null,
      activePreset: "default",
      updatedAt: Date.now()
    };
    state = null;
  }
});

// src/policies/workspace-policy.ts
var workspace_policy_exports = {};
__export(workspace_policy_exports, {
  clearWorkspacePolicyOverride: () => clearWorkspacePolicyOverride,
  getWorkspacePolicyOverride: () => getWorkspacePolicyOverride,
  listWorkspacePolicyOverrides: () => listWorkspacePolicyOverrides,
  resolveWorkspacePolicyState: () => resolveWorkspacePolicyState,
  setWorkspacePolicyOverride: () => setWorkspacePolicyOverride
});
function loadStore() {
  return readJsonFile(OVERRIDES_FILE, DEFAULT_STORE);
}
function saveStore(store) {
  writeJsonFile(OVERRIDES_FILE, store);
}
function getWorkspacePolicyOverride(workspaceId) {
  const store = loadStore();
  return store.overrides.find((o) => o.workspaceId === workspaceId) ?? null;
}
function setWorkspacePolicyOverride(workspaceId, policyPatch) {
  const store = loadStore();
  const existing = store.overrides.find((o) => o.workspaceId === workspaceId);
  const now = Date.now();
  if (existing) {
    existing.policy = { ...existing.policy, ...policyPatch };
    existing.updatedAt = now;
    saveStore(store);
    return existing;
  }
  const record = {
    workspaceId,
    policy: { ...policyPatch },
    updatedAt: now
  };
  store.overrides.push(record);
  saveStore(store);
  return record;
}
function clearWorkspacePolicyOverride(workspaceId) {
  const store = loadStore();
  const before = store.overrides.length;
  store.overrides = store.overrides.filter(
    (o) => o.workspaceId !== workspaceId
  );
  saveStore(store);
  return store.overrides.length < before;
}
function listWorkspacePolicyOverrides() {
  return loadStore().overrides;
}
function resolveWorkspacePolicyState(workspaceId) {
  const global = getProviderPolicy();
  const override = getWorkspacePolicyOverride(workspaceId);
  if (!override) {
    return { source: "global", policy: { ...global } };
  }
  const merged = { ...global };
  for (const [key, value] of Object.entries(override.policy)) {
    if (value !== void 0) {
      merged[key] = value;
    }
  }
  return {
    source: "workspace",
    workspaceId,
    policy: merged
  };
}
var OVERRIDES_FILE, DEFAULT_STORE;
var init_workspace_policy = __esm({
  "src/policies/workspace-policy.ts"() {
    init_storage();
    init_provider_policy();
    OVERRIDES_FILE = "workspace-policy-overrides.json";
    DEFAULT_STORE = { overrides: [] };
  }
});

// src/memory/request-context.ts
var request_context_exports = {};
__export(request_context_exports, {
  buildRequestContextPrompt: () => buildRequestContextPrompt,
  clearWorkspaceContext: () => clearWorkspaceContext,
  getWorkspaceContext: () => getWorkspaceContext,
  saveWorkspaceContext: () => saveWorkspaceContext
});
function readWorkspaceContextStore() {
  return readJsonFile(WORKSPACE_CONTEXT_FILE, DEFAULT_WORKSPACE_CONTEXT_STORE);
}
function writeWorkspaceContextStore(store) {
  writeJsonFile(WORKSPACE_CONTEXT_FILE, store);
  logger.info("workspace.context.saved", {
    workspaceCount: Object.keys(store.workspaces).length
  });
  return store;
}
function getWorkspaceContext(workspaceId) {
  if (!workspaceId) return null;
  const store = readWorkspaceContextStore();
  return store.workspaces[workspaceId] ?? null;
}
function saveWorkspaceContext(workspaceId, payload) {
  const store = readWorkspaceContextStore();
  const record = {
    workspaceId,
    summary: payload.summary,
    tags: payload.tags ?? [],
    lastIntent: payload.lastIntent,
    updatedAt: Date.now()
  };
  store.workspaces[workspaceId] = record;
  writeWorkspaceContextStore(store);
  return record;
}
function clearWorkspaceContext(workspaceId) {
  const store = readWorkspaceContextStore();
  if (!store.workspaces[workspaceId]) return false;
  delete store.workspaces[workspaceId];
  writeWorkspaceContextStore(store);
  return true;
}
function buildRequestContextPrompt(workspaceId) {
  const context = getWorkspaceContext(workspaceId);
  if (!context?.summary?.trim()) return null;
  const lines = ["Workspace context:", context.summary.trim()];
  if (context.tags.length) lines.push(`Tags: ${context.tags.join(", ")}`);
  if (context.lastIntent) lines.push(`Last intent: ${context.lastIntent}`);
  return lines.join("\n");
}
var WORKSPACE_CONTEXT_FILE, DEFAULT_WORKSPACE_CONTEXT_STORE;
var init_request_context = __esm({
  "src/memory/request-context.ts"() {
    init_storage();
    init_logger();
    WORKSPACE_CONTEXT_FILE = "workspace-context.json";
    DEFAULT_WORKSPACE_CONTEXT_STORE = {
      workspaces: {}
    };
  }
});

// electron-ui/ipc/workspace-handlers.cjs
var { ipcMain } = require("electron");
function workspacePolicy() {
  return init_workspace_policy(), __toCommonJS(workspace_policy_exports);
}
function workspaceContext() {
  return init_request_context(), __toCommonJS(request_context_exports);
}
function registerWorkspaceHandlers() {
  ipcMain.handle("workspacePolicy:get", async (_event, workspaceId) => {
    return workspacePolicy().getWorkspacePolicyOverride(workspaceId);
  });
  ipcMain.handle("workspacePolicy:set", async (_event, workspaceId, policy) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return workspacePolicy().setWorkspacePolicyOverride(workspaceId, policy);
  });
  ipcMain.handle("workspacePolicy:clear", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return workspacePolicy().clearWorkspacePolicyOverride(workspaceId);
  });
  ipcMain.handle("workspacePolicy:list", async () => {
    return workspacePolicy().listWorkspacePolicyOverrides();
  });
  ipcMain.handle("workspaceContext:get", async (_event, workspaceId) => {
    return workspaceContext().getWorkspaceContext(workspaceId);
  });
  ipcMain.handle(
    "workspaceContext:set",
    async (_event, workspaceId, payload) => {
      if (!workspaceId || typeof workspaceId !== "string") {
        throw new Error("workspaceId is required");
      }
      return workspaceContext().saveWorkspaceContext(workspaceId, payload);
    }
  );
  ipcMain.handle("workspaceContext:clear", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return workspaceContext().clearWorkspaceContext(workspaceId);
  });
  ipcMain.handle("workspacePolicy:resolve", async (_event, workspaceId) => {
    const { resolveWorkspacePolicyState: resolveWorkspacePolicyState2 } = (init_workspace_policy(), __toCommonJS(workspace_policy_exports));
    return resolveWorkspacePolicyState2(workspaceId);
  });
  ipcMain.handle("workspaceContext:prompt", async (_event, workspaceId) => {
    const { buildRequestContextPrompt: buildRequestContextPrompt2 } = (init_request_context(), __toCommonJS(request_context_exports));
    return buildRequestContextPrompt2(workspaceId);
  });
}
module.exports = { registerWorkspaceHandlers };
