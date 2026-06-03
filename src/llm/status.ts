import {
  getProviderHealthSnapshot,
  isProviderAvailable,
  resetProviderHealth,
} from './provider-health';
import { getProviderUsage, resetProviderUsage } from './provider-usage';

const KNOWN_PROVIDERS = ['groq', 'gemini', 'openai', 'perplexity', 'local'];

function envKeyForProvider(provider) {
  switch (provider) {
    case 'groq':
      return 'GROQ_API_KEY';
    case 'gemini':
      return 'GEMINI_API_KEY';
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'perplexity':
      return 'PERPLEXITY_API_KEY';
    case 'local':
      return null;
    default:
      return null;
  }
}

function hasApiKey(provider) {
  const keyName = envKeyForProvider(provider);
  if (!keyName) return true;
  return Boolean(process.env[keyName]);
}

function recordFor(provider, records) {
  return records.find((r) => r.provider === provider);
}

export function getProviderStatus() {
  const healthRecords = getProviderHealthSnapshot();
  const usageRows = getProviderUsage();

  return KNOWN_PROVIDERS.map((name) => {
    const rec = recordFor(name, healthRecords);
    const usage = usageRows.find((u) => u.provider === name);
    const hasKey = hasApiKey(name);
    const available = hasKey && isProviderAvailable(name);

    let recoversInMinutes = null;
    if (rec?.recoversAt) {
      const diffMs = rec.recoversAt - Date.now();
      recoversInMinutes = diffMs > 0 ? Math.round(diffMs / 60000) : 0;
    }

    return {
      name,
      hasKey,
      state: rec ? rec.state : 'unknown',
      available,
      recoversInMinutes,
      reason: rec?.reason,
      requestCount: usage?.requestCount ?? 0,
      successCount: usage?.successCount ?? 0,
      failureCount: usage?.failureCount ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      estimatedCostUsd: usage?.estimatedCostUsd ?? 0,
    };
  });
}

export function resetProviderStatus(provider) {
  resetProviderHealth(provider);
}

export function resetAllProviderTelemetry(provider) {
  resetProviderHealth(provider);
  resetProviderUsage(provider);
}
