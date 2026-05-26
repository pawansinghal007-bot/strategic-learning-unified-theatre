/**
 * error.js
 * Domain error class and helpers for structured error handling across process boundaries.
 * Ensures all errors carry proper error codes and domain context.
 */

const DOMAIN_ERROR_CODES = {
  ROTATOR_CONFIG_INVALID: 'ROTATOR_CONFIG_INVALID',
  ROTATOR_CONFIG_MISSING: 'ROTATOR_CONFIG_MISSING',
  ROTATOR_SPRINT_INVALID: 'ROTATOR_SPRINT_INVALID',
  ROTATOR_IDEA_INVALID: 'ROTATOR_IDEA_INVALID',
  ROTATOR_BROWSER_CAPTURE_INVALID: 'ROTATOR_BROWSER_CAPTURE_INVALID',
  ROTATOR_LLM_RECORD_INVALID: 'ROTATOR_LLM_RECORD_INVALID',
  ROTATOR_IPC_PAYLOAD_INVALID: 'ROTATOR_IPC_PAYLOAD_INVALID',
  ROTATOR_ROBOT_RUN_FAILED: 'ROTATOR_ROBOT_RUN_FAILED',
  ROTATOR_CLI_INVALID: 'ROTATOR_CLI_INVALID'
};

/**
 * DomainError represents validation or processing errors within the domain.
 * All errors must have a code from DOMAIN_ERROR_CODES and may include context.
 * Never includes plaintext secrets in message or context.
 */
export class DomainError extends Error {
  /**
   * @param {string} code - One of DOMAIN_ERROR_CODES
   * @param {string} message - Human-readable error description
   * @param {Object} context - Optional context object (must not contain secrets)
   */
  constructor(code, message, context = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context
    };
  }
}

/**
 * Type guard to check if an error is a DomainError.
 * @param {unknown} err - Value to check
 * @returns {boolean}
 */
export function isDomainError(err) {
  return err instanceof DomainError;
}

/**
 * Helper to create ROTATOR_CONFIG_INVALID or ROTATOR_CONFIG_MISSING errors.
 * @param {string} message - Error description
 * @param {Object} context - Optional context
 * @returns {DomainError}
 */
export function createConfigError(message, context = {}) {
  const code = message.toLowerCase().includes('missing')
    ? DOMAIN_ERROR_CODES.ROTATOR_CONFIG_MISSING
    : DOMAIN_ERROR_CODES.ROTATOR_CONFIG_INVALID;
  return new DomainError(code, message, context);
}

/**
 * Helper to create ROTATOR_IPC_PAYLOAD_INVALID errors.
 * @param {string} message - Error description
 * @param {Object} context - Optional context (must not include raw payload with secrets)
 * @returns {DomainError}
 */
export function createIpcPayloadError(message, context = {}) {
  return new DomainError(
    DOMAIN_ERROR_CODES.ROTATOR_IPC_PAYLOAD_INVALID,
    message,
    context
  );
}
