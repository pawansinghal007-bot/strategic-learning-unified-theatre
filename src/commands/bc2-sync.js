import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import Database from "better-sqlite3";
import chalk from "chalk";
import ora from "ora";

import { DocumentIngester } from "../llm/document-ingester.js";

const DEFAULT_LOG_PATH = "bc2-sync";
const SCHEDULE_INTERVAL_MS = 5 * 60 * 1000;

function normalizeRole(role) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "assistant" ? "assistant" : "user";
}

function parseSince(since) {
  if (!since) return null;
  const value = String(since).trim();
  const date = new Date(value);
  if (!isFinite(date.getTime())) {
    throw new Error(`Invalid --since value: ${value}`);
  }
  return date.toISOString();
}

function buildQuery(platform) {
  const clauses = ["m.chat_session_id = s.id"];
  if (platform) clauses.push("s.site = ?");
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return `SELECT m.id AS bc2_message_id, m.role AS role, m.text_content AS content, s.site AS platform, m.chat_session_id AS chat_session_id, m.ts AS created_at FROM chat_messages m JOIN chat_sessions s ON m.chat_session_id = s.id ${whereClause} ORDER BY m.ts ASC`;
}

function buildParams(platform) {
  const params = [];
  if (platform) params.push(platform);
  return params;
}

export async function fetchBc2Messages(captureDbPath, { platform, since } = {}) {
  const db = new Database(captureDbPath, { readonly: true, fileMustExist: true });
  try {
    const query = buildQuery(platform);
    const rows = db.prepare(query).all(...buildParams(platform));
    if (!Array.isArray(rows)) return [];
    if (!since) return rows;
    const sinceDate = new Date(since);
    return rows.filter((row) => {
      const ts = new Date(String(row.created_at ?? ""));
      return isFinite(ts.getTime()) && ts >= sinceDate;
    });
  } finally {
    db.close();
  }
}

export async function syncBc2Messages({ captureDbPath, baseDir, since, platform, dryRun = false, schedule = false } = {}) {
  const capturePath = captureDbPath
    ? path.resolve(captureDbPath)
    : path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "BrowserCapture", "capture.db");

  if (!(await fs.stat(capturePath).catch(() => null))) {
    throw new Error(`Capture DB not found: ${capturePath}`);
  }

  const sinceIso = parseSince(since);
  const runOnce = async () => {
    const allRows = await fetchBc2Messages(capturePath, { platform, since: sinceIso });
    const chunks = allRows
      .map((row) => ({
        content: String(row.content ?? ""),
        source_type: "bc2-chat",
        platform: row.platform ?? null,
        file_ts: String(row.created_at ?? new Date().toISOString()),
        metadata: {
          bc2_message_id: String(row.bc2_message_id ?? ""),
          bc2_session_id: String(row.chat_session_id ?? ""),
          role: normalizeRole(row.role),
          created_at: String(row.created_at ?? new Date().toISOString())
        }
      }))
      .filter((chunk) => chunk.content.trim().length > 0);

    if (chunks.length === 0) {
      return { total: 0, inserted: 0, skipped: 0, platform, since: sinceIso };
    }

    if (dryRun) {
      return { total: chunks.length, inserted: chunks.length, skipped: 0, platform, since: sinceIso, dryRun: true };
    }

    const ingester = new DocumentIngester({ baseDir });
    await ingester.initialize();
    const result = await ingester.ingestChunks(chunks, {
      filename: DEFAULT_LOG_PATH,
      source_type: "bc2-chat",
      uniqueBy: "bc2_message_id",
      logPath: DEFAULT_LOG_PATH
    });
    await ingester.db.close();

    const inserted = Array.isArray(result.rows) ? result.rows.length : 0;
    const skipped = chunks.length - inserted;
    return { total: chunks.length, inserted, skipped, platform, since: sinceIso, dryRun: false };
  };

  if (!schedule) {
    return runOnce();
  }

  const spinner = ora(`Starting scheduled bc2-sync every ${SCHEDULE_INTERVAL_MS / 60000} minutes...`).start();
  let active = false;
  await runOnce();
  const timer = setInterval(async () => {
    if (active) return;
    active = true;
    try {
      await runOnce();
    } catch (error) {
      console.error(chalk.red(String(error?.message ?? error)));
    } finally {
      active = false;
    }
  }, SCHEDULE_INTERVAL_MS);

  process.on("SIGINT", () => {
    clearInterval(timer);
    spinner.stop();
    console.log("bc2-sync scheduled worker stopped.");
    process.exit(0);
  });

  return { scheduled: true, platform, since: sinceIso };
}

export function bindBc2SyncCommand(program) {
  const command = program.command("bc2-sync").description("Sync Browser Capture v2 chat messages into the experience database");

  command
    .option("--capture-db <path>", "Path to Browser Capture v2 SQLite database")
    .option("--base-dir <dir>", "Local storage base directory")
    .option("--since <date>", "Fetch messages on or after this ISO date")
    .option("--platform <name>", "Platform site filter")
    .option("--dry-run", "Show what would be ingested without writing to the experience database")
    .option("--schedule", "Run sync every 5 minutes")
    .action(async (options) => {
      const spinner = ora("Running bc2-sync...").start();
      try {
        const result = await syncBc2Messages({
          captureDbPath: options.captureDb,
          baseDir: options.baseDir,
          since: options.since,
          platform: options.platform,
          dryRun: Boolean(options.dryRun),
          schedule: Boolean(options.schedule)
        });
        spinner.succeed("bc2-sync completed");
        if (result.dryRun) {
          console.log(`dry-run: ${result.total} message(s) available for ingestion`);
        } else if (result.scheduled) {
          console.log("bc2-sync scheduling enabled; running in background until interrupted.");
        } else {
          console.log(`ingested: ${result.inserted} / ${result.total} messages (${result.skipped} skipped)`);
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });
}
