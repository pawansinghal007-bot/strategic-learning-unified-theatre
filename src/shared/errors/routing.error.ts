import { DomainError } from './base';

export class RoutingNoProviderError extends DomainError {
  constructor(message = 'No eligible provider found', details?: Record<string, unknown>) {
    super('ROUTING_NO_PROVIDER', message, { retryable: false, details });
  }
}

export class RoutingPolicyBlockedError extends DomainError {
  constructor(message = 'Routing blocked by policy', details?: Record<string, unknown>) {
    super('ROUTING_POLICY_BLOCKED', message, { retryable: false, details });
  }
}
