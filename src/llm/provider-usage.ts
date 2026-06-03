import { logger } from "../shared/logging/logger";

const KNOWN_PROVIDERS = ["groq", "gemini", "openai", "perplexity", "local"];

const usageState = new Map();

function defaultResetAt(provider) {
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

function ensureRecord(provider) {
  const existing = usageState.get(provider);
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

  usageState.set(provider, created);
  return created;
}

function autoResetIfNeeded(provider) {
  const rec = ensureRecord(provider);
  if (rec.resetAt && Date.now() >= rec.resetAt) {
    usageState.set(provider, {
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
    });
    logger.info("provider.usage.auto_reset", { provider });
  }
}

export function recordProviderSuccess(provider, response) {
  autoResetIfNeeded(provider);
  const rec = ensureRecord(provider);

  rec.requestCount += 1;
  rec.successCount += 1;
  rec.inputTokens += response.usage?.inputTokens ?? 0;
  rec.outputTokens += response.usage?.outputTokens ?? 0;
  rec.totalTokens += response.usage?.totalTokens ?? 0;
  rec.estimatedCostUsd += response.usage?.estimatedCostUsd ?? 0;
  rec.lastUsedAt = Date.now();

  logger.info("provider.usage.success", {
    provider,
    requestCount: rec.requestCount,
    totalTokens: rec.totalTokens,
    estimatedCostUsd: rec.estimatedCostUsd,
  });
}

export function recordProviderFailure(provider) {
  autoResetIfNeeded(provider);
  const rec = ensureRecord(provider);

  rec.requestCount += 1;
  rec.failureCount += 1;
  rec.lastUsedAt = Date.now();

  logger.warn("provider.usage.failure", {
    provider,
    requestCount: rec.requestCount,
    failureCount: rec.failureCount,
  });
}

export function getProviderUsage() {
  for (const provider of KNOWN_PROVIDERS) {
    autoResetIfNeeded(provider);
    ensureRecord(provider);
  }
  return KNOWN_PROVIDERS.map((provider) => ensureRecord(provider));
}

export function resetProviderUsage(provider) {
  if (!provider) {
    usageState.clear();
    logger.info("provider.usage.reset_all");
    return;
  }
  usageState.delete(provider);
  logger.info("provider.usage.reset", { provider });
}
