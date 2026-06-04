import { readJsonFile, writeJsonFile } from "../llm/storage";
import { logger } from "../shared/logging/logger";

const POLICY_FILE = "provider-policy.json";
const ALL_PROVIDERS = ["groq", "gemini", "openai", "perplexity", "local"];

const DEFAULT_POLICY = {
  routingMode: "cloud",
  allowedProviders: [...ALL_PROVIDERS],
  blockedProviders: [],
  manualProvider: null,
  updatedAt: Date.now(),
};

function normalizeProviders(values) {
  return [...new Set(values)].filter((v) => ALL_PROVIDERS.includes(v));
}

export function getProviderPolicy() {
  const state = readJsonFile(POLICY_FILE, DEFAULT_POLICY);
  return {
    routingMode: state.routingMode ?? "cloud",
    allowedProviders: normalizeProviders(
      state.allowedProviders ?? ALL_PROVIDERS,
    ),
    blockedProviders: normalizeProviders(state.blockedProviders ?? []),
    manualProvider: state.manualProvider ?? null,
    updatedAt: state.updatedAt ?? Date.now(),
  };
}

function saveProviderPolicy(state) {
  const normalized = {
    routingMode: state.routingMode,
    allowedProviders: normalizeProviders(state.allowedProviders),
    blockedProviders: normalizeProviders(state.blockedProviders),
    manualProvider: state.manualProvider ?? null,
    updatedAt: Date.now(),
  };
  writeJsonFile(POLICY_FILE, normalized);
  logger.info("provider.policy.saved", normalized);
  return normalized;
}

export function setRoutingMode(routingMode) {
  const current = getProviderPolicy();

  if (routingMode === "local-only") {
    return saveProviderPolicy({
      ...current,
      routingMode,
      manualProvider: "local",
      allowedProviders: ["local"],
      blockedProviders: current.blockedProviders.filter((p) => p !== "local"),
    });
  }

  return saveProviderPolicy({
    ...current,
    routingMode,
    manualProvider:
      current.manualProvider === "local" && routingMode === "cloud"
        ? null
        : current.manualProvider,
    allowedProviders: [...ALL_PROVIDERS],
  });
}

export function allowProvider(provider) {
  const current = getProviderPolicy();
  return saveProviderPolicy({
    ...current,
    allowedProviders: [...current.allowedProviders, provider],
    blockedProviders: current.blockedProviders.filter((p) => p !== provider),
  });
}

export function blockProvider(provider) {
  const current = getProviderPolicy();
  return saveProviderPolicy({
    ...current,
    allowedProviders: current.allowedProviders.filter((p) => p !== provider),
    blockedProviders: [...current.blockedProviders, provider],
    manualProvider:
      current.manualProvider === provider ? null : current.manualProvider,
  });
}

export function setManualProvider(provider) {
  const current = getProviderPolicy();

  if (provider && current.blockedProviders.includes(provider)) {
    throw new Error(`Provider ${provider} is blocked by policy.`);
  }

  if (provider && !current.allowedProviders.includes(provider)) {
    throw new Error(`Provider ${provider} is not allowed by policy.`);
  }

  return saveProviderPolicy({ ...current, manualProvider: provider ?? null });
}

export function resetProviderPolicy() {
  writeJsonFile(POLICY_FILE, DEFAULT_POLICY);
  logger.info("provider.policy.reset");
  return getProviderPolicy();
}

export function applyPolicyToCandidates(input) {
  const policy = getProviderPolicy();

  if (policy.routingMode === "local-only") {
    return ["local"];
  }

  let candidates = [...input];

  // Cloud mode excludes local provider
  if (policy.routingMode === "cloud") {
    candidates = candidates.filter((p) => p !== "local");
  }

  candidates = candidates.filter((p) => policy.allowedProviders.includes(p));

  candidates = candidates.filter((p) => !policy.blockedProviders.includes(p));

  if (policy.manualProvider && candidates.includes(policy.manualProvider)) {
    return [
      policy.manualProvider,
      ...candidates.filter((p) => p !== policy.manualProvider),
    ];
  }

  return candidates;
}
