import { ProviderName } from "../shared/contracts/provider";
import {
  getProviderHealthSnapshot,
  isProviderAvailable,
  resetProviderHealth,
} from "./provider-health";

const KNOWN_PROVIDERS: ProviderName[] = [
  "groq",
  "gemini",
  "openai",
  "perplexity",
  "local",
];

function envKeyForProvider(provider: ProviderName) {
  switch (provider) {
    case "groq":
      return "GROQ_API_KEY";
    case "gemini":
      return "GEMINI_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "perplexity":
      return "PERPLEXITY_API_KEY";
    case "local":
      return null;
    default:
      return null;
  }
}

function hasApiKey(provider: ProviderName) {
  const keyName = envKeyForProvider(provider);
  if (!keyName) return true;
  return Boolean(process.env[keyName]);
}

function recordFor(
  provider: ProviderName,
  records: Array<{ provider: ProviderName }>,
) {
  return records.find((r) => r.provider === provider);
}

export function getProviderStatus() {
  const records = getProviderHealthSnapshot();

  return KNOWN_PROVIDERS.map((name) => {
    const rec = recordFor(name, records);
    const hasKey = hasApiKey(name);
    const available = hasKey && isProviderAvailable(name);

    let recoversInMinutes: number | null = null;
    if (rec?.recoversAt) {
      const diffMs = rec.recoversAt - Date.now();
      recoversInMinutes = diffMs > 0 ? Math.round(diffMs / 60000) : 0;
    }

    return {
      name,
      hasKey,
      state: rec ? rec.state : "unknown",
      available,
      recoversInMinutes,
      reason: rec?.reason,
    };
  });
}

export function resetProviderStatus(provider: ProviderName) {
  resetProviderHealth(provider);
}
