import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

let execFileAsync = promisify(execFile);

// Test seam: allows unit tests to inject a mock without module re-loading.
// Only active when NODE_ENV === "test" or vitest is running.
export function __setExecFileAsync(fn) {
  execFileAsync = fn;
}

export function parseStatusSummary(sbPorcelainText) {
  const lines = sbPorcelainText
    .split(/\r?\n/g)
    .filter((l) => l.trim().length > 0);
  const first = lines[0] ?? "";
  const rest = lines.slice(1);

  let branch = null;
  let ahead = 0;
  let behind = 0;

  if (first.startsWith("##")) {
    const summary = first.replace(/^##\s*/, "");
    const parts = summary.split(" ");
    const head = parts[0] ?? "";
    branch = head.split("...")[0] || null;

    const match = summary.match(/\[(.*?)\]/);
    if (match?.[1]) {
      const chunk = match[1];
      const a = chunk.match(/ahead\s+(\d+)/);
      const b = chunk.match(/behind\s+(\d+)/);
      ahead = a ? Number.parseInt(a[1], 10) : 0;
      behind = b ? Number.parseInt(b[1], 10) : 0;
    }
  }

  const uncommitted = rest.length;

  return {
    branch: branch ?? "",
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
    uncommitted,
  };
}

export function parseLastCommitLine(line) {
  const parts = String(line ?? "")
    .trim()
    .split("|");
  if (parts.length < 3) return null;
  const [sha, msg, date] = parts;
  const d = new Date(date);
  return {
    sha,
    msg,
    date: Number.isFinite(d.getTime()) ? d.toISOString() : null,
  };
}

export class GitMonitor extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
  }

  async status(repoPath) {
    const { stdout: sb } = await execFileAsync(
      "git",
      ["status", "-sb", "--porcelain"],
      { cwd: repoPath, windowsHide: true },
    );
    const summary = parseStatusSummary(sb);

    let stashed = 0;
    try {
      const { stdout } = await execFileAsync("git", ["stash", "list"], {
        cwd: repoPath,
        windowsHide: true,
      });
      stashed = stdout
        .split(/\r?\n/g)
        .filter((l) => l.trim().length > 0).length;
    } catch {
      stashed = 0;
    }

    const { stdout: logLine } = await execFileAsync(
      "git",
      ["log", "-1", "--format=%H|%s|%ai"],
      { cwd: repoPath, windowsHide: true },
    );

    const lastCommit = parseLastCommitLine(logLine) ?? {
      sha: "",
      msg: "",
      date: null,
    };

    return {
      branch: summary.branch,
      ahead: summary.ahead,
      behind: summary.behind,
      uncommitted: summary.uncommitted,
      stashed,
      lastCommit,
    };
  }

  async hasUncommitted(repoPath) {
    const s = await this.status(repoPath);
    return s.uncommitted > 0;
  }

  async hasPendingPush(repoPath) {
    const s = await this.status(repoPath);
    return s.ahead > 0;
  }

  watchAll(repoPaths, intervalMs) {
    const repos = Array.isArray(repoPaths)
      ? repoPaths.filter((p) => typeof p === "string")
      : [];
    const interval = Math.max(1000, Number(intervalMs) || 0);

    const tick = async () => {
      for (const repoPath of repos) {
        try {
          const s = await this.status(repoPath);
          if (s.uncommitted > 0 || s.ahead > 0) {
            this.emit("warn", {
              repoPath,
              status: s,
              reason:
                s.uncommitted > 0 ? "uncommitted changes" : "pending push",
            });
          }
        } catch (err) {
          this.emit("warn", {
            repoPath,
            status: null,
            reason: String(err?.message ?? err),
          });
        }
      }
    };

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      tick().catch(() => {});
    }, interval);
    this.timer.unref?.();

    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
