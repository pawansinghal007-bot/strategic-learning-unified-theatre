// src/limit-detector.js
// Detects session-limit / rate-limit signals from capture payload text.
// The ONLY permitted hardcoded time value in this file is the 60-minute
// fallback window (3,600,000 ms), as defined in the Sprint 14 plan.

const FALLBACK_WINDOW_MS = 60 * 60 * 1000; // 3,600,000 ms — sprint-defined constant

const LIMIT_PHRASES = [
  "usage limit reached",
  "quota exceeded",
  "too many requests",
  "usage cap",
];

/**
 * Inspect a capture payload string for known limit signals.
 *
 * @param {string|null|undefined} payloadText
 * @returns {{ limitHit: boolean, resetTime?: number }}
 */
export function detectLimit(payloadText) {
  if (!payloadText) return { limitHit: false };

  const text = payloadText.toLowerCase();
  const limitHit = LIMIT_PHRASES.some((phrase) => text.includes(phrase));
  if (!limitHit) return { limitHit: false };

  // Attempt to parse a relative reset time: "try again in N minutes".
  const minutesMatch = /try again in (\d+) minute/.exec(text);
  if (minutesMatch) {
    const parsedMs = Number.parseInt(minutesMatch[1], 10) * 60 * 1000;
    return { limitHit: true, resetTime: Date.now() + parsedMs };
  }

  // Fallback: 60-minute window.
  return { limitHit: true, resetTime: Date.now() + FALLBACK_WINDOW_MS };
}
