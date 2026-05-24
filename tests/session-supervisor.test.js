// tests/session-supervisor.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionSupervisor } from '../src/session-supervisor.js';
import { db } from '../src/ai-memory/memory-db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearTables() {
  db.exec(`
    DELETE FROM session_continuation_state;
    DELETE FROM session_resume_metadata;
  `);
}

function insertPendingJob({ sessionId, resetAt, retryAt, retryCount }) {
  db.prepare(`
    INSERT INTO session_resume_metadata
      (session_id, status, retry_count, reset_at, retry_at, last_seen_at,
       provider, model, workspace_path, blocked_reason)
    VALUES (?, 'pending', ?, ?, ?, ?, 'test', 'test', 'test', 'rate_limit')
  `).run(sessionId, retryCount, resetAt, retryAt, Date.now());
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SessionSupervisor', () => {
  let supervisor;

  beforeEach(() => {
    vi.useFakeTimers();
    clearTables();
    supervisor = new SessionSupervisor();
  });

  afterEach(() => {
    supervisor.scheduler.clearAll();
    vi.useRealTimers();
  });

  // ── Restart restore ───────────────────────────────────────────────────────

  describe('restorePendingJobs()', () => {
    it('restores a pending job and fires at its stored retry_at', () => {
      // retry_at is already the final scheduled time: the supervisor stored it
      // as resetAt + backoff when the job was first created. On restore we
      // pass it directly to the scheduler with no additional backoff.
      const resetAt = Date.now() + 600_000;   // 10 min from now (provider reset)
      const retryAt = resetAt;                // first attempt, no backoff yet

      insertPendingJob({
        sessionId: 'sess_restore_1',
        resetAt,
        retryAt,
        retryCount: 0,
      });

      const resumeSpy = vi.spyOn(supervisor, 'resumeSession');
      supervisor.restorePendingJobs();

      // Should not have fired yet.
      vi.advanceTimersByTime(599_999);
      expect(resumeSpy).not.toHaveBeenCalled();

      // Advance to exact retry_at — should fire now.
      vi.advanceTimersByTime(1);
      expect(resumeSpy).toHaveBeenCalledOnce();
      expect(resumeSpy).toHaveBeenCalledWith('sess_restore_1');
    });

    it('fires immediately for a job whose retry_at is already in the past', () => {
      const pastTime = Date.now() - 1;   // already overdue

      insertPendingJob({
        sessionId: 'sess_overdue',
        resetAt: pastTime,
        retryAt: pastTime,
        retryCount: 0,
      });

      const resumeSpy = vi.spyOn(supervisor, 'resumeSession');
      supervisor.restorePendingJobs();

      // setTimeout(fn, 0) fires after a tick.
      vi.advanceTimersByTime(0);
      expect(resumeSpy).toHaveBeenCalledWith('sess_overdue');
    });

    it('does not restore jobs with status other than pending', () => {
      db.prepare(`
        INSERT INTO session_resume_metadata
          (session_id, status, retry_count, reset_at, retry_at, last_seen_at,
           provider, model, workspace_path, blocked_reason)
        VALUES ('sess_failed', 'failed', 3, ?, ?, ?, 'test', 'test', 'test', 'rate_limit')
      `).run(Date.now(), Date.now(), Date.now());

      const resumeSpy = vi.spyOn(supervisor, 'resumeSession');
      supervisor.restorePendingJobs();

      vi.advanceTimersByTime(10_000);
      expect(resumeSpy).not.toHaveBeenCalled();
    });
  });

  // ── Max retry enforcement ─────────────────────────────────────────────────

  describe('resumeSession()', () => {
    it('marks job failed when retry_count has reached MAX_RETRIES (3)', () => {
      insertPendingJob({
        sessionId: 'sess_maxed',
        resetAt: Date.now(),
        retryAt: Date.now(),
        retryCount: 3,   // already at cap
      });

      supervisor.resumeSession('sess_maxed');

      const row = db.prepare(
        `SELECT status FROM session_resume_metadata WHERE session_id = ?`
      ).get('sess_maxed');

      expect(row.status).toBe('failed');
    });

    it('increments retry_count and updates retry_at with backoff on a valid attempt', () => {
      const resetAt = Date.now() + 600_000;

      insertPendingJob({
        sessionId: 'sess_retry',
        resetAt,
        retryAt: resetAt,   // first attempt, no backoff
        retryCount: 0,
      });

      supervisor.resumeSession('sess_retry');

      const row = db.prepare(
        `SELECT retry_count, retry_at, reset_at, status
         FROM session_resume_metadata WHERE session_id = ?`
      ).get('sess_retry');

      // After the first resume, retry_count should be 1.
      expect(row.retry_count).toBe(1);
      // retry_at should now be reset_at + 1 backoff step (2^0 * 300,000 = 300,000 ms).
      expect(row.retry_at).toBe(resetAt + 300_000);
      // Status transitions to active during the attempt.
      expect(row.status).toBe('active');
    });

    it('does not act on a session that is not pending', () => {
      insertPendingJob({
        sessionId: 'sess_active',
        resetAt: Date.now(),
        retryAt: Date.now(),
        retryCount: 0,
      });
      db.prepare(
        `UPDATE session_resume_metadata SET status = 'active' WHERE session_id = ?`
      ).run('sess_active');

      supervisor.resumeSession('sess_active');

      const row = db.prepare(
        `SELECT retry_count FROM session_resume_metadata WHERE session_id = ?`
      ).get('sess_active');
      // retry_count must not have changed.
      expect(row.retry_count).toBe(0);
    });
  });

  // ── Scheduler minimum delay guard ─────────────────────────────────────────

  describe('ResumeScheduler minimum delay guard', () => {
    it('throws if a non-overdue delay is below 300,000 ms', () => {
      const tooSoon = Date.now() + 60_000;   // only 1 minute away

      expect(() => {
        supervisor.scheduler.schedule('sess_toosoon', tooSoon);
      }).toThrow(/300,000ms minimum/);
    });

    it('does not throw for a delay of exactly 300,000 ms', () => {
      const okTime = Date.now() + 300_000;

      expect(() => {
        supervisor.scheduler.schedule('sess_ok', okTime);
      }).not.toThrow();

      // Clean up timer.
      supervisor.scheduler.clear('sess_ok');
    });

    it('does not throw for an overdue job (delay === 0)', () => {
      const pastTime = Date.now() - 1;

      expect(() => {
        supervisor.scheduler.schedule('sess_past', pastTime);
      }).not.toThrow();
    });
  });
});
