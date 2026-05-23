// ── Background / Service Worker v2 (fixed auth routing) ──

const NATIVE_HOST = 'com.garuda.browser_capture';

let port = null;
const msgQueue = [];
// requestId -> sendResponse callback
const pendingCallbacks = new Map();

// ── Connect to native host ──
function connectHost() {
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST);

    port.onMessage.addListener((response) => {
      console.log('[BC] Host response:', JSON.stringify(response));
      // Route auth responses back to waiting popup
      const id = response._requestId;
      if (id && pendingCallbacks.has(id)) {
        pendingCallbacks.get(id)(response);
        pendingCallbacks.delete(id);
      }
    });

    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message;
      console.warn('[BC] Host disconnected:', err);
      port = null;
      setTimeout(connectHost, 3000);
    });

    // Flush queued events
    while (msgQueue.length) sendToHost(msgQueue.shift());
    console.log('[BC] Native host connected');

  } catch (e) {
    console.error('[BC] Connect failed:', e);
    setTimeout(connectHost, 3000);
  }
}

function sendToHost(msg) {
  if (!port) {
    if (msgQueue.length < 200) msgQueue.push(msg);
    return;
  }
  try {
    port.postMessage(msg);
  } catch (e) {
    console.error('[BC] postMessage failed:', e);
    port = null;
    msgQueue.push(msg);
    connectHost();
  }
}

// ── Message listener ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  const event = {
    ...msg,
    browser: 'brave',
    tabId:   sender.tab?.id ?? null
  };

  // Auth requests: need to wait for host response and relay back to popup
  if (msg.type === 'create_user' || msg.type === 'login') {
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    event._requestId = requestId;

    // Store callback BEFORE sending
    pendingCallbacks.set(requestId, (res) => {
      console.log('[BC] Sending auth response to popup:', JSON.stringify(res));
      sendResponse(res);
    });

    // Timeout fallback — don't leave popup hanging forever
    setTimeout(() => {
      if (pendingCallbacks.has(requestId)) {
        pendingCallbacks.delete(requestId);
        sendResponse({ error: 'Host timeout — check host.log for errors' });
      }
    }, 8000);

    sendToHost(event);
    return true; // MUST return true to keep sendResponse channel open
  }

  // Regular events — fire and forget
  sendToHost(event);
  return false;
});

connectHost();
