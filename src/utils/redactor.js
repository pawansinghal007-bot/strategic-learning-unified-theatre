// src/utils/redactor.js
// Scrubs known secret patterns from text before it enters the DB or any
// handoff payload. Keeps this as a pure function for easy unit testing.

/**
 * Remove credential patterns from a string.
 * Returns an empty string for any falsy input.
 *
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function redact(text) {
  if (!text) return "";

  return (
    text
      // Bearer tokens (JWT or opaque).
      .replaceAll(/bearer\s+[\w\-.]+/gi, "Bearer [REDACTED]")
      // sk- prefixed API keys (OpenAI, Anthropic, etc.) — minimum 20 chars.
      .replaceAll(/sk-[a-zA-Z0-9]{20,}/g, "sk-[REDACTED]")
      // Generic key=value / key: value patterns for common secret field names.
      .replaceAll(
        /(password|secret|token|api_key|apikey)(["'\s:=]+)([^"'\s,;]+)/gi,
        "$1$2[REDACTED]",
      )
  );
}
