import { logger } from '../shared/logging/logger';
import { readJsonFile, writeJsonFile } from './storage';

const USAGE_FILE = 'provider-usage.json';
const KNOWN_PROVIDERS = ['groq', 'gemini', 'openai', 'perplexity', 'local'];

function loadUsage() {
  return readJsonFile(USAGE_FILE, {});
}

function saveUsage(state: Record<string, any>) {
  writeJsonFile(USAGE_FILE, state);
}

function defaultResetAt(provider: string) {
  const now = new Date();

  if (provider === 'groq' || provider === 'gemini') {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return next.getTime();
  }

  if (provider === 'perplexity') {
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
    logger.info('provider.usage.auto_reset', { provider });
  }
}

export function recordProviderSuccess(provider: string, response: any) {
  const snapshot = loadUsage();
  autoResetIfNeeded(provider, snapshot);
  const rec = ensureRecord(provider, snapshot);

  rec.requestCount += 1;
  rec.successCount += 1;
  rec.inputTokens += response.usage?.inputTokens ?? 0;
  rec.outputTokens += response.usage?.outputTokens ?? 0;
  rec.totalTokens += response.usage?.totalTokens ?? 0;
  rec.estimatedCostUsd += response.usage?.estimatedCostUsd ?? 0;
  rec.lastUsedAt = Date.now();

  saveUsage(snapshot);

  logger.info('provider.usage.success', {
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

  logger.warn('provider.usage.failure', {
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

  saveUsage(snapshot);

  return KNOWN_PROVIDERS.map((provider) => ensureRecord(provider, snapshot));
}

export function resetProviderUsage(provider?: string) {
  if (!provider) {
    saveUsage({});
    logger.info('provider.usage.reset_all');
    return;
  }

  const snapshot = loadUsage();
  delete snapshot[provider];
  saveUsage(snapshot);
  logger.info('provider.usage.reset', { provider });
}
