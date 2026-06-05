import { readJsonFile, writeJsonFile } from "../llm/storage";
import { logger } from "../shared/logging/logger";
import { ProviderName } from "../shared/contracts/provider";
import {
  getPolicyPreset,
  getAllProviders,
  isPolicyPresetName,
} from "./policy-presets";
import { detectSensitiveTask } from "./sensitive-task-rules";
import { resolveWorkspacePolicyState } from "./workspace-policy";

const POLICY_FILE = "provider-policy.json";
const ALL_PROVIDERS = getAllProviders();

export type RoutingMode = "cloud" | "hybrid" | "local-only";

export interface PolicyState {
  routingMode: RoutingMode;
  allowedProviders: ProviderName[];
  blockedProviders: ProviderName[];
  manualProvider: ProviderName | null;
  activePreset: string;
  updatedAt: number;
}

export type PolicyAction =
  | { type: "SET_ROUTING_MODE"; mode: RoutingMode }
  | { type: "ALLOW_PROVIDER"; provider: ProviderName }
  | { type: "BLOCK_PROVIDER"; provider: ProviderName }
  | { type: "SET_MANUAL_PROVIDER"; provider: ProviderName | null }
  | { type: "APPLY_PRESET"; preset: any }
  | { type: "RESET"; defaultState: PolicyState };

const DEFAULT_POLICY: PolicyState = {
  routingMode: "cloud",
  allowedProviders: ["groq", "gemini", "openai", "perplexity", "local"],
  blockedProviders: [],
  manualProvider: null,
  activePreset: "default",
  updatedAt: Date.now(),
};

function normalizeProviders(values: ProviderName[]) {
  return [...new Set(values)].filter((v) => ALL_PROVIDERS.includes(v));
}

function sanitizePolicy(raw: PolicyState): PolicyState {
  const routingMode = raw.routingMode ?? "cloud";

  let allowedProviders = normalizeProviders(
    raw.allowedProviders ?? DEFAULT_POLICY.allowedProviders,
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
    allowedProviders = [...ALL_PROVIDERS];
  }

  if (manualProvider && !allowedProviders.includes(manualProvider)) {
    manualProvider = null;
  }

  const activePreset =
    raw.activePreset && isPolicyPresetName(raw.activePreset)
      ? raw.activePreset
      : "default";

  return {
    routingMode,
    allowedProviders,
    blockedProviders,
    manualProvider,
    activePreset,
    updatedAt: raw.updatedAt ?? Date.now(),
  };
}

export function getProviderPolicy(): PolicyState {
  const raw = readJsonFile(POLICY_FILE, DEFAULT_POLICY);
  return sanitizePolicy(raw);
}

function saveProviderPolicy(s: PolicyState) {
  const normalized = sanitizePolicy({ ...s, updatedAt: Date.now() });
  writeJsonFile(POLICY_FILE, normalized);
  logger.info("provider.policy.saved", normalized);
  return normalized;
}

export function policyReducer(
  state: PolicyState,
  action: PolicyAction,
): PolicyState {
  const next = { ...state };

  switch (action.type) {
    case "SET_ROUTING_MODE":
      next.routingMode = action.mode;

      if (action.mode === "local-only") {
        next.allowedProviders = ["local"];
        next.blockedProviders = [];
        next.manualProvider = "local";
      }

      if (action.mode === "cloud") {
        next.allowedProviders = [
          "groq",
          "gemini",
          "openai",
          "perplexity",
          "local",
        ];
        next.blockedProviders = next.blockedProviders.filter(
          (p) => p !== "local",
        );
        if (next.manualProvider === "local") next.manualProvider = null;
      }

      if (action.mode === "hybrid") {
        next.allowedProviders = [...ALL_PROVIDERS];
      }
      break;

    case "ALLOW_PROVIDER":
      if (!next.allowedProviders.includes(action.provider)) {
        next.allowedProviders.push(action.provider);
      }
      next.blockedProviders = next.blockedProviders.filter(
        (p) => p !== action.provider,
      );
      break;

    case "BLOCK_PROVIDER":
      next.allowedProviders = next.allowedProviders.filter(
        (p) => p !== action.provider,
      );
      if (!next.blockedProviders.includes(action.provider)) {
        next.blockedProviders.push(action.provider);
      }
      if (next.manualProvider === action.provider) {
        next.manualProvider = null;
      }
      break;

    case "SET_MANUAL_PROVIDER":
      next.manualProvider = action.provider;
      break;

    case "APPLY_PRESET":
      next.routingMode = action.preset.policy.routingMode ?? "cloud";
      next.allowedProviders = action.preset.policy.allowedProviders ?? [];
      next.blockedProviders = action.preset.policy.blockedProviders ?? [];
      next.manualProvider = action.preset.policy.manualProvider ?? null;
      next.activePreset = action.preset.name;
      break;

    case "RESET":
      return { ...action.defaultState };
  }

  next.updatedAt = Date.now();
  return sanitizePolicy(next);
}

export function selectCandidates(
  state: PolicyState,
  candidates: ProviderName[],
  request?: string,
): ProviderName[] {
  if (state.routingMode === "local-only") return ["local"];

  let filtered = candidates
    .filter((p) => state.allowedProviders.includes(p))
    .filter((p) => !state.blockedProviders.includes(p));

  // In cloud mode, prefer non-local providers but fall back to local
  // if it's the only remaining candidate (e.g. explicit defaultOrder: ['local']).
  if (state.routingMode === "cloud") {
    const withoutLocal = filtered.filter((p) => p !== "local");
    if (withoutLocal.length > 0) filtered = withoutLocal;
  }

  if (request) {
    const sensitive = detectSensitiveTask(
      typeof request === "string" ? { prompt: request } : request,
    );
    if (sensitive.forceLocal) return ["local"];
    if (sensitive.approvedProvidersOnly?.length) {
      filtered = filtered.filter((p) =>
        sensitive.approvedProvidersOnly!.includes(p),
      );
    }
  }

  if (state.manualProvider && filtered.includes(state.manualProvider)) {
    filtered = [
      state.manualProvider,
      ...filtered.filter((p) => p !== state.manualProvider),
    ];
  }

  return filtered;
}

export function selectPolicyExplanation(
  state: PolicyState,
  request?: string,
): string {
  const parts: string[] = [`Mode: ${state.routingMode}`];
  if (state.activePreset) parts.push(`Preset: ${state.activePreset}`);

  if (request) {
    const sensitive = detectSensitiveTask(
      typeof request === "string" ? { prompt: request } : request,
    );
    if (sensitive.forceLocal) {
      parts.push(`Forced local: ${sensitive.reasons.join(" ")}`);
    }
    if (sensitive.approvedProvidersOnly?.length) {
      parts.push(`Restricted: ${sensitive.approvedProvidersOnly.join(", ")}`);
    }
  }

  if (state.manualProvider) {
    parts.push(`Manual: ${state.manualProvider}`);
  }

  return parts.join(" | ");
}

let state: PolicyState | null = null;

export function initPolicy(initial?: PolicyState) {
  state = initial ?? getProviderPolicy();
  return state;
}

export function dispatch(action: PolicyAction) {
  if (!state) state = getProviderPolicy();
  state = policyReducer(state, action);
  saveProviderPolicy(state);
  return state;
}

export function getState() {
  if (!state) state = getProviderPolicy();
  return state;
}

export function applyPolicyPreset(name: string) {
  const preset = getPolicyPreset(name);
  state = saveProviderPolicy({
    routingMode: preset.policy.routingMode ?? "cloud",
    allowedProviders: preset.policy.allowedProviders ?? [],
    blockedProviders: preset.policy.blockedProviders ?? [],
    manualProvider: preset.policy.manualProvider ?? null,
    activePreset: name,
    updatedAt: Date.now(),
  });
  return state;
}

export function resetProviderPolicy() {
  state = sanitizePolicy({ ...DEFAULT_POLICY, updatedAt: Date.now() });
  writeJsonFile(POLICY_FILE, state);
  logger.info("provider.policy.saved", state);
  return state;
}

export function setRoutingMode(mode: RoutingMode) {
  return dispatch({ type: "SET_ROUTING_MODE", mode });
}

export function blockProvider(provider: string) {
  const providerName = provider as ProviderName;
  if (!ALL_PROVIDERS.includes(providerName)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return dispatch({ type: "BLOCK_PROVIDER", provider: providerName });
}

export function allowProvider(provider: string) {
  const providerName = provider as ProviderName;
  if (!ALL_PROVIDERS.includes(providerName)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return dispatch({ type: "ALLOW_PROVIDER", provider: providerName });
}

export function setManualProvider(provider: string | null) {
  if (provider !== null) {
    const providerName = provider as ProviderName;
    if (!ALL_PROVIDERS.includes(providerName)) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    const current = getState();
    if (current.blockedProviders.includes(providerName)) {
      throw new Error(
        `Cannot set manual provider '${provider}': provider is blocked`,
      );
    }
    return dispatch({ type: "SET_MANUAL_PROVIDER", provider: providerName });
  }

  return dispatch({ type: "SET_MANUAL_PROVIDER", provider: null });
}

export function applyPolicyToCandidates(
  candidates: ProviderName[],
  request?: any,
): ProviderName[] {
  const currentState = getState();
  const prompt = typeof request === "string" ? request : request?.prompt;
  return selectCandidates(currentState, candidates, prompt);
}

export function applyPolicyToCandidatesWithReason(
  candidates: ProviderName[],
  request?: any,
): { candidates: ProviderName[]; policyReason: string } {
  const currentState = getState();
  const prompt = typeof request === "string" ? request : request?.prompt;
  return {
    candidates: selectCandidates(currentState, candidates, prompt),
    policyReason: selectPolicyExplanation(currentState, prompt),
  };
}

export function applyPolicyToCandidatesForWorkspace(
  candidates: ProviderName[],
  request?: any,
): ProviderName[] {
  const workspaceId = request?.workspaceId;
  const { policy } = resolveWorkspacePolicyState(workspaceId);
  const prompt = typeof request === "string" ? request : request?.prompt;
  return selectCandidates(policy, candidates, prompt);
}

export function applyPolicyToCandidatesWithReasonForWorkspace(
  candidates: ProviderName[],
  request?: any,
): {
  candidates: ProviderName[];
  policyReason: string;
  policySource: "global" | "workspace";
} {
  const workspaceId = request?.workspaceId;
  const resolved = resolveWorkspacePolicyState(workspaceId);
  const prompt = typeof request === "string" ? request : request?.prompt;
  const selectedCandidates = selectCandidates(
    resolved.policy,
    candidates,
    prompt,
  );
  const baseReason = selectPolicyExplanation(resolved.policy, prompt);
  return {
    candidates: selectedCandidates,
    policyReason:
      resolved.source === "workspace" && workspaceId
        ? `${baseReason} | Workspace override: ${workspaceId}`
        : baseReason,
    policySource: resolved.source,
  };
}

export const explainRoutingSelection = selectPolicyExplanation;
