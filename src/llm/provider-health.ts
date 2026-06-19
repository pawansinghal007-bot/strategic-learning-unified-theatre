import {
  ProviderAuthError,
  ProviderQuotaError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "../shared/errors";
import { logger } from "../shared/logging/logger";
import { readJsonFile, writeJsonFile } from "./storage";

const HEALTH_FILE = "provider-health.json";

const COOLDOWN_MS = {
  healthy: null,
  exhausted: 24 * 60 * 60 * 1000,
  temporarily_down: 5 * 60 * 1000,
  auth_error: null,
};

function loadHealth() {
  return readJsonFile(HEALTH_FILE, {});
}

function saveHealth(state: Record<string, unknown>) {
  writeJsonFile(HEALTH_FILE, state);
}

function stateFromError(err: unknown) {
  if (err instanceof ProviderAuthError) return "auth_error";
  if (err instanceof ProviderQuotaError) return "exhausted";
  if (
    err instanceof ProviderTimeoutError ||
    err instanceof ProviderUnavailableError
  ) {
    return "temporarily_down";
  }

  const code = (err as { code?: unknown })?.code;
  if (code === "PROVIDER_AUTH_FAILED") return "auth_error";
  if (code === "PROVIDER_QUOTA_EXCEEDED") return "exhausted";
  if (code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE") {
    return "temporarily_down";
  }

  return null;
}

export function markProviderFromError(provider: string, err: unknown) {
  const state = stateFromError(err);
  if (!state) return;

  const now = Date.now();
  const cooldown = COOLDOWN_MS[state];
  const recoversAt = cooldown === null ? undefined : now + cooldown;

  const snapshot = loadHealth();
  snapshot[provider] = {
    provider,
    state,
    reason: err.message,
    since: now,
    recoversAt,
  };

  saveHealth(snapshot);

  logger.warn("provider.health.mark", {
    provider,
    state,
    recoversAt,
    reason: err.message,
  });
}

export function markProviderHealthy(provider: string) {
  const snapshot = loadHealth();
  delete snapshot[provider];
  saveHealth(snapshot);
  logger.info("provider.health.healthy", { provider });
}

export function isProviderAvailable(provider: string) {
  const snapshot = loadHealth();
  const record = snapshot[provider] as any;

  if (!record) return true;

  const cooldown = COOLDOWN_MS[record.state];
  if (cooldown == null) {
    return record.state === "healthy";
  }

  if (record.recoversAt && Date.now() > record.recoversAt) {
    delete snapshot[provider];
    saveHealth(snapshot);
    logger.info("provider.health.recovered", { provider });
    return true;
  }

  return false;
}

export function getProviderHealthSnapshot() {
  const snapshot = loadHealth();
  return Object.values(snapshot).filter(Boolean);
}

export function resetProviderHealth(provider?: string) {
  if (!provider) {
    saveHealth({});
    logger.info("provider.health.reset_all");
    return;
  }

  const snapshot = loadHealth();
  delete snapshot[provider];
  saveHealth(snapshot);
  logger.info("provider.health.reset", { provider });
}
