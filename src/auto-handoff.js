// src/auto-handoff.js
// Responsibility: build and write a machine-readable handoff payload
// whenever a session is auto-paused due to a rate/usage limit.
//
// Design rules:
//  1. ALL user-supplied strings are redacted before they enter the payload.
//  2. This module delegates actual file I/O to the existing createHandoff()
//     infrastructure so the on-disk format stays consistent with manual
//     handoffs.
//  3. No DB access here — persistence is the supervisor's responsibility.

import { redact } from './utils/redactor.js';
import { createHandoff } from './agent-handoff.js';

/**
 * Sanitize the context object, attach auto-pause metadata, and write a
 * machine handoff file via the shared createHandoff() helper.
 *
 * @param {object} context
 * @param {string} [context.currentTask]       - current LLM task description
 * @param {string} [context.currentGoal]       - high-level session goal
 * @param {string} [context.provider]          - LLM provider identifier
 * @param {string} [context.model]             - LLM model identifier
 * @param {string} [context.workspacePath]     - VS Code workspace root
 * @param {number} resetTime                   - epoch ms when the limit lifts
 * @returns {Promise<string>}                  - path of the written handoff file
 */
export async function generateAutoHandoff(context, resetTime) {
  // Redact every free-text field before constructing the payload.
  // Fields that are never secret (provider, model, workspacePath) are
  // passed through unchanged.
  const sanitizedTask = redact(context.currentTask || '');
  const sanitizedGoal = redact(context.currentGoal || '');

  const handoffPayload = {
    // Pass through non-secret identity fields as-is.
    provider:      context.provider      || 'unknown',
    model:         context.model         || 'unknown',
    workspacePath: context.workspacePath || 'unknown',

    // Replace raw task/goal with their redacted equivalents.
    currentTask:   sanitizedTask,
    currentGoal:   sanitizedGoal,

    // Auto-pause markers consumed by the S4 resume handler.
    is_auto:            true,
    resume_target_time: resetTime,

    // Human + machine readable continuation prompt.
    // Built entirely from already-redacted values — no raw secrets.
    continuation_prompt: [
      'Continuing from auto-pause.',
      sanitizedGoal  ? `Goal: ${sanitizedGoal}.`       : null,
      sanitizedTask  ? `Previous task: ${sanitizedTask}.` : null,
      'Please proceed from where you left off.',
    ]
      .filter(Boolean)
      .join(' '),
  };

  // Delegate file I/O to the shared handoff writer.
  // Returns the path of the written file (used by tests and the supervisor).
  return await createHandoff(handoffPayload);
}
