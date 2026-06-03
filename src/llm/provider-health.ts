import { ProviderName } from '../shared/contracts/provider';
import {
  DomainError,
  ProviderAuthError,
  ProviderQuotaError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../shared/errors';
import { logger } from '../shared/logging/logger';

export type ProviderHealthState =
  | 'healthy'
  | 'exhausted'
  | 'temporarily_down'
  | 'auth_error';

export interface ProviderHealthRecord {
  provider: ProviderName;
  state: ProviderHealthState;
  reason?: string;
  since: number;
  recoversAt?: number;
}

const healthState = new Map();

const COOLDOWN_MS = {
  healthy: null,
  exhausted: 24 * 60 * 60 * 1000,
  temporarily_down: 5 * 60 * 1000,
  auth_error: null,
};

function stateFromError(err) {
  if (err instanceof ProviderAuthError) return 'auth_error';
  if (err instanceof ProviderQuotaError) return 'exhausted';
  if (err instanceof ProviderTimeoutError || err instanceof ProviderUnavailableError) {
    return 'temporarily_down';
  }
  return null;
}

export function markProviderFromError(provider, err) {
  if (!(err instanceof DomainError)) return;

  const state = stateFromError(err);
  if (!state) return;

  const now = Date.now();
  const cooldown = COOLDOWN_MS[state];
  const recoversAt = cooldown != null ? now + cooldown : undefined;

  const record = {
    provider,
    state,
    reason: err.message,
    since: now,
    recoversAt,
  };

  healthState.set(provider, record);

  logger.warn('provider.health.mark', {
    provider,
    state,
    recoversAt,
    reason: err.message,
  });
}

export function isProviderAvailable(provider) {
  const record = healthState.get(provider);
  if (!record) return true;

  const cooldown = COOLDOWN_MS[record.state];
  if (cooldown == null) {
    return record.state === 'healthy';
  }

  if (record.recoversAt && Date.now() > record.recoversAt) {
    healthState.delete(provider);
    logger.info('provider.health.recovered', { provider });
    return true;
  }

  return false;
}

export function getProviderHealthSnapshot() {
  return Array.from(healthState.values());
}

export function resetProviderHealth(provider) {
  if (!provider) {
    healthState.clear();
    logger.info('provider.health.reset_all');
    return;
  }
  healthState.delete(provider);
  logger.info('provider.health.reset', { provider });
}
