import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";

function getDbPath(): string {
  const stateDir =
    process.env.ROTATOR_STATE_DIR ||
    path.join(os.homedir(), ".strategic-learning");
  return process.env.DB_PATH || path.join(stateDir, "workspace-context.db");
}

function getDb() {
  const db = new Database(getDbPath());
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_context (
    workspaceId TEXT PRIMARY KEY,
    summary TEXT,
    tags TEXT,
    lastIntent TEXT,
    updatedAt INTEGER
  )`);
  return db;
}

export function setWorkspaceContext(
  workspaceId: string,
  payload: { summary?: string; tags?: string[]; lastIntent?: string },
) {
  const db = getDb();
  const updatedAt = Date.now();

  // Truncate summary at write time with 500-char cap + "..." suffix
  let summaryToStore = payload.summary ?? null;
  if (summaryToStore && summaryToStore.length > 500) {
    summaryToStore = summaryToStore.slice(0, 500) + "...";
  }

  db.prepare(
    `INSERT OR REPLACE INTO workspace_context (workspaceId, summary, tags, lastIntent, updatedAt) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    workspaceId,
    summaryToStore,
    JSON.stringify(payload.tags ?? []),
    payload.lastIntent ?? null,
    updatedAt,
  );
  db.close();
  return {
    workspaceId,
    summary: summaryToStore,
    tags: payload.tags ?? [],
    lastIntent: payload.lastIntent ?? null,
    updatedAt,
  };
}

export function saveWorkspaceContext(
  workspaceId: string,
  payload: { summary?: string; tags?: string[]; lastIntent?: string },
) {
  return setWorkspaceContext(workspaceId, payload);
}

export function getWorkspaceContext(workspaceId: string) {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM workspace_context WHERE workspaceId = ?`)
    .get(workspaceId) as any;
  db.close();
  if (!row) return null;
  return { ...row, tags: JSON.parse(row.tags || "[]") };
}

export function clearWorkspaceContext(workspaceId: string) {
  const db = getDb();
  db.prepare(`DELETE FROM workspace_context WHERE workspaceId = ?`).run(
    workspaceId,
  );
  db.close();
}

export function buildWorkspaceContextPrompt(workspaceId: string): string {
  const ctx = getWorkspaceContext(workspaceId);
  if (!ctx) return "";
  const lines = ["Workspace context:"];
  if (ctx.summary) lines.push(ctx.summary);
  if (ctx.tags?.length) lines.push(`Tags: ${ctx.tags.join(", ")}`);
  if (ctx.lastIntent) lines.push(`Last intent: ${ctx.lastIntent}`);
  return lines.join("\n");
}
