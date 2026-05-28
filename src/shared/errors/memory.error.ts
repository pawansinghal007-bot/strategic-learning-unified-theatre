import { DomainError } from './base';

export class MemoryNotFoundError extends DomainError {
  constructor(message = 'Requested memory item was not found', details?: Record<string, unknown>) {
    super('MEMORY_NOT_FOUND', message, { retryable: false, details });
  }
}

export class MemorySerializationError extends DomainError {
  constructor(message = 'Memory serialization failed', details?: Record<string, unknown>) {
    super('MEMORY_SERIALIZATION_FAILED', message, { retryable: false, details });
  }
}
