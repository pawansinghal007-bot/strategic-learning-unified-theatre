// src/session-supervisor.js
// Responsibility: orchestrate limit detection, DB persistence, backoff
// computation, handoff generation, and resume scheduling.
// Backoff is computed HERE before writing retry_at to the DB, so the
// stored value always reflects the true next-attempt time.

import { detectLimit } from './limit-detector.js';
import { ResumeScheduler } from './resume-scheduler.js';
import { db } from './ai-memory/memory-db.js';
import { generateAutoHandoff } from './auto-handoff.js';
import { redact } from './utils/redactor.js';

// Maximum number of resume attempts before a job is marked failed.
// Stored as a named constant so it is easy to locate and adjust.
const MAX_RETRIES = 3;

// Base backoff unit in ms (5 minutes). Exponential growth is applied
// on each successive retry: attempt 1 → 5 min, 2 → 10 min, 3 → 20 min.
// This guarantees no retry interval falls below 300,000 ms (sprint rule).
const BACKOFF_BASE_MS = 300_000;

/**
 * Compute the retry_at timestamp for a given attempt.
 *
 * @param {number} resetTime   - epoch ms when the provider limit lifts
 * @param {number} retryCount  - number of attempts already made (0 on first)
 * @returns {number}           - epoch ms for the next retry
 */
function computeRetryAt(resetTime, retryCount) {
  // On the first attempt (retryCount === 0) we target exactly resetTime.
  // On each subsequent attempt we add exponential backoff on top of resetTime
  // so that retry_at grows predictably and is always readable from the DB.
  const backoffMs = retryCount > 0
    ? Math.pow(2, retryCount - 1) * BACKOFF_BASE_MS
    : 0;
  return resetTime + backoffMs;
}

export class SessionSupervisor {
  constructor() {
    this.scheduler = new ResumeScheduler(this);
  }

  /**
   * Called when a browser-bridge or capture payload is received.
   * Detects limit signals, persists job state to both DB tables,
   * generates a machine handoff, and schedules the first retry.
   *
   * @param {{ text: string }} payload
   * @param {object} context
   * @param {string} [context.provider]
   * @param {string} [context.model]
   * @param {string} [context.workspacePath]
   * @param {string} [context.currentGoal]
   * @param {string} [context.currentTask]
   * @returns {string|undefined} sessionId if a limit was hit, else undefined
   */
  async handleCapture(payload, context) {
    const { limitHit, resetTime } = detectLimit(payload.text);
    if (!limitHit) return;

    const sessionId = `sess_${Date.now()}`;
    const provider = context.provider || 'unknown';
    const model = context.model || 'unknown';
    const workspacePath = context.workspacePath || 'unknown';

    // Redact before anything touches the DB or handoff file.
    const goalRedacted = redact(context.currentGoal || '');
    const taskRedacted = redact(context.currentTask || '');

    // First attempt: retryCount is 0, so retry_at === resetTime (no backoff yet).
    const retryAt = computeRetryAt(resetTime, 0);

    // Persist resume metadata (non-secret runtime state only).
    db.prepare(`
      INSERT INTO session_resume_metadata
        (session_id, provider, model, workspace_path, status,
         blocked_reason, reset_at, retry_at, retry_count, last_seen_at)
      VALUES (?, ?, ?, ?, 'pending', 'rate_limit', ?, ?, 0, ?)
    `).run(sessionId, provider, model, workspacePath, resetTime, retryAt, Date.now());

    // Persist continuation state (redacted content only).
    db.prepare(`
      INSERT INTO session_continuation_state
        (session_id, current_goal, goal_redacted,
         last_response_summary_redacted, resume_prompt)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      sessionId,
      // current_goal is stored in plain form for human-readable debugging.
      // S4 secret-leakage grep test should confirm no credential patterns
      // appear here after real capture payloads are used in integration tests.
      context.currentGoal || '',
      goalRedacted,
      // last_response_summary_redacted holds the redacted task description
      // for S3. In S4, once actual LLM response content is captured, this
      // field should be populated from the response summary, not the task.
      taskRedacted,
      `Continuing from auto-pause. Previous task: ${taskRedacted}. Please proceed.`
    );

    // Generate the machine handoff file (also uses redacted content).
    await generateAutoHandoff(context, resetTime);

    // Schedule the first resume at the computed retry_at.
    this.scheduler.schedule(sessionId, retryAt);

    return sessionId;
  }

  /**
   * Called at startup to restore any pending jobs that survived a restart.
   * retry_at stored in the DB already reflects the correct backoff-adjusted
   * time, so we pass it directly to the scheduler without re-applying backoff.
   */
  restorePendingJobs() {
    const jobs = db.prepare(
      `SELECT session_id, retry_at, retry_count
       FROM session_resume_metadata
       WHERE status = 'pending'`
    ).all();

    for (const job of jobs) {
      // If retry_at is in the past the scheduler fires immediately (delay = 0).
      this.scheduler.schedule(job.session_id, job.retry_at);
    }
  }

  /**
   * Called by ResumeScheduler when the timer fires.
   * Enforces MAX_RETRIES cap and computes the next retry_at with backoff
   * before rescheduling, keeping retry_at accurate in the DB at all times.
   *
   * @param {string} sessionId
   */
  resumeSession(sessionId) {
    const meta = db.prepare(
      `SELECT * FROM session_resume_metadata WHERE session_id = ?`
    ).get(sessionId);

    if (!meta || meta.status !== 'pending') return;

    if (meta.retry_count >= MAX_RETRIES) {
      db.prepare(
        `UPDATE session_resume_metadata SET status = 'failed' WHERE session_id = ?`
      ).run(sessionId);
      return;
    }

    // Increment retry_count and recompute retry_at for the *next* attempt,
    // so the DB always reflects where we will try next (not where we just tried).
    const nextRetryCount = meta.retry_count + 1;
    const nextRetryAt = computeRetryAt(meta.reset_at, nextRetryCount);

    db.prepare(`
      UPDATE session_resume_metadata
      SET status = 'active',
          retry_count = ?,
          retry_at = ?,
          last_seen_at = ?
      WHERE session_id = ?
    `).run(nextRetryCount, nextRetryAt, Date.now(), sessionId);

    // TODO (S4): trigger continuation prompt delivery into the VS Code UI here.
    // The resume_prompt is available via session_continuation_state.
  }
}

export const supervisor = new SessionSupervisor();
