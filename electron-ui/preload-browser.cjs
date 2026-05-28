/**
 * preload-browser.cjs
 * Preload script for embedded browser panes.
 * Runs with contextIsolation: true, nodeIntegration: false.
 * Captures AI responses when they complete streaming.
 */

const { ipcRenderer } = require('electron');

// Inline selector config (embedded to avoid requiring from page context)
const INLINE_SELECTORS = {
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
 * Detect platform from window.location.hostname
 * @returns {string|null} - Platform name or null if not detected
 */
function detectPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('openai.com') || hostname.includes('chat.openai.com')) {
    return 'chatgpt';
  }
  if (hostname.includes('claude.ai')) {
    return 'claude';
  }
  if (hostname.includes('gemini.google.com') || hostname.includes('google.com')) {
    return 'gemini';
  }
  if (hostname.includes('perplexity.ai')) {
    return 'perplexity';
  }
  return null;
}

/**
 * Get selector config for the detected platform
 * @param {string} platform
 * @returns {Object|null}
 */
function getSelectors(platform) {
  return INLINE_SELECTORS[platform] || null;
}

/**
 * Check if a response element has already been captured
 * @param {Element} el
 * @returns {boolean}
 */
function isAlreadyCaptured(el) {
  return el.getAttribute('data-captured') === 'true';
}

/**
 * Mark a response element as captured
 * @param {Element} el
 */
function markCaptured(el) {
  el.setAttribute('data-captured', 'true');
}

/**
 * Check if streaming is still in progress (if a streaming indicator is defined)
 * @param {string|null} streamingIndicatorSelector
 * @returns {boolean} - true if streaming is still active, false otherwise
 */
function isStillStreaming(streamingIndicatorSelector) {
  if (!streamingIndicatorSelector) {
    return false; // No streaming indicator defined; assume not streaming
  }
  return !!document.querySelector(streamingIndicatorSelector);
}

/**
 * Capture and send a response
 * @param {Element} responseEl
 * @param {string} platform
 */
function captureResponse(responseEl, platform) {
  if (isAlreadyCaptured(responseEl)) {
    return; // Already captured
  }

  const payload = {
    platform,
    html: responseEl.innerHTML,
    text: responseEl.innerText,
    url: window.location.href,
    ts: Date.now()
  };

  markCaptured(responseEl);
  ipcRenderer.send('capture:response', payload);
}

/**
 * Set up MutationObserver to detect response completion and capture
 * @param {string} platform
 * @param {Object} selectors
 */
function setupObserver(platform, selectors) {
  const { responseContainer, streamingIndicator, completionDelay } = selectors;

  let observerActive = true;
  const observer = new MutationObserver(() => {
    if (!observerActive) return;

    // Check if response container exists
    const responseEl = document.querySelector(responseContainer);
    if (!responseEl) {
      return; // Not yet visible
    }

    if (isAlreadyCaptured(responseEl)) {
      return; // Already captured
    }

    // If streaming indicator is defined, check if streaming is still active
    if (streamingIndicator) {
      if (isStillStreaming(streamingIndicator)) {
        return; // Still streaming, wait
      }
      // Streaming has stopped; capture after a short delay to ensure content is stable
      observerActive = false;
      setTimeout(() => {
        captureResponse(responseEl, platform);
        observerActive = true;
      }, completionDelay);
    } else {
      // No streaming indicator; use fixed delay as fallback
      observerActive = false;
      setTimeout(() => {
        captureResponse(responseEl, platform);
        observerActive = true;
      }, completionDelay);
    }
  });

  const observerConfig = {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: false,
    attributes: true,
    attributeFilter: ['class', 'data-message-type', 'aria-label']
  };

  observer.observe(document.body, observerConfig);
  return observer;
}

/**
 * Initialize the capture system on DOMContentLoaded
 */
function init() {
  const platform = detectPlatform();
  if (!platform) {
    console.warn('[preload-browser] Could not detect platform from hostname:', window.location.hostname);
    return;
  }

  const selectors = getSelectors(platform);
  if (!selectors) {
    console.warn('[preload-browser] No selectors defined for platform:', platform);
    return;
  }

  setupObserver(platform, selectors);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
