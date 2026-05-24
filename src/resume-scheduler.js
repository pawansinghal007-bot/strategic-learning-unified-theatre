// src/resume-scheduler.js
// Responsibility: schedule a single delayed callback per session.
// Backoff arithmetic is NOT handled here — the supervisor computes
// the final retry_at timestamp before calling schedule(), so this
// module receives an already-resolved target time and fires once.

export class ResumeScheduler {
  constructor(supervisor) {
    this.supervisor = supervisor;
    this.timers = new Map();
  }

  /**
   * Schedule a resume for sessionId at targetTime (epoch ms).
   * If targetTime is already in the past, fires immediately (synchronously
   * deferred via setTimeout 0 to keep the call stack clean).
   * No backoff is applied here; caller is responsible for passing the
   * correct final retry_at value.
   *
   * @param {string} sessionId
   * @param {number} targetTime  - epoch ms of the desired retry moment
   */
  schedule(sessionId, targetTime) {
    // Cancel any existing timer for this session before setting a new one.
    this.clear(sessionId);

    const delay = Math.max(0, targetTime - Date.now());

    // Guard: enforce the project rule that no retry polling interval
    // may be under 300,000 ms (5 minutes), unless the job is already
    // overdue (delay === 0).
    if (delay > 0 && delay < 300_000) {
      throw new Error(
        `ResumeScheduler: delay ${delay}ms is below the 300,000ms minimum. ` +
        `Caller must pass a retry_at that is at least 5 minutes in the future.`
      );
    }

    // Cap at ~24 days to avoid setTimeout integer overflow.
    const safeDelay = Math.min(delay, 2_147_483_647);

    const timer = setTimeout(() => {
      this.timers.delete(sessionId);
      this.supervisor.resumeSession(sessionId);
    }, safeDelay);

    this.timers.set(sessionId, timer);
  }

  /**
   * Cancel a pending timer for sessionId. Safe to call when no timer exists.
   *
   * @param {string} sessionId
   */
  clear(sessionId) {
    if (this.timers.has(sessionId)) {
      clearTimeout(this.timers.get(sessionId));
      this.timers.delete(sessionId);
    }
  }

  /**
   * Cancel all pending timers. Useful for clean shutdown in tests.
   */
  clearAll() {
    for (const [sessionId] of this.timers) {
      this.clear(sessionId);
    }
  }
}
