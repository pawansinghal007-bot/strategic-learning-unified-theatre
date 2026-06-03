import {
  ProviderAuthError,
  ProviderBadResponseError,
  ProviderQuotaError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "./provider.error";

export function normalizeProviderError(
  provider: string,
  error: unknown,
): Error {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("401") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("auth")
  ) {
    return new ProviderAuthError(`${provider}: ${message}`, { provider });
  }

  if (
    lower.includes("429") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("credit")
  ) {
    return new ProviderQuotaError(`${provider}: ${message}`, { provider });
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("abort")
  ) {
    return new ProviderTimeoutError(`${provider}: ${message}`, { provider });
  }

  if (
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("500") ||
    lower.includes("network") ||
    lower.includes("unavailable")
  ) {
    return new ProviderUnavailableError(`${provider}: ${message}`, {
      provider,
    });
  }

  return new ProviderBadResponseError(`${provider}: ${message}`, { provider });
}
