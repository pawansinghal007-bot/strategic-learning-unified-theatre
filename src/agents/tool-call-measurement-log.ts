import { readJsonFile, writeJsonFile } from "../llm/storage.js";
import type { ToolCallClass } from "./tool-call-classifier.js";

const MEASUREMENT_LOG_FILE = "tool-call-measurement-log.json";
const MAX_ENTRIES = 2000; // bounded, oldest entries drop off — this is a
// sampling log for measurement, not a permanent record

export interface ToolCallMeasurementEntry {
  toolName: string;
  args: Record<string, string>;
  classification: ToolCallClass;
  skippedGatewayAsk: boolean;
  timestamp: number;
}

interface MeasurementStore {
  entries: ToolCallMeasurementEntry[];
}

/**
 * Appends one real tool-call observation for later classifier-cost
 * analysis (Option A). Intentionally separate from audit-log.json,
 * which has its own hash-chained integrity purpose unrelated to this.
 * Best-effort: logging failures must never break a real tool call.
 */
export function recordToolCallForMeasurement(
  entry: Omit<ToolCallMeasurementEntry, "timestamp">,
): void {
  try {
    const store = readJsonFile<MeasurementStore>(MEASUREMENT_LOG_FILE, {
      entries: [],
    });
    store.entries.push({ ...entry, timestamp: Date.now() });
    if (store.entries.length > MAX_ENTRIES) {
      store.entries = store.entries.slice(-MAX_ENTRIES);
    }
    writeJsonFile(MEASUREMENT_LOG_FILE, store);
  } catch {
    // Best-effort only — never let measurement logging break a real tool call.
  }
}
