export type DomainErrorCode =
  | "PROVIDER_QUOTA_EXCEEDED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_BAD_RESPONSE"
  | "ROUTING_NO_PROVIDER"
  | "ROUTING_POLICY_BLOCKED"
  | "MEMORY_NOT_FOUND"
  | "MEMORY_SERIALIZATION_FAILED"
  | "VALIDATION_FAILED"
  | "UNKNOWN_ERROR";

export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: DomainErrorCode,
    message: string,
    options?: { retryable?: boolean; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
}
