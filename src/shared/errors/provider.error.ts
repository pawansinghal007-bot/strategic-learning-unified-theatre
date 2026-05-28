import { DomainError } from "./base";

export class ProviderQuotaError extends DomainError {
  constructor(
    message = "Provider quota exceeded",
    details?: Record<string, unknown>,
  ) {
    super("PROVIDER_QUOTA_EXCEEDED", message, { retryable: true, details });
  }
}

export class ProviderAuthError extends DomainError {
  constructor(
    message = "Provider authentication failed",
    details?: Record<string, unknown>,
  ) {
    super("PROVIDER_AUTH_FAILED", message, { retryable: false, details });
  }
}

export class ProviderTimeoutError extends DomainError {
  constructor(
    message = "Provider request timed out",
    details?: Record<string, unknown>,
  ) {
    super("PROVIDER_TIMEOUT", message, { retryable: true, details });
  }
}

export class ProviderUnavailableError extends DomainError {
  constructor(
    message = "Provider unavailable",
    details?: Record<string, unknown>,
  ) {
    super("PROVIDER_UNAVAILABLE", message, { retryable: true, details });
  }
}

export class ProviderBadResponseError extends DomainError {
  constructor(
    message = "Provider returned an invalid response",
    details?: Record<string, unknown>,
  ) {
    super("PROVIDER_BAD_RESPONSE", message, { retryable: false, details });
  }
}
