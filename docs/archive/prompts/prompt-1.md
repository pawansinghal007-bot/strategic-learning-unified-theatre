refer Architecture summary across sprints in folder E:\VS Code Agent\Solution before development 
 sprint 1 — foundation: account store + CLI skeleton 
 node.js · encrypted file store · CLI scaffolding 
 ≈130K tokens 
 estimated token usage 
 130K / 150K 
 deliverables 
 store.js 
 cli.js 
 schema.json 
 encrypt.js 
 package.json 
 tasks 
 scaffold node.js project with commander CLI and chalk for output 
 design account schema: {id, email, agentType, authBlob, cooldownUntil, lastUsed, status} 
 implement AES-256 encrypted JSON store at ~/.vscode-rotator/accounts.enc 
 CLI commands: add, list, remove, status (dry-run only in this sprint) 
 file-permission hardening: chmod 600 on store file at creation 
 write unit tests for store CRUD and encryption round-trip 
 README with install instructions and command reference 
 sprint prompt (paste into claude code) 
 You are building "strategic-learning-unified-theatre", a Node.js CLI tool for hands-free VS Code account rotation. 
 
 SPRINT 1 SCOPE — account store + CLI skeleton. 
 
 Constraints: 
 • Node.js >=18, ESM modules, no build step required 
 • Store path: ~/.vscode-rotator/accounts.enc (AES-256-GCM, key derived from machine-id via crypto.scryptSync; maintained for Strategic Learning Unified Theatre backward compatibility) 
 • CLI framework: commander@^12 
 • Output: chalk@^5 (colour), ora@^8 (spinner) 
 • Zero external network calls in this sprint 
 
 Deliverables (create each file): 
 1. src/store.js     — AccountStore class: add(account), list(), get(id), remove(id), update(id, patch), all returning plain JS objects; persist to disk after every mutation 
 2. src/encrypt.js   — encrypt(plaintext) → {iv, tag, ciphertext}; decrypt({iv,tag,ciphertext}) → plaintext; key from machineId 
 3. src/cli.js       — commander root; sub-commands: add (prompts email, agentType, pasteAuthBlob), list (table view), remove , status 
 4. src/schema.js    — zod@^3 AccountSchema with fields: id (nanoid), email, agentType (enum: vscode|codex|trae|other), authBlob (string), cooldownUntil (Date|null), lastUsed (Date|null), status (enum: active|cooldown|retired) 
 5. package.json     — scripts: start, test; bin entry "strategic-learning-unified-theatre" 
 6. tests/store.test.js — vitest unit tests: add/list/remove round-trip; encryption idempotence 
 
 Do not implement switcher, watcher, or VS Code automation yet. Stub those as TODO comments. 
 Output all files with full implementation. No placeholders.
