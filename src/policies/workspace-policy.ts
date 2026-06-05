import { readJsonFile, writeJsonFile } from '../llm/storage';
import { logger } from '../shared/logging/logger';
import type { PolicyState } from './provider-policy';
import { getProviderPolicy } from './provider-policy';

const WORKSPACE_POLICY_FILE = 'workspace-policies.json';

export interface WorkspacePolicyOverride {
  workspaceId: string;
  policy: Partial<PolicyState>;
  updatedAt: number;
}

export interface WorkspacePolicyStore {
  workspaces: Record<string, WorkspacePolicyOverride>;
}

const DEFAULT_WORKSPACE_POLICY_STORE: WorkspacePolicyStore = {
  workspaces: {},
};

function readWorkspacePolicyStore(): WorkspacePolicyStore {
  return readJsonFile(WORKSPACE_POLICY_FILE, DEFAULT_WORKSPACE_POLICY_STORE);
}

function writeWorkspacePolicyStore(store: WorkspacePolicyStore): WorkspacePolicyStore {
  writeJsonFile(WORKSPACE_POLICY_FILE, store);
  logger.info('workspace.policy.saved', {
    workspaceCount: Object.keys(store.workspaces).length,
  });
  return store;
}

export function getWorkspacePolicyOverride(
  workspaceId?: string | null,
): WorkspacePolicyOverride | null {
  if (!workspaceId) return null;
  const store = readWorkspacePolicyStore();
  return store.workspaces[workspaceId] ?? null;
}

export function setWorkspacePolicyOverride(
  workspaceId: string,
  policy: Partial<PolicyState>,
): WorkspacePolicyOverride {
  const store = readWorkspacePolicyStore();
  const next: WorkspacePolicyOverride = {
    workspaceId,
    policy,
    updatedAt: Date.now(),
  };
  store.workspaces[workspaceId] = next;
  writeWorkspacePolicyStore(store);
  return next;
}

export function clearWorkspacePolicyOverride(workspaceId: string): boolean {
  const store = readWorkspacePolicyStore();
  if (!store.workspaces[workspaceId]) return false;
  delete store.workspaces[workspaceId];
  writeWorkspacePolicyStore(store);
  return true;
}

export function listWorkspacePolicyOverrides(): WorkspacePolicyOverride[] {
  const store = readWorkspacePolicyStore();
  return Object.values(store.workspaces).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function resolveWorkspacePolicyState(workspaceId?: string | null): {
  policy: PolicyState;
  source: 'global' | 'workspace';
  workspaceId?: string;
} {
  const globalPolicy = getProviderPolicy();
  if (!workspaceId) return { policy: globalPolicy, source: 'global' };

  const override = getWorkspacePolicyOverride(workspaceId);
  if (!override) return { policy: globalPolicy, source: 'global', workspaceId };

  return {
    policy: { ...globalPolicy, ...override.policy, updatedAt: override.updatedAt },
    source: 'workspace',
    workspaceId,
  };
}
