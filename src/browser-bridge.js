import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { z } from "zod";

import { loadConfig } from "./internal/config.js";
import { StorageMonitor } from "./storage/storage-monitor.js";
import { DocumentIngester } from "./llm/document-ingester.js";
import { ExperienceDb } from "./llm/experience-db.js";
import { MistakeTracker } from "./llm/mistake-tracker.js";
export { parseFrontmatter } from "./storage/vscode-learn-utils.js";
import { createLogger } from "./logger.js";

const log = createLogger("browser-bridge");

async function loadPlaywright() {
  const { chromium, firefox } = await import("playwright");
  return { chromium, firefox };
}

function homeDir() {
  return process.env.HOME || os.homedir();
}

// CHANGED (round 2): added diagnostic logging so that when tests fail, the
// output shows exactly which HOME value was active at call time.
// process.env.HOME — what the test's beforeEach sets
// os.homedir()    — the OS-level value (often /root in WSL/containers)
// resolved        — what homeDir() actually chose
// Remove the log.info call once the root cause is fully confirmed.
function rotatorPath(...segments) {
  const resolved = homeDir();
  log.info("browser.rotatorPath.resolve", {
    "process.env.HOME": process.env.HOME,
    "os.homedir()": os.homedir(),
    resolved,
    result: path.join(resolved, ".vscode-rotator", ...segments),
    stack: new Error("browser rotator path resolution").stack?.split("\n")[2]?.trim() ?? "unknown",
  });
  return path.join(resolved, ".vscode-rotator", ...segments);
}

// CHANGED (round 1): The five module-level constants that were here
// (BROWSER_PROFILES_DIR, BROWSER_RESPONSES_DIR, BROWSER_SELECTORS_PATH,
// PROMPT_LIBRARY_PATH, PLATFORM_LAST_SEND_PATH) have been removed entirely.
//
// They were computed once at module-load time, before any test's beforeEach
// could override process.env.HOME. That meant every call-site that read the
// constant was using the real home directory even when tests had redirected
// HOME to a temp dir, causing tests to read/write different directories than
// the functions under test.
//
// All paths are now resolved lazily through the dynamic getter functions
// below, which call rotatorPath() — and therefore read process.env.HOME —
// at the moment they are called, picking up whatever value beforeEach has set.
//
// External callers that previously imported the constants should switch to
// the exported getter functions at the bottom of this file.

function browserProfilesDir() {
  return rotatorPath("browser-profiles");
}

function browserResponsesDir() {
  return rotatorPath("browser-responses");
}

function getBrowserResponsePlatform(filePath) {
  const filename = path.basename(filePath);
  const match = /(?:\d{4}-\d{2}-\d{2}T[\d-]+-([a-z]+)\.md)$/.exec(filename);
  return match ? match[1] : null;
}

// CHANGED (round 3): tagResponse now accepts an optional `baseDir` in its
// options bag.
//
// Root cause of the persistent test failures: the test pre-populates an
// ExperienceDb by constructing it with an explicit baseDir:
//
//   new ExperienceDb({ baseDir: path.join(tempDir, ".vscode-rotator") })
//
// but tagResponse was constructing its own ExperienceDb with no arguments:
//
//   new ExperienceDb()
//
// The no-arg constructor resolves baseDir independently from process.env.HOME
// at construction time. Even though HOME is set correctly by beforeEach, the
// two instances may open different on-disk files if ExperienceDb has its own
// frozen-path logic (e.g. a VITEST per-PID redirect). The result: tagResponse
// reads zero rows from "its" db and all quality/notes assertions fail.
//
// The same problem applied to MistakeTracker for the "bad" quality path.
//
// Passing baseDir here threads the same root directory through to both
// dependencies, guaranteeing they operate on the same files the test wrote.
// Production callers omit baseDir and path resolution works exactly as before.
async function tagResponse(filename, { quality, notes, baseDir } = {}) {
  const allowed = new Set(["good", "bad", "partial"]);
  const normalized = String(quality || "")
    .trim()
    .toLowerCase();
  if (!allowed.has(normalized)) {
    throw new Error("Invalid quality. Expected one of: good, bad, partial");
  }

  // CHANGED: when baseDir is supplied resolve responses dir from it directly;
  // otherwise use the dynamic rotatorPath resolution as before.
  const resolvedResponsesDir = baseDir
    ? path.join(baseDir, "browser-responses")
    : browserResponsesDir();

  const responsePath = path.join(resolvedResponsesDir, filename);
  if (!(await exists(responsePath))) {
    throw new Error(`Response not found: ${filename}`);
  }

  // CHANGED: pass baseDir into ExperienceDb so it opens the same database
  // file that the test populated, rather than resolving one independently.
  const dbOptions = baseDir ? { baseDir } : {};
  const db = new ExperienceDb(dbOptions);
  await db.open();
  const rows = await db.getDocumentsByFile(responsePath);
  if (rows.length > 0) {
    const updatedChunks = rows.map((row) => {
      let rawEmbedding = row.embedding;
      if (rawEmbedding instanceof Float32Array) {
        const buf = Buffer.allocUnsafe(rawEmbedding.length * 4);
        for (let i = 0; i < rawEmbedding.length; i++)
          buf.writeFloatLE(rawEmbedding[i], i * 4);
        rawEmbedding = buf;
      }
      return {
        content: row.content,
        embedding: rawEmbedding,
        source_type: row.source_type,
        platform: row.platform,
        file_ts: row.file_ts,
        turn_index: row.turn_index ?? null,
        metadata: row.metadata ?? null,
        quality: normalized,
        notes: notes?.trim() ? notes.trim() : null,
      };
    });
    await db.replaceDocumentsForFile(responsePath, updatedChunks);
  }
  await db.close();

  let mistakeCreated = false;
  const noteText = notes?.trim() ? notes.trim() : null;
  if (normalized === "bad") {
    // CHANGED: pass baseDir into MistakeTracker for the same reason — so it
    // writes to the same directory the test later reads from.
    const trackerOptions = baseDir ? { baseDir } : {};
    const tracker = new MistakeTracker(trackerOptions);
    const description = noteText || `Low-quality browser response: ${filename}`;
    await tracker.addMistake({
      description,
      category: "llm-response",
      fix: "",
    });
    mistakeCreated = true;
  }

  return {
    filename,
    quality: normalized,
    notes: noteText,
    mistakeCreated,
  };
}

async function ingestBrowserResponseFile(responsePath) {
  const correlationId = responsePath;
  const config = await loadConfig();
  if (config.browserResponsesIngest === false) {
    log.info("browser.ingest.skipped", {
      correlationId,
      reason: "browserResponsesIngest disabled",
    });
    return null;
  }

  try {
    log.info("browser.ingest.start", { correlationId, responsePath });
    const storageMonitor = new StorageMonitor();
    await storageMonitor.appendChanges([
      { event: "add", path: responsePath, label: "BrowserResponse" },
    ]);

    const ingester = new DocumentIngester();
    const result = await ingester.ingestFromSnapshot({
      snapshotPath: storageMonitor.snapshotPath,
    });
    const chunkCount = result.actions.reduce(
      (sum, action) => sum + (action.chunks || 0),
      0,
    );
    log.info("browser.ingest.success", {
      correlationId,
      responsePath,
      filename: path.basename(responsePath),
      chunks: chunkCount,
      skipped: Boolean(result.skipped),
    });
    return result;
  } catch (err) {
    log.error("browser.ingest.failure", {
      correlationId,
      responsePath,
      error: err,
      code: err?.code || "ROTATOR_BROWSER_INGEST_FAILED",
    });
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
  lastUsed: z.iso.datetime().nullable().default(null),
  platforms: z.array(z.string()).default([]),
});

const PlatformLastSendSchema = z
  .record(z.string(), z.number().nonnegative())
  .default({});

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
  // CHANGED (round 1): was `const selectorsPath = BROWSER_SELECTORS_PATH`
  // (frozen constant). Now calls browserSelectorsPath() so the path reflects
  // the current HOME at call time.
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
    console.warn("[browser-bridge] adapter module load failed", err);
    throw new Error(`Adapter not found for platform: ${platform}`, {
      cause: err,
    });
  }
}

async function setupLauncher(normalizedType, config, executablePath) {
  const { chromium, firefox } = await loadPlaywright();
  let launcher;
  let execPath = null;

  if (normalizedType === "firefox") {
    launcher = firefox;
    execPath =
      executablePath ||
      process.env.FIREFOX_PATH ||
      config?.browserPaths?.firefox;
  } else {
    launcher = chromium;
    if (normalizedType === "brave") {
      execPath =
        executablePath || process.env.BRAVE_PATH || config?.browserPaths?.brave;
    }
  }

  return { launcher, executablePath: execPath };
}

export async function launchBrowser(options = {}) {
  const {
    browserType = "chromium",
    platform,
    headless = false,
    timeout = 30000,
    executablePath = null,
  } = options;
  const config = await loadConfig();

  const normalizedType = browserType === "chrome" ? "chromium" : browserType;
  const { launcher, executablePath: resolvedPath } = await setupLauncher(
    normalizedType,
    config,
    executablePath,
  );

  const launchOptions = {
    headless,
    timeout,
    args: ["--disable-blink-features=AutomationControlled"],
  };

  if (resolvedPath) {
    launchOptions.executablePath = resolvedPath;
  }

  const storageStatePath = platform
    ? path.join(browserProfilesDir(), platform, "storage-state.json")
    : null;

  const browser = await launcher.launch(launchOptions);

  let storageState = null;
  if (storageStatePath && (await exists(storageStatePath))) {
    const data = await fs.readFile(storageStatePath, "utf8");
    storageState = JSON.parse(data);
  }

  const context = await browser.newContext({
    ...(storageState ? { storageState } : {}),
  });

  context.browserHandle = browser;
  context.storageStatePath = storageStatePath;
  context.platform = platform;

  return context;
}

export async function closeBrowser(context) {
  if (!context) return;

  if (context.storageStatePath) {
    try {
      await fs.mkdir(path.dirname(context.storageStatePath), {
        recursive: true,
        mode: 0o700,
      });
      const storageState = await context.storageState();
      await fs.writeFile(
        context.storageStatePath,
        JSON.stringify(storageState, null, 2),
        "utf8",
      );
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
    dryRun = false,
    timeout = 30000,
  } = options;

  if (!platform) throw new Error("platform is required");
  if (!prompt) throw new Error("prompt is required");
  const captureId = `${platform}:${Date.now()}`;

  if (dryRun) {
    log.info("browser.sendPrompt.start", {
      correlationId: captureId,
      platform,
      dryRun: true,
    });
    log.info("browser.sendPrompt.success", {
      correlationId: captureId,
      platform,
      dryRun: true,
    });
    return {
      platform,
      prompt,
      dryRun: true,
      message: `Would send prompt to ${platform}`,
    };
  }

  let context;

  try {
    log.info("browser.sendPrompt.start", {
      correlationId: captureId,
      platform,
      browserType,
      headless,
      timeout,
    });
    const adapter = await getAdapterModule(platform);
    context = await launchBrowser({ browserType, platform, headless, timeout });
    const page = await context.newPage();
    await page.goto(adapter.baseUrl);
    await page.waitForLoadState("networkidle");

    const inputSelector = adapter.selectors.inputBox;
    const sendSelector = adapter.selectors.sendButton;

    const inputElement = await page.$(inputSelector).catch(() => null);
    if (!inputElement) {
      // CHANGED (round 1): was referencing frozen constant BROWSER_SELECTORS_PATH.
      // Now calls browserSelectorsPath() so the message shows the runtime path.
      throw new Error(
        `Input selector not found: "${inputSelector}". Check ${browserSelectorsPath()}`,
      );
    }

    await page.fill(inputSelector, prompt);
    await page.click(sendSelector);

    const response = await adapter.waitForResponse(page);

    const timestamp = getTimestamp();
    const responsePath = path.join(
      browserResponsesDir(),
      `${timestamp}-${platform}.md`,
    );

    const responseContent = `# ${platform.charAt(0).toUpperCase() + platform.slice(1)} Response

**Timestamp:** ${now()}

## Prompt

${prompt}

## Response

${response}
`;

    const tmpPath = `${responsePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, responseContent, {
      encoding: "utf8",
      mode: 0o600,
    });
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
      log.error("browser.ingest.failure", {
        correlationId: responsePath,
        responsePath,
        error: err,
        code: err?.code || "ROTATOR_BROWSER_INGEST_FAILED",
      });
    }

    const lastSendData = await loadPlatformLastSend();
    lastSendData[platform] = Date.now();
    await fs.writeFile(
      platformLastSendPath(),
      JSON.stringify(lastSendData, null, 2),
      "utf8",
    );

    log.info("browser.sendPrompt.success", {
      correlationId: captureId,
      platform,
      responsePath,
      timestamp,
    });

    return { platform, prompt, response, responsePath, timestamp };
  } catch (err) {
    log.error("browser.sendPrompt.failure", {
      correlationId: captureId,
      platform,
      error: err,
      code: err?.code || "ROTATOR_BROWSER_SEND_FAILED",
    });
    throw err;
  } finally {
    if (context) {
      await closeBrowser(context);
    }
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
  const MIN_DELAY = 3000;

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
    dryRun = false,
    timeout = 30000,
  } = options;

  if (!prompt) throw new Error("prompt is required");
  if (platforms.length === 0)
    throw new Error("At least one platform is required");

  if (dryRun) {
    return {
      prompt,
      platforms,
      dryRun: true,
      message: `Would send prompt to: ${platforms.join(", ")}`,
    };
  }

  const results = [];

  for (const platform of platforms) {
    await waitForMinimumDelay(platform);
    try {
      const result = await sendPrompt({
        platform,
        prompt,
        browserType,
        headless,
        dryRun: false,
        timeout,
      });
      results.push(result);
    } catch (err) {
      results.push({ platform, error: String(err?.message ?? err) });
    }
  }

  const timestamp = getTimestamp();
  const reportPath = path.join(
    browserResponsesDir(),
    `${timestamp}-compare.md`,
  );

  let reportContent = `# Comparison Report\n\n**Date:** ${now()}\n**Prompt:** ${prompt}\n\n---\n\n`;

  for (const result of results) {
    if (result.error) {
      reportContent += `## ${result.platform} — Error\n\n\`\`\`\n${result.error}\n\`\`\`\n\n`;
    } else {
      reportContent += `## ${result.platform}\n\n${result.response}\n\n`;
    }
  }

  await fs.writeFile(reportPath, reportContent, "utf8");

  return { prompt, platforms, results, reportPath };
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
  for (const [key, value] of Object.entries(variables)) {
    text = text.replaceAll(new RegExp(`{{${key}}}`, "g"), String(value));
  }
  const now_iso = now();
  await updatePrompt(promptId, { lastUsed: now_iso });
  return sendPrompt({ platform, prompt: text, dryRun });
}

export async function loginToPage(options) {
  const { platform, browserType = "chromium", timeout = 60000 } = options;
  if (!platform) throw new Error("platform is required");

  const adapter = await getAdapterModule(platform);
  const context = await launchBrowser({
    browserType,
    platform,
    headless: false,
    timeout,
  });

  try {
    const page = await context.newPage();
    await page.goto(adapter.baseUrl);
    log.info("browser.login.opened", {
      correlationId: platform,
      platform,
      url: adapter.baseUrl,
    });

    console.log(
      `\n✓ Browser opened. Please log in manually and close the browser when done.`,
    );
    console.log(`  Platform: ${platform}`);
    console.log(`  URL: ${adapter.baseUrl}`);
    console.log(
      `  If you want to keep the browser open, press ENTER after login.`,
    );

    const browserClosed = new Promise((resolve) => {
      context.browserHandle.once("disconnected", resolve);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const promptClosed = rl
      .question("Press ENTER after login is complete...\n")
      .then(() => {
        rl.close();
      });

    await Promise.race([browserClosed, promptClosed]);
    rl.close();

    if (context.browserHandle.isConnected()) {
      await context.browserHandle.close();
    }

    console.log(`✓ Storage state saved for ${platform}`);
    log.info("browser.login.success", { correlationId: platform, platform });
    return { platform, message: `Login completed and storage state saved` };
  } catch (err) {
    log.error("browser.login.failure", {
      correlationId: platform,
      platform,
      error: err,
      code: err?.code || "ROTATOR_BROWSER_LOGIN_FAILED",
    });
    throw err;
  } finally {
    try {
      await closeBrowser(context);
    } catch {}
  }
}

export async function listResponses(options = {}) {
  // CHANGED: accept optional baseDir so the test can point listResponses at the
  // same ExperienceDb that tagResponse just wrote to. Without this, listResponses
  // constructs its own no-arg ExperienceDb which resolves a different path and
  // always reads back null for quality/notes.
  const { platform = null, limit = 10, baseDir } = options;
  const responsesDir = baseDir
    ? path.join(baseDir, "browser-responses")
    : browserResponsesDir();

  if (!(await exists(responsesDir))) {
    return [];
  }

  let files = await fs.readdir(responsesDir);

  if (platform) {
    files = files.filter((f) => f.includes(`-${platform}.md`));
  }

  if (!platform) {
    files = files.filter((f) => !f.includes("-compare.md"));
  }

  files = files.toSorted((a, b) => b.localeCompare(a));

  if (limit) {
    files = files.slice(0, limit);
  }

  // CHANGED: pass baseDir when supplied so db opens the same file tagResponse wrote.
  const dbOptions = baseDir ? { baseDir } : {};
  const db = new ExperienceDb(dbOptions);
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
      notes: metadata.notes ?? null,
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
    content,
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

async function captureThread(
  platform,
  { outputDir = null, headless = false, timeout = 60000 } = {},
) {
  if (!["chatgpt", "claude", "perplexity", "gemini"].includes(platform)) {
    throw new Error(
      `Unsupported platform: ${platform}. Expected one of: chatgpt, claude, perplexity, gemini`,
    );
  }

  const selectorsOverrides = await loadSelectorOverrides();
  const threadSelectors = selectorsOverrides.threadSelectors || {};
  const platformSelectors =
    threadSelectors[platform] || getDefaultThreadSelectors(platform);

  if (!threadSelectors[platform]) {
    log.warn("browser.threadSelectors.default", {
      correlationId: platform,
      platform,
      reason: "thread selectors missing",
    });
  }

  const context = await launchBrowser({ platform, headless, timeout });

  try {
    const page = await context.newPage();
    const adapter = await getAdapterModule(platform);
    await page.goto(adapter.baseUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    const turns = await page.evaluate(
      ({ turnContainer, roleAttr, contentSelector }) => {
        const containers = document.querySelectorAll(turnContainer);
        if (!containers.length) return [];
        return Array.from(containers)
          .map((container) => {
            const roleEl = container.querySelector(`[${roleAttr}]`);
            const role = roleEl
              ? roleEl.getAttribute(roleAttr) || "unknown"
              : "unknown";
            const contentEl = container.querySelector(contentSelector);
            const content = contentEl ? contentEl.textContent?.trim() : "";
            return { role: String(role).toLowerCase(), content };
          })
          .filter((t) => t.content && t.content.length > 0);
      },
      platformSelectors,
    );

    if (turns.length === 0) {
      throw new Error(
        `No conversation turns found. Check threadSelectors for ${platform} in browser-selectors.json`,
      );
    }

    const roles = new Set(
      turns.map((turn) => String(turn.role || "unknown").toLowerCase()),
    );
    if (!roles.has("user") || !roles.has("assistant")) {
      throw new Error(
        `Incomplete conversation thread: expected both user and assistant turns for ${platform}. ` +
          `Found roles: ${Array.from(roles).join(", ")}`,
      );
    }

    const timestamp = getTimestamp();
    const filename = `${timestamp}-${platform}-thread.md`;
    const filepath = path.join(outputDir || browserResponsesDir(), filename);

    const frontmatter = `---\nplatform: ${platform}\ncaptured_at: ${now()}\ntype: thread\nturn_count: ${turns.length}\n---\n\n`;

    let content = frontmatter;
    turns.forEach((turn, index) => {
      const roleLabel = String(turn.role || "unknown").toLowerCase();
      content += `## Turn ${index + 1} — ${roleLabel}\n\n`;
      content += `${turn.content}\n\n`;
    });

    const dir = path.dirname(filepath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const tmpFile = `${filepath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpFile, content, { encoding: "utf8", mode: 0o600 });

    try {
      const fh = await fs.open(tmpFile, "r+");
      try {
        await fh.sync();
      } finally {
        await fh.close();
      }
      try {
        await fs.rename(tmpFile, filepath);
      } catch {
        await fs.unlink(filepath).catch(() => null);
        await fs.rename(tmpFile, filepath);
      }
      const dirHandle = await fs.open(dir, "r");
      try {
        try {
          await dirHandle.sync();
        } catch {
          // Some platforms (notably Windows) may not allow directory sync on open handles.
        }
      } finally {
        await dirHandle.close();
      }
    } catch (err) {
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
      capturedAt: now(),
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
      contentSelector: "div[class*='prose']",
    },
    claude: {
      turnContainer: "div[class*='col']",
      roleAttr: "data-test-id",
      contentSelector: "div[class*='content']",
    },
    gemini: {
      turnContainer: "div[class*='message']",
      roleAttr: "data-role",
      contentSelector: "div[class*='text']",
    },
    perplexity: {
      turnContainer: "div[class*='chat-item']",
      roleAttr: "data-role",
      contentSelector: "div[class*='message-content']",
    },
  };
  return defaults[platform] || defaults.chatgpt;
}

// CHANGED (round 1): The frozen constants (BROWSER_PROFILES_DIR,
// BROWSER_RESPONSES_DIR, BROWSER_SELECTORS_PATH, PROMPT_LIBRARY_PATH) have
// been removed from exports. External callers must switch to these getter
// functions, which resolve fresh on each call so process.env.HOME overrides
// in tests are always respected.
export function getBrowserProfilesDir() {
  return browserProfilesDir();
}
export function getBrowserResponsesDir() {
  return browserResponsesDir();
}
export function getBrowserSelectorsPath() {
  return browserSelectorsPath();
}
export function getPromptLibraryPath() {
  return promptLibraryPath();
}

export {
  getBrowserResponsePlatform,
  ingestBrowserResponseFile,
  tagResponse,
  captureThread,
};
