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
const { createLogger } = require('../../src/logger.js');

const log = createLogger('electron-capture');

let domainModulesPromise;

async function loadDomainModules() {
  if (!domainModulesPromise) {
    domainModulesPromise = Promise.all([
      import('../../src/domain/schemas.js'),
      import('../../src/error.js')
    ]).then(([schemas, errors]) => ({
      BrowserCapturePayloadSchema: schemas.BrowserCapturePayloadSchema,
      DomainError: errors.DomainError
    }));
  }
  return domainModulesPromise;
}

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

function formatValidationError(error) {
  if (Array.isArray(error?.issues)) {
    return error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

async function parseBrowserPayloadOrThrow(payload, context = {}) {
  const { BrowserCapturePayloadSchema, DomainError } = await loadDomainModules();

  try {
    return BrowserCapturePayloadSchema.parse(payload);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }

    const detail = formatValidationError(error);
    throw new DomainError('ROTATOR_BROWSER_CAPTURE_INVALID', `Invalid browser capture payload: ${detail}`, {
      ...context,
      error: detail
    });
  }
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
  let captureQueue = Promise.resolve();

  // IMPORTANT: This uses ipcRenderer.send / ipcMain.on instead of invoke/handle.
  // This is intentional because we want one-way event emission from the preload context.
  // The preload script has no opportunity to receive a response, so async invoke is not suitable.
  // The handler logs any errors but does not crash the main process.

  ipcMain.on('capture:response', async (event, payload) => {
    const senderUrl = event.sender.getURL();

    let parsedPayload;
    try {
      parsedPayload = await parseBrowserPayloadOrThrow(payload, {
        channel: 'capture:response',
        senderUrl
      });
    } catch (err) {
      const code = err?.code || 'ROTATOR_BROWSER_CAPTURE_INVALID';
      const message = err instanceof Error ? err.message : String(err);
      const errorPayload = { code, message };
      log.warn('capture.payload.invalid', {
        correlationId: null,
        code,
        senderUrl,
        error: err
      });
      try {
        mainWindow.webContents.send('capture:error', errorPayload);
      } catch (sendErr) {
        console.error('[capture:response] failed to send capture:error:', sendErr);
      }
      return;
    }

    const correlationId = `${parsedPayload.platform}:${parsedPayload.ts}`;

    const captureJob = captureQueue.then(async () => {
      // Ensure directory exists
      const responseDir = getBrowserResponsesDir();
      await fs.mkdir(responseDir, { recursive: true });

      // Generate filename: browser-responses/{formatted-ts}-{platform}.md
      const formattedTs = formatTimestamp(parsedPayload.ts);
      const filename = `${formattedTs}-${parsedPayload.platform}.md`;
      const filepath = path.join(responseDir, filename);

      // Format content
      const content = formatAsMarkdown(parsedPayload);

      // Write atomically: write to .tmp, then rename
      const tmpPath = `${filepath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      log.info('capture.file.write.start', {
        correlationId,
        platform: parsedPayload.platform,
        filepath
      });
      await fs.writeFile(tmpPath, content, 'utf8');
      try {
        await fsPromises.rename(tmpPath, filepath);
      } catch (renameErr) {
        await fs.unlink(filepath).catch(() => null);
        await fsPromises.rename(tmpPath, filepath);
      }

      // Set permissions to 600 (owner read/write only)
      await fs.chmod(filepath, 0o600);

      log.info('capture.file.write.success', {
        correlationId,
        platform: parsedPayload.platform,
        filepath
      });

      // Ingest the file
      let result;
      try {
        result = await ingester.ingestFile(filepath, {
          fileTs: new Date(parsedPayload.ts).toISOString(),
          source_type: 'browser-capture',
          platform: parsedPayload.platform
        });
      } catch (ingestErr) {
        log.error('capture.ingest.failure', {
          correlationId,
          platform: parsedPayload.platform,
          filepath,
          error: ingestErr,
          code: ingestErr?.code || 'ROTATOR_CAPTURE_INGEST_FAILED'
        });
        result = { skipped: true, chunks: 0 };
      }
      log.info('capture.ingest.result', {
        correlationId,
        platform: parsedPayload.platform,
        filepath,
        chunks: result.chunks || 0,
        skipped: result.skipped || false
      });

      // Send 'capture:done' event to renderer
      try {
        mainWindow.webContents.send('capture:done', {
          platform: parsedPayload.platform,
          chunks: result.chunks || 0,
          skipped: result.skipped || false,
          timestamp: parsedPayload.ts
        });
      } catch (sendErr) {
        console.error('[capture:response] failed to send capture:done:', sendErr);
      }
    }).catch((err) => {
      log.error('capture.pipeline.failure', {
        correlationId,
        platform: parsedPayload.platform,
        error: err,
        code: err?.code || 'ROTATOR_CAPTURE_PIPELINE_FAILED'
      });
      // Do not crash the main process; just log the error
    });

    captureQueue = captureJob.catch(() => null);
    return captureJob;
  });
}

module.exports = { registerCaptureHandlers, loadDomainModules, parseBrowserPayloadOrThrow };
