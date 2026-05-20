import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { StorageMonitor } from "./storage-monitor.js";
import { DocumentIngester } from "./llm/document-ingester.js";
import { ExperienceDb } from "./llm/experience-db.js";
import { MistakeTracker } from "./llm/mistake-tracker.js";

async function loadPlaywright() {
  const { chromium, firefox } = await import("playwright");
  return { chromium, firefox };
}

function homeDir() {
  return process.env.HOME || os.homedir();
}

function rotatorPath(...segments) {
  return path.join(homeDir(), ".vscode-rotator", ...segments);
}

const BROWSER_PROFILES_DIR = rotatorPath("browser-profiles");
const BROWSER_RESPONSES_DIR = rotatorPath("browser-responses");
const BROWSER_SELECTORS_PATH = rotatorPath("browser-selectors.json");
const PROMPT_LIBRARY_PATH = rotatorPath("prompt-library.json");
const PLATFORM_LAST_SEND_PATH = rotatorPath("platform-last-send.json");

function browserProfilesDir() {
  return rotatorPath("browser-profiles");
}

function browserResponsesDir() {
  return rotatorPath("browser-responses");
}

function getBrowserResponsePlatform(filePath) {
  const filename = path.basename(filePath);
  const match = filename.match(/(\d{4}-\d{2}-\d{2}T[\d-]+-([a-z]+)\.md)$/);
  return match ? match[2] : null;
}

async function tagResponse(filename, { quality, notes } = {}) {
  const allowed = new Set(["good", "bad", "partial"]);
  const normalized = String(quality || "").trim().toLowerCase();
  if (!allowed.has(normalized)) {
    throw new Error("Invalid quality. Expected one of: good, bad, partial");
  }

  const responsePath = path.join(browserResponsesDir(), filename);
  if (!(await exists(responsePath))) {
    throw new Error(`Response not found: ${filename}`);
  }

  const db = new ExperienceDb();
  await db.open();
  const rows = await db.getDocumentsByFile(responsePath);
  if (rows.length > 0) {
    const updatedChunks = rows.map((row) => ({
      content: row.content,
      embedding: row.embedding,
      source_type: row.source_type,
      platform: row.platform,
      file_ts: row.file_ts,
      quality: normalized,
      notes: notes?.trim() ? notes.trim() : null
    }));
    await db.replaceDocumentsForFile(responsePath, updatedChunks);
  }
  await db.close();

  let mistakeCreated = false;
  const noteText = notes?.trim() ? notes.trim() : null;
  if (normalized === "bad") {
    const tracker = new MistakeTracker();
    const description = noteText || `Low-quality browser response: ${filename}`;
    await tracker.addMistake({ description, category: "llm-response", fix: "" });
    mistakeCreated = true;
  }

  return {
    filename,
    quality: normalized,
    notes: noteText,
    mistakeCreated
  };
}

async function ingestBrowserResponseFile(responsePath) {
  const config = await loadConfig();
  if (config.browserResponsesIngest === false) return null;

  try {
    const storageMonitor = new StorageMonitor();
    await storageMonitor.appendChanges([
      { event: "add", path: responsePath, label: "BrowserResponse" }
    ]);

    const ingester = new DocumentIngester();
    const result = await ingester.ingestFromSnapshot({ snapshotPath: storageMonitor.snapshotPath });
    const chunkCount = result.actions.reduce((sum, action) => sum + (action.chunks || 0), 0);
    console.info(`[browser-bridge] ingested ${path.basename(responsePath)} → ${chunkCount} chunks`);
    return result;
  } catch (err) {
    console.warn(`[browser-bridge] browser response ingestion failed: ${String(err?.message ?? err)}`);
    return null;
  }
}

function browserSelectorsPath() {
  return rotatorPath("browser-selectors.json");
}

function promptLibraryPath() {
  return rotatorPath("prompt-library.json");
}

function platformLastSendPath() {
  return rotatorPath("platform-last-send.json");
}

const PromptSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  template: z.string().min(1),
  tags: z.array(z.string()).default([]),
  lastUsed: z.string().datetime().nullable().default(null),
  platforms: z.array(z.string()).default([])
});

const PlatformLastSendSchema = z.record(z.string(), z.number().nonnegative()).default({});

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function now() {
  return new Date().toISOString();
}

function getTimestamp() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  const secs = String(d.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}-${mins}-${secs}`;
}

export async function ensureBrowserDirs() {
  await fs.mkdir(browserProfilesDir(), { recursive: true, mode: 0o700 });
  await fs.mkdir(browserResponsesDir(), { recursive: true, mode: 0o700 });
}

async function loadSelectorOverrides() {
  const selectorsPath = browserSelectorsPath();
  if (!(await exists(selectorsPath))) {
    return {};
  }
  try {
    const data = await fs.readFile(selectorsPath, "utf8");
    return JSON.parse(data) || {};
  } catch {
    return {};
  }
}

async function getAdapterModule(platform) {
  try {
    const module = await import(`./browser-adapters/${platform}.js`);
    return module.adapter;
  } catch (err) {
    throw new Error(`Adapter not found for platform: ${platform}`);
  }
}

export async function launchBrowser(options = {}) {
  const {
    browserType = "chromium",
    platform,
    headless = false,
    timeout = 30000
  } = options;

  const { chromium, firefox } = await loadPlaywright();
  const launcher = browserType === "firefox" ? firefox : chromium;
  const storageStatePath = platform
    ? path.join(browserProfilesDir(), platform, "storage-state.json")
    : null;

  const launchOptions = {
    headless,
    timeout,
    args: ["--disable-blink-features=AutomationControlled"]
  };

  const browser = await launcher.launch(launchOptions);

  let storageState = null;
  if (storageStatePath && (await exists(storageStatePath))) {
    const data = await fs.readFile(storageStatePath, "utf8");
    storageState = JSON.parse(data);
  }

  const context = await browser.newContext({
    ...(storageState ? { storageState } : {})
  });

  context.browserHandle = browser;
  context.storageStatePath = storageStatePath;
  context.platform = platform;

  return context;
}

export async function closeBrowser(context) {
  if (!context) return;

  // Save storage state if platform is set
  if (context.storageStatePath) {
    try {
      await fs.mkdir(path.dirname(context.storageStatePath), { recursive: true, mode: 0o700 });
      const storageState = await context.storageState();
      await fs.writeFile(context.storageStatePath, JSON.stringify(storageState, null, 2), "utf8");
    } catch {
      // Continue even if save fails
    }
  }

  await context.close();
  if (context.browserHandle) {
    await context.browserHandle.close();
  }
}

export async function sendPrompt(options) {
  const {
    platform,
    prompt,
    browserType = "chromium",
    headless = false,
    dryRun = false
  } = options;

  if (!platform) throw new Error("platform is required");
  if (!prompt) throw new Error("prompt is required");

  if (dryRun) {
    return {
      platform,
      prompt,
      dryRun: true,
      message: `Would send prompt to ${platform}`
    };
  }

  const adapter = await getAdapterModule(platform);
  const context = await launchBrowser({ browserType, platform, headless });

  try {
    const page = await context.newPage();
    await page.goto(adapter.baseUrl);

    // Wait for page to be interactive
    await page.waitForLoadState("networkidle");

    // Find input and send prompt
    const inputSelector = adapter.selectors.inputBox;
    const sendSelector = adapter.selectors.sendButton;

    const inputElement = await page.$(inputSelector).catch(() => null);
    if (!inputElement) {
      throw new Error(
        `Input selector not found: "${inputSelector}". Check ${BROWSER_SELECTORS_PATH}`
      );
    }

    await page.fill(inputSelector, prompt);
    await page.click(sendSelector);

    // Wait for response
    const response = await adapter.waitForResponse(page);

    // Save response
    const timestamp = getTimestamp();
    const responsePath = path.join(
      browserResponsesDir(),
      `${timestamp}-${platform}.md`
    );

    const responseContent = `# ${platform.charAt(0).toUpperCase() + platform.slice(1)} Response

**Timestamp:** ${now()}

## Prompt

${prompt}

## Response

${response}
`;

    const tmpPath = `${responsePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, responseContent, { encoding: "utf8", mode: 0o600 });
    const fh = await fs.open(tmpPath, "r+");
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }

    try {
      await fs.rename(tmpPath, responsePath);
    } catch {
      await fs.unlink(responsePath).catch(() => null);
      await fs.rename(tmpPath, responsePath);
    }

    await fs.chmod(responsePath, 0o600);

    try {
      await ingestBrowserResponseFile(responsePath);
    } catch (err) {
      console.warn(`[browser-bridge] browser response ingestion failed: ${String(err?.message ?? err)}`);
    }

    // Record last send time
    const lastSendData = await loadPlatformLastSend();
    lastSendData[platform] = Date.now();
    await fs.writeFile(platformLastSendPath(), JSON.stringify(lastSendData, null, 2), "utf8");

    return {
      platform,
      prompt,
      response,
      responsePath,
      timestamp
    };
  } finally {
    await closeBrowser(context);
  }
}

async function loadPlatformLastSend() {
  const lastSendPath = platformLastSendPath();
  if (!(await exists(lastSendPath))) {
    return {};
  }
  try {
    const data = await fs.readFile(lastSendPath, "utf8");
    return JSON.parse(data) || {};
  } catch {
    return {};
  }
}

async function waitForMinimumDelay(platform) {
  const lastSendData = await loadPlatformLastSend();
  const lastSend = lastSendData[platform];
  if (!lastSend) return;

  const elapsed = Date.now() - lastSend;
  const MIN_DELAY = 3000; // 3 seconds

  if (elapsed < MIN_DELAY) {
    const waitTime = MIN_DELAY - elapsed;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
}

export async function comparePrompts(options) {
  const {
    prompt,
    platforms = [],
    browserType = "chromium",
    headless = false,
    dryRun = false
  } = options;

  if (!prompt) throw new Error("prompt is required");
  if (platforms.length === 0) throw new Error("At least one platform is required");

  if (dryRun) {
    return {
      prompt,
      platforms,
      dryRun: true,
      message: `Would send prompt to: ${platforms.join(", ")}`
    };
  }

  const results = [];

  for (const platform of platforms) {
    // Enforce minimum delay
    await waitForMinimumDelay(platform);

    try {
      const result = await sendPrompt({
        platform,
        prompt,
        browserType,
        headless,
        dryRun: false
      });
      results.push(result);
    } catch (err) {
      results.push({
        platform,
        error: String(err?.message ?? err)
      });
    }
  }

  // Generate comparison report
  // Note: compare reports are not treated as individual browser responses and are not ingested
  const timestamp = getTimestamp();
  const reportPath = path.join(browserResponsesDir(), `${timestamp}-compare.md`);

  let reportContent = `# Comparison Report

**Date:** ${now()}
**Prompt:** ${prompt}

---

`;

  for (const result of results) {
    if (result.error) {
      reportContent += `## ${result.platform} — Error

\`\`\`
${result.error}
\`\`\`

`;
    } else {
      reportContent += `## ${result.platform}

${result.response}

`;
    }
  }

  await fs.writeFile(reportPath, reportContent, "utf8");

  return {
    prompt,
    platforms,
    results,
    reportPath
  };
}

export async function loadPromptLibrary() {
  const libraryPath = promptLibraryPath();
  if (!(await exists(libraryPath))) {
    return [];
  }

  try {
    const data = await fs.readFile(libraryPath, "utf8");
    const prompts = JSON.parse(data) || [];
    return prompts.map((p) => PromptSchema.parse(p));
  } catch {
    return [];
  }
}

export async function savePromptLibrary(prompts) {
  const validated = prompts.map((p) => PromptSchema.parse(p));
  const libraryPath = promptLibraryPath();
  await fs.mkdir(path.dirname(libraryPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(libraryPath, JSON.stringify(validated, null, 2), "utf8");
}

export async function addPrompt(prompt) {
  const library = await loadPromptLibrary();
  const id = crypto.randomUUID();
  const newPrompt = PromptSchema.parse({ ...prompt, id });
  library.push(newPrompt);
  await savePromptLibrary(library);
  return newPrompt;
}

export async function findPrompt(id) {
  const library = await loadPromptLibrary();
  const found = library.find((p) => p.id === id);
  if (!found) throw new Error(`Prompt not found: ${id}`);
  return found;
}

export async function updatePrompt(id, updates) {
  const library = await loadPromptLibrary();
  const index = library.findIndex((p) => p.id === id);
  if (index === -1) throw new Error(`Prompt not found: ${id}`);

  const updated = { ...library[index], ...updates };
  library[index] = PromptSchema.parse(updated);
  await savePromptLibrary(library);
  return library[index];
}

export async function deletePrompt(id) {
  const library = await loadPromptLibrary();
  const index = library.findIndex((p) => p.id === id);
  if (index === -1) throw new Error(`Prompt not found: ${id}`);

  const [deleted] = library.splice(index, 1);
  await savePromptLibrary(library);
  return deleted;
}

export async function runPromptTemplate(options) {
  const { promptId, platform, variables = {}, dryRun = false } = options;

  const prompt = await findPrompt(promptId);
  let text = prompt.template;

  // Substitute variables
  for (const [key, value] of Object.entries(variables)) {
    text = text.replace(new RegExp(`{{${key}}}`, "g"), String(value));
  }

  // Track last used
  const now_iso = now();
  await updatePrompt(promptId, { lastUsed: now_iso });

  // Send prompt
  return sendPrompt({
    platform,
    prompt: text,
    dryRun
  });
}

export async function loginToPage(options) {
  const { platform, browserType = "chromium", timeout = 60000 } = options;

  if (!platform) throw new Error("platform is required");

  const adapter = await getAdapterModule(platform);
  const context = await launchBrowser({
    browserType,
    platform,
    headless: false,
    timeout
  });

  try {
    const page = await context.newPage();
    await page.goto(adapter.baseUrl);

    // Show user message
    console.log(`\n✓ Browser opened. Please log in manually and close the browser when done.`);
    console.log(`  Platform: ${platform}`);
    console.log(`  URL: ${adapter.baseUrl}`);

    // Wait for user to close browser
    await context.browserHandle.close();

    console.log(`✓ Storage state saved for ${platform}`);

    return {
      platform,
      message: `Login completed and storage state saved`
    };
  } catch (err) {
    throw err;
  } finally {
    try {
      await closeBrowser(context);
    } catch {}
  }
}

export async function listResponses(options = {}) {
  const { platform = null, limit = 10 } = options;
  const responsesDir = browserResponsesDir();

  if (!(await exists(responsesDir))) {
    return [];
  }

  let files = await fs.readdir(responsesDir);

  if (platform) {
    files = files.filter((f) => f.includes(`-${platform}.md`));
  }

  // Filter out compare reports if not specifically requested
  if (!platform) {
    files = files.filter((f) => !f.includes("-compare.md"));
  }

  // Sort by name (timestamp) descending
  files.sort().reverse();

  if (limit) {
    files = files.slice(0, limit);
  }

  const db = new ExperienceDb();
  await db.open();

  const responses = [];
  for (const file of files) {
    const filepath = path.join(responsesDir, file);
    const content = await fs.readFile(filepath, "utf8");
    const docs = await db.getDocumentsByFile(filepath);
    const metadata = docs[0] || {};
    responses.push({
      filename: file,
      filepath,
      content,
      quality: metadata.quality ?? null,
      notes: metadata.notes ?? null
    });
  }

  await db.close();
  return responses;
}

export async function getResponseMetadata(filename) {
  const filepath = path.join(browserResponsesDir(), filename);
  if (!(await exists(filepath))) {
    throw new Error(`Response not found: ${filename}`);
  }

  const stat = await fs.stat(filepath);
  const content = await fs.readFile(filepath, "utf8");

  return {
    filename,
    filepath,
    size: stat.size,
    created: stat.birthtime.toISOString(),
    modified: stat.mtime.toISOString(),
    content
  };
}

export async function clearResponses(options = {}) {
  const { olderThanDays = null, platform = null } = options;
  const responsesDir = browserResponsesDir();

  if (!(await exists(responsesDir))) {
    return { deleted: 0 };
  }

  const files = await fs.readdir(responsesDir);
  const now_ms = Date.now();
  let deleted = 0;

  for (const file of files) {
    let shouldDelete = false;

    if (platform) {
      shouldDelete = file.includes(`-${platform}.md`);
    }

    if (shouldDelete && olderThanDays) {
      const filepath = path.join(responsesDir, file);
      const stat = await fs.stat(filepath);
      const ageMs = now_ms - stat.mtime.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      shouldDelete = ageDays >= olderThanDays;
    }

    if (shouldDelete) {
      const filepath = path.join(responsesDir, file);
      await fs.unlink(filepath);
      deleted++;
    }
  }

  return { deleted };
}

async function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { data: {}, body: content };
  try {
    const lines = match[1].split("\n");
    const data = {};
    for (const line of lines) {
      const [key, ...valueParts] = line.split(":");
      if (key && valueParts.length > 0) {
        const value = valueParts.join(":").trim();
        data[key.trim()] = value.replace(/^["']|["']$/g, "");
      }
    }
    const body = content.slice(match[0].length);
    return { data, body };
  } catch {
    return { data: {}, body: content };
  }
}

async function captureThread(platform, { outputDir = null } = {}) {
  if (!["chatgpt", "claude", "perplexity", "gemini"].includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}. Expected one of: chatgpt, claude, perplexity, gemini`);
  }

  // Load thread selectors or use defaults
  const selectorsOverrides = await loadSelectorOverrides();
  const threadSelectors = selectorsOverrides.threadSelectors || {};
  const platformSelectors = threadSelectors[platform] || getDefaultThreadSelectors(platform);

  if (!threadSelectors[platform]) {
    console.warn(`[browser-bridge] No thread selectors for ${platform}; using defaults`);
  }

  const context = await launchBrowser({ platform, headless: false });

  try {
    const page = await context.newPage();
    // Navigate to the platform's base URL
    const adapter = await getAdapterModule(platform);
    await page.goto(adapter.baseUrl, { waitUntil: "networkidle" });

    // Wait for conversation to load
    await page.waitForTimeout(2000);

    // Scrape all turns from the page
    const turns = await page.evaluate(
      ({ turnContainer, roleAttr, contentSelector }) => {
        const containers = document.querySelectorAll(turnContainer);
        if (!containers.length) return [];

        return Array.from(containers)
          .map((container) => {
            const roleEl = container.querySelector(`[${roleAttr}]`);
            const role = roleEl ? (roleEl.getAttribute(roleAttr) || "unknown") : "unknown";
            const contentEl = container.querySelector(contentSelector);
            const content = contentEl ? contentEl.textContent?.trim() : "";

            return { role: String(role).toLowerCase(), content };
          })
          .filter((t) => t.content && t.content.length > 0);
      },
      platformSelectors
    );

    if (turns.length === 0) {
      throw new Error(`No conversation turns found. Check threadSelectors for ${platform} in browser-selectors.json`);
    }

    const roles = new Set(turns.map((turn) => String(turn.role || "unknown").toLowerCase()));
    if (!roles.has("user") || !roles.has("assistant")) {
      throw new Error(
        `Incomplete conversation thread: expected both user and assistant turns for ${platform}. ` +
          `Found roles: ${Array.from(roles).join(", ")}`
      );
    }

    // Format as thread file
    const timestamp = getTimestamp();
    const filename = `${timestamp}-${platform}-thread.md`;
    const filepath = path.join(outputDir || browserResponsesDir(), filename);

    const frontmatter = `---
platform: ${platform}
captured_at: ${now()}
type: thread
turn_count: ${turns.length}
---

`;

    let content = frontmatter;
    turns.forEach((turn, index) => {
      // Write role in lowercase per transcript convention
      const roleLabel = String(turn.role || "unknown").toLowerCase();
      content += `## Turn ${index + 1} — ${roleLabel}\n\n`;
      content += `${turn.content}\n\n`;
    });

    // Atomic write with fsync: write to tmp, fsync file and directory, then rename
    const dir = path.dirname(filepath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const tmpFile = `${filepath}.${process.pid}.${Date.now()}.tmp`;
    // write tmp file
    await fs.writeFile(tmpFile, content, { encoding: "utf8", mode: 0o600 });
    // ensure data is flushed to disk
    try {
      const fh = await fs.open(tmpFile, "r+");
      try {
        await fh.sync();
      } finally {
        await fh.close();
      }
      // rename into place
      try {
        await fs.rename(tmpFile, filepath);
      } catch {
        await fs.unlink(filepath).catch(() => null);
        await fs.rename(tmpFile, filepath);
      }
      // sync containing directory to ensure directory entry is persisted
      const dirHandle = await fs.open(dir, "r");
      try {
        try {
          await dirHandle.sync();
        } catch (syncErr) {
          // Some platforms (notably Windows) may not allow directory sync on open handles.
          // Ignore best-effort directory sync failures and continue.
        }
      } finally {
        await dirHandle.close();
      }
    } catch (err) {
      // best-effort cleanup
      try {
        await fs.unlink(tmpFile).catch(() => null);
      } catch {}
      throw err;
    }

    return {
      filename,
      turns: turns.map((t) => ({ role: t.role, content: t.content })),
      platform,
      filePath: filepath,
      capturedAt: now()
    };
  } finally {
    await closeBrowser(context);
  }
}

function getDefaultThreadSelectors(platform) {
  const defaults = {
    chatgpt: {
      turnContainer: "div[class*='message-group']",
      roleAttr: "data-message-author-role",
      contentSelector: "div[class*='prose']"
    },
    claude: {
      turnContainer: "div[class*='col']",
      roleAttr: "data-test-id",
      contentSelector: "div[class*='content']"
    },
    gemini: {
      turnContainer: "div[class*='message']",
      roleAttr: "data-role",
      contentSelector: "div[class*='text']"
    },
    perplexity: {
      turnContainer: "div[class*='chat-item']",
      roleAttr: "data-role",
      contentSelector: "div[class*='message-content']"
    }
  };

  return defaults[platform] || defaults.chatgpt;
}

export { BROWSER_PROFILES_DIR, BROWSER_RESPONSES_DIR, BROWSER_SELECTORS_PATH, PROMPT_LIBRARY_PATH, getBrowserResponsePlatform, ingestBrowserResponseFile, tagResponse, captureThread, parseFrontmatter };
