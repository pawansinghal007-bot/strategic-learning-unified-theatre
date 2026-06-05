import { readJsonFile, writeJsonFile } from '../llm/storage';
import { logger } from '../shared/logging/logger';

const WORKSPACE_CONTEXT_FILE = 'workspace-context.json';

export interface WorkspaceContextRecord {
  workspaceId: string;
  summary: string;
  tags: string[];
  lastIntent?: string;
  updatedAt: number;
}

export interface WorkspaceContextStore {
  workspaces: Record<string, WorkspaceContextRecord>;
}

const DEFAULT_WORKSPACE_CONTEXT_STORE: WorkspaceContextStore = {
  workspaces: {},
};

function readWorkspaceContextStore(): WorkspaceContextStore {
  return readJsonFile(WORKSPACE_CONTEXT_FILE, DEFAULT_WORKSPACE_CONTEXT_STORE);
}

function writeWorkspaceContextStore(store: WorkspaceContextStore): WorkspaceContextStore {
  writeJsonFile(WORKSPACE_CONTEXT_FILE, store);
  logger.info('workspace.context.saved', {
    workspaceCount: Object.keys(store.workspaces).length,
  });
  return store;
}

export function getWorkspaceContext(
  workspaceId?: string | null,
): WorkspaceContextRecord | null {
  if (!workspaceId) return null;
  const store = readWorkspaceContextStore();
  return store.workspaces[workspaceId] ?? null;
}

export function saveWorkspaceContext(
  workspaceId: string,
  payload: { summary: string; tags?: string[]; lastIntent?: string },
): WorkspaceContextRecord {
  const store = readWorkspaceContextStore();
  const record: WorkspaceContextRecord = {
    workspaceId,
    summary: payload.summary,
    tags: payload.tags ?? [],
    lastIntent: payload.lastIntent,
    updatedAt: Date.now(),
  };
  store.workspaces[workspaceId] = record;
  writeWorkspaceContextStore(store);
  return record;
}

export function clearWorkspaceContext(workspaceId: string): boolean {
  const store = readWorkspaceContextStore();
  if (!store.workspaces[workspaceId]) return false;
  delete store.workspaces[workspaceId];
  writeWorkspaceContextStore(store);
  return true;
}

export function buildRequestContextPrompt(
  workspaceId?: string | null,
): string | null {
  const context = getWorkspaceContext(workspaceId);
  if (!context?.summary?.trim()) return null;
  const lines = ['Workspace context:', context.summary.trim()];
  if (context.tags.length) lines.push(`Tags: ${context.tags.join(', ')}`);
  if (context.lastIntent) lines.push(`Last intent: ${context.lastIntent}`);
  return lines.join('\n');
}
