/**
 * Browser-selectors.js
 * Platform-specific CSS selectors and timing configuration for AI response capture.
 * Supports runtime overrides via ~/.vscode-rotator/browser-selectors.json
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Default selectors and timing for each platform.
 * @type {Object.<string, Object>}
 */
const DEFAULT_SELECTORS = {
  chatgpt: {
    responseContainer: 'div[class*="prose"]',
    streamingIndicator: 'button[aria-label*="Stop"]',
    completionDelay: 1500
  },
  claude: {
    responseContainer: 'div[class*="markdown"]',
    streamingIndicator: null,
    completionDelay: 1500
  },
  gemini: {
    responseContainer: 'div[data-message-type="response"]',
    streamingIndicator: null,
    completionDelay: 1500
  },
  perplexity: {
    responseContainer: 'div[class*="answer"]',
    streamingIndicator: null,
    completionDelay: 1500
  }
};

/**
 * Deep merge overrides into defaults.
 * @param {Object} target
 * @param {Object} source
 * @returns {Object}
 */
function deepMerge(target, source) {
  if (!source) return target;
  const result = { ...target };
  for (const key in source) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Load selector overrides from ~/.vscode-rotator/browser-selectors.json if it exists.
 * Performs a deep merge: custom values override defaults.
 * @param {string|null} customPath - Optional path for testing; defaults to ~/.vscode-rotator/browser-selectors.json
 * @returns {Promise<Object>} - Merged selectors object keyed by platform name.
 */
export async function loadOverrides(customPath = null) {
  const defaultPath =
    customPath ||
    path.join(process.env.HOME || os.homedir(), '.vscode-rotator', 'browser-selectors.json');

  try {
    const content = await fs.readFile(defaultPath, 'utf8');
    const overrides = JSON.parse(content);
    
    // Deep merge overrides into defaults for each platform
    const merged = { ...DEFAULT_SELECTORS };
    for (const platform in overrides) {
      if (merged[platform]) {
        merged[platform] = deepMerge(merged[platform], overrides[platform]);
      }
    }
    return merged;
  } catch (err) {
    // If file does not exist or is invalid JSON, return defaults
    if (err.code === 'ENOENT') {
      return DEFAULT_SELECTORS;
    }
    console.warn('[browser-selectors] Failed to load overrides:', err.message);
    return DEFAULT_SELECTORS;
  }
}

/**
 * Get the selector config for a specific platform, optionally with overrides.
 * @param {string} platform - Platform name: 'chatgpt', 'claude', 'gemini', or 'perplexity'
 * @param {Object|null} mergedConfig - Pre-loaded merged config (optional optimization)
 * @returns {Object|null} - Selector config for the platform, or null if not found
 */
export function getSelectors(platform, mergedConfig = null) {
  const config = mergedConfig || DEFAULT_SELECTORS;
  return config[platform] || null;
}

/**
 * Export the default selectors as a frozen object.
 * This is used by preload-browser.cjs to detect platforms inline.
 */
export const SELECTORS = Object.freeze(DEFAULT_SELECTORS);

export default SELECTORS;
