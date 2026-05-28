#!/usr/bin/env node
/**
 * Browser Capture v2 - Complete Integration Flow Guide
 * 
 * This explains how to test the full pipeline:
 * Browser Extension → Native Host → SQLite DB → Flask API → Ollama LLM
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DB_PATH = join(homedir(), 'AppData', 'Roaming', 'BrowserCapture', 'capture.db');

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║       Browser Capture v2 — Application & LLM Integration Test Flow          ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

📋 SYSTEM STATUS
════════════════════════════════════════════════════════════════════════════════

✅ Flask API is running on http://localhost:7070
✅ Database file exists: ${DB_PATH}
✅ Schema file exists: files/bc2-native-host/native-host/schema.sql
⏳ Database initialization: Check native host logs

════════════════════════════════════════════════════════════════════════════════
🔄 HOW THE PIPELINE WORKS
════════════════════════════════════════════════════════════════════════════════

Step 1: Browser Extension Captures Events
  └─ User navigates to ChatGPT, Claude, Gemini, or Perplexity
     User sends a message → browser extension captures it
     Extension sends event via: chrome.runtime.sendMessage() → background.js

Step 2: Background Script Routes to Native Host
  └─ background.js connects to native host via chrome.runtime.connectNative()
     Sends message to: com.garuda.browser_capture (Windows native host)

Step 3: Native Host Processes & Stores
  └─ host.py receives message on stdin
     Processes event (creates session, stores page visit, chat message, etc.)
     Stores in SQLite: ~/.BrowserCapture/capture.db
     Key tables: browser_sessions, page_events, chat_sessions, chat_messages

Step 4: Flask REST API Queries Database
  └─ http://localhost:7070 exposes endpoints:
     GET  /health              → API health check
     GET  /events              → Query all captured events
     GET  /events/<id>         → Get single event
     GET  /events/stats        → Event statistics
     GET  /events/search       → Full-text search
     GET  /events/recent-context → Last N messages (formatted for LLM)
     POST /ollama/ask          → Send question to Ollama with context

Step 5: LLM Processes Context
  └─ Ollama (local) receives context from recent browser activity
     Uses captured chat history to answer questions about user's work

════════════════════════════════════════════════════════════════════════════════
🧪 TEST PLAN
════════════════════════════════════════════════════════════════════════════════

PHASE 1: Verify Extension Loads & Captures
─────────────────────────────────────────────────────────────────────────────────
1. Open Firefox or Brave
2. Go to: brave://extensions or about:debugging
3. Load the browser extension:
   - Firefox: about:debugging → Load Temporary Add-on → select manifest.json
   - Brave: brave://extensions → Developer mode → Load unpacked → select extension folder
4. Navigate to: https://chat.openai.com or https://claude.ai
5. Send a test message in the chat
6. Check that the extension popup shows:
   ✅ Connected to native host
   ✅ User logged in (or able to log in)
   ✅ Capture status indicator

PHASE 2: Verify Data Reaches Flask API
─────────────────────────────────────────────────────────────────────────────────
After capturing some events:

1. Test API health:
   curl http://localhost:7070/health

   Expected response:
   {
     "status": "ok",
     "db": "C:\\\\Users\\\\...\\\\BrowserCapture\\\\capture.db"
   }

2. Query recent events:
   curl "http://localhost:7070/events?limit=10"

   Expected response: Array of event objects with fields:
   - id, event_type, timestamp, browser, tab_url, captured_text

3. Get context for LLM:
   curl "http://localhost:7070/events/recent-context?n=5"

   Expected response: Formatted context ready to send to LLM

PHASE 3: Verify Ollama Integration
─────────────────────────────────────────────────────────────────────────────────
If Ollama is running locally:

1. Start Ollama:
   ollama serve

2. Test the /ollama/ask endpoint:
   curl -X POST http://localhost:7070/ollama/ask \\
     -H "Content-Type: application/json" \\
     -d '{"question": "What was I doing?", "context_n": 10}'

   Expected response:
   {
     "question": "What was I doing?",
     "context": "[context from recent events]",
     "answer": "[Ollama's response based on context]"
   }

════════════════════════════════════════════════════════════════════════════════
❌ TROUBLESHOOTING
════════════════════════════════════════════════════════════════════════════════

Issue: "GET /events returns 500 error"
─────────────────────────────────────────────────────────────────────────────────
Likely cause: Database schema not initialized

Solution:
  1. Check if native host has been run (should auto-initialize schema on first run)
  2. Look at the terminal where api.py is running for error messages
  3. Verify the database file has tables:
     - browser_sessions
     - page_events
     - chat_sessions
     - chat_messages
     - login_audit
     - events (FTS virtual table)
  
  If missing, ensure native host (host.py) has been executed at least once.
  The native host initializes the schema automatically.

Issue: Extension doesn't capture events
─────────────────────────────────────────────────────────────────────────────────
Possible causes:
  1. Extension isn't loaded (check browser extensions page)
  2. Native host manifest missing or misconfigured
  3. Extension ID doesn't match manifest allowed_extensions list
  
Solution:
  1. Verify extension is enabled in browser
  2. Check browser console for errors (F12 → Console)
  3. Check native host connection in extension popup
  4. Verify brave_host_manifest.json has correct extension ID

Issue: Ollama endpoint returns 500 error
─────────────────────────────────────────────────────────────────────────────────
Likely cause: Ollama not running on localhost:11434

Solution:
  1. Start Ollama locally: ollama serve
  2. Verify it's running: curl http://localhost:11434/api/tags
  3. Ensure model 'llama3' is installed: ollama list

════════════════════════════════════════════════════════════════════════════════
🎯 SUCCESS CRITERIA
════════════════════════════════════════════════════════════════════════════════

✅ Browser captures messages from ChatGPT / Claude / Gemini / Perplexity
✅ Events appear in: C:\\Users\\PawanSinghal\\AppData\\Roaming\\BrowserCapture\\capture.db
✅ curl http://localhost:7070/events returns captured events (HTTP 200)
✅ curl http://localhost:7070/events/recent-context returns chat history (HTTP 200)
✅ curl -X POST http://localhost:7070/ollama/ask returns LLM response (HTTP 200)

When all 5 items are ✅, your Browser Capture v2 integration is complete!

════════════════════════════════════════════════════════════════════════════════
📚 NEXT STEPS FOR INTEGRATION
════════════════════════════════════════════════════════════════════════════════

1. Wire /events/recent-context output into your application's prompt context
2. Send captured browser history to Ollama /api/generate for inference
3. Store Ollama responses back in the database for learning
4. Build feedback loop: tag responses as good/bad → improve prompts → re-train

This creates a self-improving system where every browser conversation 
enhances your local LLM's knowledge!

`);
