# V15 — Outlook OTP Retrieval

**Engine**: N/A (Infrastructure/Platform capability)
**Question**: Does the repo contain IMAP/Graph-API/Outlook email-reading code, or any function that parses an inbox for a one-time code?

## Commands run

```bash
# 1. IMAP/email library references (repo-wide, excluding noise)
grep -rni "imap\|imaplib\|imap-client\|imapx\|imap.*connect\|imap.*login" . \
  --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" \
  --include="*.json" --include="*.md" --include="*.ps1" --include="*.cjs" --include="*.mjs" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv \
  --exclude-dir=coverage --exclude-dir=reports \
  --exclude="electron-ui/main.bundled.cjs" 2>/dev/null | head -50

# 2. Outlook/Microsoft Graph API references (src/ only)
grep -rni "outlook\|graph.microsoft\|microsoft.graph\|graph_api\|graphApi\|azure.*mail\|office365\|o365" \
  src/ --include="*.js" --include="*.ts" --include="*.py" --exclude-dir=node_modules 2>/dev/null | head -80

# 3. parse inbox/read inbox/fetch email functions (src/ only)
grep -rni "parse.*inbox\|read.*inbox\|fetch.*email\|read.*email\|get.*email\|inbox.*code\|email.*parse\|mail.*parse" \
  src/ --include="*.js" --include="*.ts" --include="*.py" --exclude-dir=node_modules 2>/dev/null | head -80

# 4. OTP/verification code references (repo-wide, excluding noise)
grep -rni "otp\|one.time.code\|verification.code\|auth.code\|login.code\|sms.code\|email.code" . \
  --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.json" \
  --include="*.ps1" --include="*.cjs" --include="*.mjs" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv \
  --exclude-dir=coverage --exclude-dir=reports --exclude-dir=dist \
  --exclude-dir=.vscode-test --exclude-dir=playwright-report \
  --exclude="electron-ui/main.bundled.cjs" 2>/dev/null | head -80

# 5. Outlook/Graph API references (repo-wide, excluding noise)
grep -rni "outlook\|graph.microsoft\|microsoft.graph\|graph_api\|graphApi\|azure.*mail\|office365\|o365\|msal\|@microsoft/microsoft-graph" . \
  --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.json" \
  --include="*.ps1" --include="*.cjs" --include="*.mjs" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv \
  --exclude-dir=coverage --exclude-dir=reports --exclude-dir=dist \
  --exclude-dir=.vscode-test --exclude-dir=playwright-report \
  --exclude="electron-ui/main.bundled.cjs" 2>/dev/null | head -80

# 6. parse inbox/read inbox/fetch email functions (repo-wide, excluding noise)
grep -rni "parse.*inbox\|read.*inbox\|fetch.*email\|read.*email\|get.*email\|inbox.*code\|email.*parse\|mail.*parse\|email.*otp\|email.*code\|inbox.*message" . \
  --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.ps1" \
  --include="*.cjs" --include="*.mjs" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv \
  --exclude-dir=coverage --exclude-dir=reports --exclude-dir=dist \
  --exclude-dir=.vscode-test --exclude-dir=playwright-report \
  --exclude="electron-ui/main.bundled.cjs" 2>/dev/null | head -80
```

## Terminal output

**Command 1 — IMAP (repo-wide, filtered)**: 37 matches, all noise:

- `electron-ui/main.bundled.cjs` — `trimaps` (ML image processing, not email)
- `docs/archive/baselines/PROJECT_ARCHITECTURE_BASELINE-*.md` — architecture baseline docs referencing TypeScript's `multiMap` (not email)
- `PROJECT_ARCHITECTURE_BASELINE-2026-06-17T23-57-49.md` — same baseline noise
- No actual IMAP library usage found in any source file.

**Command 2 — Outlook/Graph API (src/ only)**: Zero matches.

**Command 3 — parse inbox/fetch email (src/ only)**: Zero matches.

**Command 4 — OTP/verification code (repo-wide, filtered)**: 79 matches, all noise:

- `coverage-tmp2/coverage-final.json` — coverage data containing `snapshotPath` strings
- `src/browser-bridge.js:203` — `snapshotPath: storageMonitor.snapshotPath` (storage snapshots, not OTP)
- `src/commands/ai.js:39-325` — `aiSnapshotPointerPath()`, `loadSnapshotPointer()`, `snapshotPointer` (Git snapshot tracking, not OTP)
- `src/storage/storage-monitor.js:156-413` — `snapshotPath` (storage snapshot file path, not OTP)
- `src/test-runner.js:97-631` — `robotPath`, `deriveRobotPath`, `resolveRobotPath` (test file paths, not OTP)
- `src/llm/document-ingester.js:411-453` — `ingestFromSnapshot({ snapshotPath })` (document ingestion, not OTP)
- `electron-ui/main.bundled.cjs` — bundled code containing `RestoreSnapshotPending`, `dotProduct`, etc.
- `electron-ui/ipc/capture-handlers.bundled.cjs` — `toDotPath()` (path formatting, not OTP)
- No actual OTP/verification code parsing found.

**Command 5 — Outlook/Graph API (repo-wide, filtered)**: 3 matches, all noise:

- `electron-ui/main.bundled.cjs:193403` — `"YvesBos <yves_bos@outlook.com>"` (an email address in bundled ONNX model contributor list, not API usage)
- `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` — CodeMirror markdown syntax highlighting that happens to parse email addresses in markdown links
- `playwright-report-ui/trace/assets/defaultSettingsView-D31xz8zv.js` — Playwright trace viewer bundled code
- No actual Microsoft Graph API or Outlook integration found.

**Command 6 — parse inbox/fetch email (repo-wide, filtered)**: Large output, all noise:

- `playwright-report-ui/trace/assets/defaultSettingsView-D31xz8zv.js` — Playwright's element state checking, aria parsing, DOM manipulation (contains "message" in generic UI context, not email)
- `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` — CodeMirror markdown tokenizer
- No actual email inbox parsing found.

## Code evidence

No relevant code evidence found. All matches were false positives from:

- Storage snapshot paths (`snapshotPath`) — not OTP codes
- Test runner robot file paths (`robotPath`) — not OTP codes
- Bundled ML model contributor email addresses — not API usage
- CodeMirror markdown email link parsing — not inbox reading
- Playwright trace viewer DOM manipulation — not email retrieval

## Verdict

Missing

## Notes

Zero instances of IMAP libraries, Microsoft Graph API SDK, Outlook email reading, or OTP/verification code parsing exist anywhere in the source code. The only email-related strings are a contributor address in an ONNX model bundle and CodeMirror's markdown email link syntax highlighting. No function in the entire repo reads an inbox, connects to an email server, or extracts a one-time code from messages.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Missing.**

Cleaner searches over `src/`, Electron, renderer, scripts, vscode-extension for IMAP / Outlook / Graph / OTP returned no real inbox-reading or one-time-code parsers (false positives only: `snapshotPath`, npm package names, etc.). No material corrections.
