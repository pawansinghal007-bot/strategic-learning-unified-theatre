import { readJsonFile, writeJsonFile } from "../llm/storage.js";
import { getProviderPolicy } from "./provider-policy.js";

const OVERRIDES_FILE = "workspace-policy-overrides.json";

export interface WorkspacePolicyPatch {
  routingMode?: "cloud" | "hybrid" | "local-only";
  manualProvider?: string | null;
  allowedProviders?: string[];
  blockedProviders?: string[];
  [key: string]: unknown;
}

export interface WorkspacePolicyRecord {
  workspaceId: string;
  policy: WorkspacePolicyPatch;
  updatedAt: number;
}

interface OverridesStore {
  overrides: WorkspacePolicyRecord[];
}

const DEFAULT_STORE: OverridesStore = { overrides: [] };

function loadStore(): OverridesStore {
  return readJsonFile(OVERRIDES_FILE, DEFAULT_STORE);
}

function saveStore(store: OverridesStore): void {
  writeJsonFile(OVERRIDES_FILE, store);
}

export function getWorkspacePolicyOverride(
  workspaceId: string,
): WorkspacePolicyRecord | null {
  const store = loadStore();
  return store.overrides.find((o) => o.workspaceId === workspaceId) ?? null;
}

export function setWorkspacePolicyOverride(
  workspaceId: string,
  policyPatch: WorkspacePolicyPatch,
): WorkspacePolicyRecord {
  const store = loadStore();
  const existing = store.overrides.find((o) => o.workspaceId === workspaceId);
  const now = Date.now();

  if (existing) {
    // Merge the new patch into the existing workspace policy
    existing.policy = { ...existing.policy, ...policyPatch };
    existing.updatedAt = now;
    saveStore(store);
    return existing;
  }

  const record: WorkspacePolicyRecord = {
    workspaceId,
    policy: { ...policyPatch },
    updatedAt: now,
  };
  store.overrides.push(record);
  saveStore(store);
  return record;
}

export function clearWorkspacePolicyOverride(workspaceId: string): boolean {
  const store = loadStore();
  const before = store.overrides.length;
  store.overrides = store.overrides.filter(
    (o) => o.workspaceId !== workspaceId,
  );
  saveStore(store);
  return store.overrides.length < before;
}

export function listWorkspacePolicyOverrides(): WorkspacePolicyRecord[] {
  return loadStore().overrides;
}

export function resolveWorkspacePolicyState(workspaceId: string): {
  source: "global" | "workspace";
  workspaceId?: string;
  policy: Record<string, unknown>;
} {
  const global = getProviderPolicy();
  const override = getWorkspacePolicyOverride(workspaceId);

  if (!override) {
    return { source: "global", policy: { ...global } };
  }

  // Only override fields that are EXPLICITLY present in the workspace patch.
  // This ensures global fields like allowedProviders are preserved when the
  // workspace patch doesn't set them.
  const merged: Record<string, unknown> = { ...global };
  for (const [key, value] of Object.entries(override.policy)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return {
    source: "workspace",
    workspaceId,
    policy: merged,
  };
}
