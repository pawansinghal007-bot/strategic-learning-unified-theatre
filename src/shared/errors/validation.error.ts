import { DomainError } from './base';

export class ValidationFailedError extends DomainError {
  constructor(message = 'Schema validation failed', details?: Record<string, unknown>) {
    super('VALIDATION_FAILED', message, { retryable: false, details });
  }
}
