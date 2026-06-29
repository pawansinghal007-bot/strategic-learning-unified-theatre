# Beginner Guide: Accounts & Switching (Electron‑First)

This guide shows how to **add** and **switch** accounts entirely from the Electron UI, then explains where CLI and backend fit in.

---

## 1. What “Accounts” Mean In This App

In this project, an account is a secure entry that holds:

- Email (who the account belongs to)
- Agent type (e.g. `vscode`, `github`, `codex`, `trae`)
- Auth blob (credentials stored in a secret store, not plain text)

Think of each account as a “login card” the app can pick when it needs to talk to VS Code, GitHub, or another tool.

---

## 2. High‑Level Architecture (Simple Mental Model)

There are three layers:

- **Electron UI (Renderer)** – Accounts screen, user clicks.
- **IPC Handlers (Main process)** – named channels like `accounts:list`, `accounts:add`, `switcher:switch`.
- **Backend modules** – `AccountStore`, `SecretStoreClass`, `SwitcherService`, `probeAccount`.

Electron and CLI both talk to the same backend; only the “front end” changes.

---

## 3. Using The Electron UI

### 3.1 Open The Accounts Screen

1. Start the Electron app.
2. Use the sidebar or navigation to open the **Accounts** view (implemented in `renderer/screens/Accounts.jsx`).
3. The screen shows a table/list of accounts; it may be empty on first run.

Under the hood, the renderer calls IPC handlers like `accounts:list` or `accounts:listDetails` to fetch data from `AccountStore`.

---

### 3.2 Add A New Account

1. In the Accounts screen, click **“Add account”** (or the equivalent button).
2. Fill in the fields:
   - Email – e.g. `dev@example.com`
   - Agent type – e.g. `vscode`, `github`, `codex`, `trae`
   - Auth blob – captured credentials/token for that agent

3. Click **Save** / **Create**.

Behind the scenes:

- Renderer calls `ipcMain.handle("accounts:add", accountPayload)` or `accounts:capture` if using an interactive capture flow.
- The handler:
  - Validates email and authBlob.
  - Stores the auth blob securely via `SecretStoreClass` (the implementation behind the secret store).
  - Adds a record in `AccountStore` with status `"active"`, no cooldown, no `lastUsed` yet.

The UI refreshes the list and shows the new account row.

Beginner check:  
You should now see the account with your email and agent type in the Accounts table.

---

### 3.3 Switch To That Account

1. In the Accounts screen, select the newly created account row.
2. Click the **“Switch”** action for that row.

The renderer sends an IPC call:

- `ipcMain.handle("switcher:switch", id)` using the selected account id.

The backend `SwitcherService.switch(id, { dryRun: false })` then:

- Loads the account from `AccountStore`.
- Resolves auth path and login details (via `accounts:health` / `probeAccount` and `resolveAuthPath`).
- Builds a rotation plan (what to restart, which profile to bind, cooldown logic).
- Executes the plan, updates `lastUsed`, `cooldownUntil`, and `status` in `AccountStore`.
- Logs rotation events for auditing and debug.

From the user’s perspective, you’ll typically see:

- A spinner or progress log (“Validating account”, “Applying rotation plan”, “Switch complete”).
- The Accounts list refreshed to show the switched account as most recently used or active.

---

### 3.4 Optional: Check Health/Info

To understand what you’re switching to:

1. On the Accounts screen, use a **“Health”** or **“Info”** action for the account.
2. Renderer calls IPC `accounts:health` or `accounts:info`.

Backend responds with:

- Auth path location and whether it exists.
- Login URL for the agent type.
- Flags such as “supports VS Code auth” and health state.

This helps beginners see that the UI isn’t magic; it’s exposing real checks on the underlying auth state.

---

### 3.5 Edit Or Remove An Account

Sometimes you need to change or delete an account after you create it.

- **Edit**: when you adjust metadata (for example, update the profile name), the UI calls `accounts:update`.
- **Remove**: when you delete an account from the list, the UI calls `accounts:remove`, which also coordinates with `SecretStoreClass` to clean up the stored auth blob.

From a beginner point of view:  
Editing just changes the card’s details; removing throws the card away and its key goes out of the secret drawer.

---

## 4. How CLI Fits In (Short Overview)

Even though this guide uses only Electron, the CLI exposes the same concepts via `src/cli.js`:

- `accounts add` / `accounts list` / `accounts remove` / `accounts status` – operate on `AccountStore` and `SecretStoreClass`.
- `switcher switch <id>` – calls `SwitcherService` to perform the rotation, like the IPC `switcher:switch` handler.

So later, you can script the same flows in CI or test harnesses without changing backend logic.

---

## 5. Backend Modules (Short Map For Curious Beginners)

If someone wants to look “under the hood”, point them to:

- `src/accounts/store.js` – in‑memory + on‑disk store of accounts (add/list/get/update/remove).
- `src/accounts/secret-store.js` – secure handling of auth blobs/tokens, implemented by `SecretStoreClass`.
- `src/accounts/switcher.js` – `SwitcherService`: builds/executing rotation plans, cooldowns, logs.
- `src/accounts/health.js` – `probeAccount`: checks auth paths, login URLs, VS Code support.

Electron UI and CLI both rely on these modules, so learning them once applies everywhere.

---

---

## 6. Knowledgebase & LLM (Beginner View)

So far you’ve seen how accounts work. The project also has a **Knowledgebase & LLM** layer that lets the app:

- Ingest project docs and sprint history into a searchable index.
- Use an LLM (local or cloud) to answer questions based on that indexed knowledge.

Think of it like a bookshelf (knowledgebase) plus a smart assistant (LLM) that reads the books for you.

---

### 6.1 High‑Level Pieces

At a simple level:

- **IPC** – channels like `knowledge:ingest` and `knowledge:search` are how the UI asks to ingest or query knowledge. [file:17]
- **Knowledge modules** – `ingestSprintHistory`, `getMilvusClient`, `embedTextBatch` handle loading text and turning it into vectors the system can search. [file:18]
- **LLM modules** – `DocumentIngester` and related LLM files turn documents and chunks into something the model can use when answering prompts. [file:18]

Accounts decide _who_ you are; Knowledgebase & LLM decide _what_ the system knows when you ask a question.

---

### 6.2 Using The Knowledgebase From The UI

A typical beginner flow looks like this:

1. From the UI (or CLI), you point the system at a folder of sprint docs or repository files.
2. The app calls `knowledge:ingest` to run the ingestion pipeline.
3. Internally, `ingestSprintHistory` and related functions read the files, chunk the text, and store it in the vector database via `getMilvusClient`. [file:18]

Once ingest is done, the knowledgebase has “cards” for each chunk of text that can be searched later.

---

### 6.3 Searching Knowledge With LLM Help

When you ask a question (via UI or CLI):

1. The UI calls `knowledge:search` with your query text.
2. `embedTextBatch` converts your query into vector form.
3. `getMilvusClient` searches the knowledge collection and returns the best‑matching chunks. [file:18]
4. `DocumentIngester` (and other LLM modules) can pass those chunks along with your question into an LLM so it answers using project‑specific context. [file:18]

For a beginner, you can think of `knowledge:search` as “find the most relevant notes” and `DocumentIngester` as “feed those notes into the model”.

---

### 6.4 CLI Parallels (Short Overview)

Just like accounts, there are CLI commands that mirror the IPC:

- Ingest commands call `ingestSprintHistory` or related ingestion flows to build the knowledge index.
- Query commands call the same search path as `knowledge:search`, then optionally route the results to LLM prompt flows.

The key idea: **IPC and CLI are two faces talking to the same knowledge/LLM backend**, exactly like they do for accounts.

---

### 6.5 Backend Map (For Curious Beginners)

If someone wants to look under the hood for Knowledgebase & LLM, point them to:

- `src/knowledge/index.ts` – main entry for knowledge search and ingest wiring.
- `src/knowledge/ingest-sprint-history.ts` – `ingestSprintHistory`: reads sprint docs and turns them into indexed chunks.
- `src/knowledge/milvus-client.ts` – `getMilvusClient`: connects to the vector database.
- `src/llm/document-ingester.js` – `DocumentIngester`: ingests files into the LLM‑ready storage.
- `src/llm/embeddings.js` – `embedTextBatch`: converts text into vectors for search.

Same pattern as accounts: clear modules, clear IPC names, and both Electron UI and CLI rely on them.

---

## 7. Security Overview & Secrets (Beginner View)

Beyond accounts and knowledge, the project includes a **Security Overview & Secrets** layer that helps you:

- See a summary of security risks across the workspace.
- Scan files and recent changes for secrets (tokens, API keys, passwords).

Think of it as a safety dashboard plus a secret‑detector.

---

### 7.1 Security Overview (What It Does)

From a beginner perspective:

- The Security Overview feature collects findings from tools like dependency scanners and image scanners and shows them in one place.
- The UI triggers this via an IPC channel such as `securityOverview:autoScan`, which kicks off the automated scan and refreshes the overview. [file:18]

You don’t need to know how each scanner works; just that “auto scan” runs a full check and updates the dashboard.

---

### 7.2 Secrets Scanning (What It Does)

Secrets scanning looks for:

- Hard‑coded API keys.
- Access tokens.
- Passwords or other sensitive credentials in your code and config.

In the UI or CLI, when you ask for a secrets scan, the app uses an IPC channel like `secrets:scan` to run the secrets pipeline. [file:18]

From a beginner’s point of view:

- You click “Scan for secrets”.
- The app calls `secrets:scan`.
- You get a list of potential problems to fix (for example, “this file contains something that looks like a token”).

---

### 7.3 How It Fits With The Rest

- **Accounts** control _who_ is running things.
- **Knowledge & LLM** control _what the system knows_ when answering.
- **Security Overview & Secrets** control _how safe the workspace is_ and whether sensitive data is leaking.

All three surfaces (Electron UI, CLI, and backend modules) reuse the same pattern: clear IPC names and focused backend logic.
