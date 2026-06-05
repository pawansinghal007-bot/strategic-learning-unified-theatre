import { readJsonFile, writeJsonFile } from "./storage";
import { logger } from "../shared/logging/logger";

const ROUTING_HISTORY_FILE = "routing-history.json";
const MAX_HISTORY = 200;

type RoutingDecisionInput = {
  request: {
    requestId: string;
    workspaceId?: string;
    intent?: string;
  };
  provider: string;
  model: string;
  success: boolean;
  reason: string;
  fallbackFrom?: string;
  latencyMs?: number;
  errorMessage?: string;
};

type RoutingHistoryRecord = {
  id: string;
  requestId: string;
  workspaceId: string;
  provider: string;
  model: string;
  intent?: string;
  success: boolean;
  reason: string;
  fallbackFrom?: string;
  latencyMs?: number;
  createdAt: number;
  errorMessage?: string;
};

function loadHistory(): RoutingHistoryRecord[] {
  return readJsonFile<RoutingHistoryRecord[]>(ROUTING_HISTORY_FILE, []);
}

function saveHistory(records: RoutingHistoryRecord[]) {
  writeJsonFile(ROUTING_HISTORY_FILE, records.slice(0, MAX_HISTORY));
}

function nextId() {
  return `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function recordRoutingDecision(input: RoutingDecisionInput) {
  const snapshot = loadHistory();

  const record: RoutingHistoryRecord = {
    id: nextId(),
    requestId: input.request.requestId,
    workspaceId: input.request.workspaceId,
    provider: input.provider,
    model: input.model,
    intent: input.request.intent,
    success: input.success,
    reason: input.reason,
    fallbackFrom: input.fallbackFrom,
    latencyMs: input.latencyMs,
    createdAt: Date.now(),
    errorMessage: input.errorMessage,
  };

  snapshot.unshift(record);
  saveHistory(snapshot);

  logger.info("routing.history.recorded", {
    requestId: record.requestId,
    provider: record.provider,
    success: record.success,
    reason: record.reason,
  });
}

export function getRoutingHistory(limit = 50) {
  return loadHistory().slice(0, limit);
}

export function resetRoutingHistory() {
  saveHistory([]);
  logger.info("routing.history.reset");
}
