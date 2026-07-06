/**
 * src/shared/audit/decision-receipt.ts
 *
 * Decision receipt logger for audit trail of retrieval strategy choices.
 */

import { logger } from "../logging/logger.js";

// ─── types ────────────────────────────────────────────────────────────────────

export interface DecisionReceipt {
  timestamp?: string;
  toolName: string;
  surface: string;
  callerIdentity: string;
  input: string;
  alternativesConsidered?: string[];
  outcome?: string;
  externalEffect?: boolean;
  reversible?: boolean;
  detail?: unknown;
}

// ─── in-memory storage ────────────────────────────────────────────────────────

const receipts: DecisionReceipt[] = [];

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Records a decision receipt by logging via the shared logger and storing
 * in an in-memory array.
 */
export function recordDecision(receipt: DecisionReceipt): void {
  const entry: DecisionReceipt = {
    ...receipt,
    timestamp: new Date().toISOString(),
  };
  logger.info("audit.decision-receipt", entry);
  receipts.push(entry);
}

/**
 * Returns the in-memory array of decision receipts read-only.
 */
export function getReceipts(): readonly DecisionReceipt[] {
  return receipts;
}

/**
 * Clears all decision receipts (for testing only).
 */
export function clearReceipts(): void {
  receipts.length = 0;
}
