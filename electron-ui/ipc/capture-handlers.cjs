/**
 * capture-handlers.cjs
 * IPC handlers for capturing AI responses from embedded browser panes.
 * Validates payloads, writes files atomically with proper permissions,
 * and ingests via DocumentIngester.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promises: fsPromises } = require('node:fs');
const crypto = require('node:crypto');

/**
 * Get the browser-responses directory
 * @returns {string}
 */
function getBrowserResponsesDir() {
  return path.join(process.env.HOME || os.homedir(), '.vscode-rotator', 'browser-responses');
}

/**
 * Format a timestamp as ISO string with safe filename characters
 * @param {number} ts - Timestamp in milliseconds
 * @returns {string} - Formatted timestamp (e.g., "2026-05-21T14-30-45-123")
 */
function formatTimestamp(ts) {
  const date = new Date(ts);
  const iso = date.toISOString();
  // Replace colons with dashes for filename safety
  return iso.replace(/:/g, '-').replace(/\./g, '-');
}

/**
 * Validate capture:response payload shape
 * @param {unknown} payload
 * @returns {boolean}
 */
function isValidPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.platform !== 'string') return false;
  if (typeof payload.html !== 'string') return false;
  if (typeof payload.text !== 'string') return false;
  if (typeof payload.url !== 'string') return false;
  if (typeof payload.ts !== 'number') return false;
  return true;
}

/**
 * Format response content as Markdown
 * @param {Object} payload
 * @returns {string} - Markdown-formatted content
 */
function formatAsMarkdown(payload) {
  const capturedDate = new Date(payload.ts).toISOString();
  return `# Captured Response

**Platform**: ${payload.platform}

**URL**: ${payload.url}

**Captured at**: ${capturedDate}

---

${payload.text}
`;
}

/**
 * Register capture handlers with ipcMain
 * @param {IpcMain} ipcMain - Electron ipcMain
 * @param {DocumentIngester} ingester - Document ingester instance
 * @param {BrowserWindow} mainWindow - Main application window for sending events
 * @returns {Promise<void>}
 */
async function registerCaptureHandlers(ipcMain, ingester, mainWindow) {
  console.log('[capture-handlers] registering handlers');

  // IMPORTANT: This uses ipcRenderer.send / ipcMain.on instead of invoke/handle.
  // This is intentional because we want one-way event emission from the preload context.
  // The preload script has no opportunity to receive a response, so async invoke is not suitable.
  // The handler logs any errors but does not crash the main process.

  ipcMain.on('capture:response', async (event, payload) => {
    console.log('[capture:response] received payload from', event.sender.getURL());

    // Validate payload
    if (!isValidPayload(payload)) {
      console.error('[capture:response] invalid payload shape:', payload);
      return; // Log and discard
    }

    try {
      // Ensure directory exists
      const responseDir = getBrowserResponsesDir();
      await fs.mkdir(responseDir, { recursive: true });

      // Generate filename: browser-responses/{formatted-ts}-{platform}.md
      const formattedTs = formatTimestamp(payload.ts);
      const filename = `${formattedTs}-${payload.platform}.md`;
      const filepath = path.join(responseDir, filename);

      // Format content
      const content = formatAsMarkdown(payload);

      // Write atomically: write to .tmp, then rename
      const tmpPath = `${filepath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(tmpPath, content, 'utf8');
      try {
        await fsPromises.rename(tmpPath, filepath);
      } catch (renameErr) {
        await fs.unlink(filepath).catch(() => null);
        await fsPromises.rename(tmpPath, filepath);
      }

      // Set permissions to 600 (owner read/write only)
      await fs.chmod(filepath, 0o600);

      console.log('[capture:response] wrote file:', filepath);

      // Ingest the file
      let result;
      try {
        result = await ingester.ingestFile(filepath, {
          fileTs: new Date(payload.ts).toISOString(),
          source_type: 'browser-capture',
          platform: payload.platform
        });
        console.log('[capture:response] ingestion result:', result);
      } catch (ingestErr) {
        console.error('[capture:response] ingestion failed:', ingestErr);
        result = { skipped: true, chunks: 0 };
      }

      // Send 'capture:done' event to renderer
      try {
        mainWindow.webContents.send('capture:done', {
          platform: payload.platform,
          chunks: result.chunks || 0,
          skipped: result.skipped || false,
          timestamp: payload.ts
        });
      } catch (sendErr) {
        console.error('[capture:response] failed to send capture:done:', sendErr);
      }
    } catch (err) {
      console.error('[capture:response] error:', err.message);
      // Do not crash the main process; just log the error
    }
  });
}

module.exports = { registerCaptureHandlers };
