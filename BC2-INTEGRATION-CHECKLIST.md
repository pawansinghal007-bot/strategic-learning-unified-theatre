# Browser Capture v2 Integration Checklist

## ✅ System Status (May 23, 2026)

- [x] Flask API running on `http://localhost:7070`
- [x] SQLite database initialized at `~\AppData\Roaming\BrowserCapture\capture.db`
- [x] Native host manifests configured for Firefox and Brave
- [x] Python dependencies installed (argon2-cffi, flask, flask-cors)
- [ ] Browser extension loaded in Firefox or Brave
- [ ] Browser extension connected to native host
- [ ] Test message sent in ChatGPT / Claude / Gemini / Perplexity
- [ ] Events captured in database (verified via curl)
- [ ] Ollama running locally (optional for inference)
- [ ] /ollama/ask endpoint responding with LLM answers

---

## 📝 Verification Steps

### Phase 1: Extension Setup (Do This First)

```powershell
# 1. Load extension in Firefox
# Go to: about:debugging
# Click: This Firefox → Load Temporary Add-on
# Select: C:\SW Development\VS Code Agent\files\bc2-firefox\extension\firefox\manifest.json

# 2. Load extension in Brave (or skip if using Firefox only)
# Go to: brave://extensions
# Enable: Developer mode (top-right toggle)
# Click: Load unpacked
# Select: C:\SW Development\VS Code Agent\files\bc2-brave\extension\brave

# 3. For Brave, update the native host manifest with your extension ID
# Get extension ID from: brave://extensions (find "Browser Capture" entry)
# Edit: C:\SW Development\VS Code Agent\files\bc2-native-host\native-host\brave_host_manifest.json
# Replace: YOUR_BRAVE_EXTENSION_ID with actual ID from step above
```

### Phase 2: Capture Browser Activity

```
1. Open ChatGPT (https://chat.openai.com) or Claude (https://claude.ai)
2. Click the extension icon in your browser toolbar
3. Create an account or log in
4. Send a test message like: "Hello, this is a test"
5. Wait for the response to complete
6. Check the extension popup for capture status
```

### Phase 3: Verify Data in Database

```powershell
# Test API health
curl http://localhost:7070/health

# Query captured events
curl "http://localhost:7070/events?limit=10"

# Get event statistics
curl "http://localhost:7070/events/stats"

# Get recent context (formatted for LLM)
curl "http://localhost:7070/events/recent-context?n=5"

# Full-text search
curl "http://localhost:7070/events/search?q=hello"
```

Expected response format:
```json
[
  {
    "id": 1,
    "event_type": "page_visit",
    "timestamp": "2026-05-23T12:34:56.789Z",
    "browser": "brave",
    "tab_url": "https://chat.openai.com",
    "captured_text": "Chat started",
    "llm_summary": null
  },
  {
    "id": 2,
    "event_type": "message_sent",
    "timestamp": "2026-05-23T12:35:10.123Z",
    "browser": "brave",
    "tab_url": "https://chat.openai.com",
    "captured_text": "Hello, this is a test",
    "llm_summary": "User sent test message"
  }
]
```

### Phase 4: Test LLM Integration (Optional)

```powershell
# Start Ollama locally (in a separate terminal)
ollama serve

# In another terminal, test the /ollama/ask endpoint
curl -X POST http://localhost:7070/ollama/ask `
  -H "Content-Type: application/json" `
  -d '{"question": "What was the user doing recently?", "context_n": 10}'

# Expected response:
# {
#   "question": "What was the user doing recently?",
#   "context": "[formatted context from recent events]",
#   "answer": "[Ollama response based on context]"
# }
```

---

## 🔧 Troubleshooting

### Flask API returns 500 errors

**Symptom:** `curl http://localhost:7070/events` returns 500 Internal Server Error

**Solution:**
1. Check the terminal where `api.py` is running
2. Look for Python/SQLite error messages
3. Verify database schema is initialized (ensure native host has run at least once)
4. If schema is missing:
   - Delete: `C:\Users\PawanSinghal\AppData\Roaming\BrowserCapture\capture.db`
   - Run the browser extension again (it will reinitialize)
   - Then restart Flask API

### Extension doesn't connect to native host

**Symptom:** Extension popup shows "Disconnected" or "Failed to connect"

**Solution:**
1. Verify extension ID in browser settings
   - Firefox: about:debugging
   - Brave: brave://extensions
2. Ensure native host manifest matches extension ID:
   - Firefox: `files/bc2-firefox/extension/firefox/manifest.json`
   - Brave: Update `files/bc2-native-host/native-host/brave_host_manifest.json` with correct ID
3. Run `install.bat` again after updating manifests
4. Restart the browser and reload extension

### No events captured

**Symptom:** Database is empty or no events show up

**Solution:**
1. Verify extension is loaded and enabled
2. Check browser console (F12) for JavaScript errors
3. Navigate to ChatGPT/Claude/Gemini/Perplexity
4. Send a message and wait for response to complete
5. Check extension popup for status/errors
6. Query API: `curl http://localhost:7070/events/stats`

### Ollama endpoint returns error

**Symptom:** `curl -X POST http://localhost:7070/ollama/ask` returns 500 or timeout

**Solution:**
1. Verify Ollama is running: `ollama serve` in terminal
2. Check Ollama is accessible: `curl http://localhost:11434/api/tags`
3. Ensure model is installed: `ollama list`
4. If model missing: `ollama pull llama3`
5. Wait for model to download (2-5 GB depending on internet)

---

## 📊 Success Indicators

When all of these work, your integration is complete:

- [ ] Extension loads without errors in Firefox or Brave
- [ ] Extension popup shows "Connected" status
- [ ] Can create account or log in via extension popup
- [ ] API `/health` endpoint returns 200 OK
- [ ] API `/events` endpoint returns captured events (200 OK, array of objects)
- [ ] API `/events/stats` shows event counts
- [ ] API `/events/recent-context` returns formatted chat history
- [ ] Can search events via `/events/search?q=...`
- [ ] Can ask Ollama via `/ollama/ask` endpoint (optional)

---

## 🎯 What's Next

1. **Implement Application Integration**
   - Wire `/events/recent-context` output into your app's prompt generation
   - Include captured browser history when sending requests to online LLMs

2. **Build Feedback Loop**
   - Store responses back in database for learning
   - Tag responses as good/bad
   - Use tags to improve future prompts

3. **Enable Local LLM Learning**
   - Export quality examples from database
   - Fine-tune local LLM on captured interactions
   - Use improved local LLM for better prompt generation

4. **Close the Loop**
   - Every online LLM conversation trains your local LLM
   - Every local LLM improvement enhances your next online conversation
   - System gets smarter with each interaction

---

## 📞 Questions?

Refer to:
- Integration test script: `Solution/test-bc2-integration.js`
- Integration guide: `Solution/BC2-INTEGRATION-GUIDE.js`
- Master instructions: `strategic-learning-unified-theatre-master-instructions.md`
- Browser extension code: `files/bc2-*/extension/*/`
- Native host code: `files/bc2-native-host/native-host/`
- Flask API code: `files/bc2-native-host/db-api/api.py`
