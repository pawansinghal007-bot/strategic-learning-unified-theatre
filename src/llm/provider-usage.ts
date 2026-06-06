import { logger } from "../shared/logging/logger";
import { readJsonFile, writeJsonFile } from "./storage";

const USAGE_FILE = "provider-usage.json";
const KNOWN_PROVIDERS = ["groq", "gemini", "openai", "perplexity", "local"];

let _cache: Record<string, any> | null = null;

function loadUsage(): Record<string, any> {
  if (_cache) return _cache;
  _cache = readJsonFile(USAGE_FILE, {});
  return _cache;
}

function saveUsage(state: Record<string, any>) {
  _cache = state;
  writeJsonFile(USAGE_FILE, state);
}

function defaultResetAt(provider: string) {
  const now = new Date();
  if (provider === "groq" || provider === "gemini") {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return next.getTime();
  }
  if (provider === "perplexity") {
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );
    return next.getTime();
  }
  return null;
}

function ensureRecord(provider: string, state: Record<string, any>) {
  const existing = state[provider];
  if (existing) return existing;
  const created = {
    provider,
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    resetAt: defaultResetAt(provider),
  };
  state[provider] = created;
  return created;
}

function autoResetIfNeeded(provider: string, state: Record<string, any>) {
  const rec = ensureRecord(provider, state);
  if (rec.resetAt && Date.now() >= rec.resetAt) {
    state[provider] = {
      provider,
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      lastUsedAt: undefined,
      resetAt: defaultResetAt(provider),
    };
    logger.info("provider.usage.auto_reset", { provider });
  }
}

export function recordProviderSuccess(provider: string, response: any) {
  const snapshot = loadUsage();
  autoResetIfNeeded(provider, snapshot);
  const rec = ensureRecord(provider, snapshot);
  const usage = response?.usage ?? {};
  const inputTokens =
    usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens ?? 0;
  const outputTokens =
    usage.outputTokens ??
    usage.completionTokens ??
    usage.completion_tokens ??
    0;
  const totalTokens =
    usage.totalTokens ?? usage.total_tokens ?? inputTokens + outputTokens;
  const estimatedCostUsd = usage.estimatedCostUsd ?? usage.costUsd ?? 0;
  rec.requestCount += 1;
  rec.successCount += 1;
  rec.inputTokens += inputTokens;
  rec.outputTokens += outputTokens;
  rec.totalTokens += totalTokens;
  rec.estimatedCostUsd += estimatedCostUsd;
  rec.lastUsedAt = Date.now();
  saveUsage(snapshot);
  logger.info("provider.usage.success", {
    provider,
    requestCount: rec.requestCount,
    totalTokens: rec.totalTokens,
    estimatedCostUsd: rec.estimatedCostUsd,
  });
}

export function recordProviderFailure(provider: string) {
  const snapshot = loadUsage();
  autoResetIfNeeded(provider, snapshot);
  const rec = ensureRecord(provider, snapshot);
  rec.requestCount += 1;
  rec.failureCount += 1;
  rec.lastUsedAt = Date.now();
  saveUsage(snapshot);
  logger.warn("provider.usage.failure", {
    provider,
    requestCount: rec.requestCount,
    failureCount: rec.failureCount,
  });
}

export function getProviderUsage() {
  const snapshot = loadUsage();
  for (const provider of KNOWN_PROVIDERS) {
    autoResetIfNeeded(provider, snapshot);
    ensureRecord(provider, snapshot);
  }
  // No saveUsage here — read-only operation, avoids polluting storage
  // with zero-initialized records during passive reads.
  return KNOWN_PROVIDERS.map((provider) => ensureRecord(provider, snapshot));
}

export function resetProviderUsage(provider?: string) {
  if (!provider) {
    _cache = {};
    saveUsage({});
    logger.info("provider.usage.reset_all");
    return;
  }
  const snapshot = loadUsage();
  delete snapshot[provider];
  _cache = snapshot;
  saveUsage(snapshot);
  logger.info("provider.usage.reset", { provider });
}
