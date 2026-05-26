# Chaos & Resilience Runbook — Sprint 15.7

## SLO Targets

| Scenario              | SLO                                              |
| --------------------- | ------------------------------------------------ |
| Daemon crash recovery | Health ok within 30 000 ms of SIGKILL            |
| Config corruption     | Health ok within 60 000 ms of file corruption    |
| Burst load failure    | <= 1% Robot suite failures under concurrent load |

## Scenario 1: Daemon crash mid-rotation

**Fault injected:** daemon process killed with SIGKILL while handling a rotation request.

**Expected behavior — automatic recovery:**
The platform watchdog (or OS service restart) detects the missing process and restarts the daemon.
Health transitions: ok → degraded → ok within SLO.

**Signs of automatic recovery (in logs/health):**

- health --json returns { overall: "degraded" } immediately after kill
- health --json returns { overall: "ok" } within 30 s
- Structured logger (Sprint 15.2) emits ipc.rejected entries during degraded window — these are expected

**Signs that manual intervention is required:**

- health --json still returns degraded or error after 30 s
- daemon process is not visible in process list after 60 s

**Manual intervention procedure:**

1. Check daemon process: `ps aux | grep cli` (Linux) or `Get-Process node` (Windows)
2. If not running: `node ./src/cli.js daemon start`
3. Confirm recovery: `node ./src/cli.js health --json` → { overall: "ok" }
4. If DB is locked: delete `~/.vscode-rotator/daemon.lock` then restart daemon
5. File incident report with health-state.json and structured log extract

## Scenario 2: Config and state file corruption

**Fault injected:** config.json overwritten with invalid JSON; experience.db overwritten with garbage bytes.

**Expected behavior — automatic recovery:**
The daemon detects parse failure, logs an error, falls back to built-in defaults, and recreates
a valid config.json. The DB layer detects corruption, closes the connection, and recreates experience.db
from scratch (data loss is acceptable; data correctness is not).
Health transitions: ok → degraded → ok within SLO.

**Signs of automatic recovery are:**

- health --json returns { overall: "ok" } within 60 s
- config.json is readable JSON after recovery
- experience.db passes `PRAGMA integrity_check` after recovery

**Signs that manual intervention is required:**

- health --json still returns degraded or error after 60 s
- daemon logs show repeated parse errors in a loop without recovery

**Manual intervention procedure:**

1. Stop daemon: kill the process (`SIGTERM` or `Stop-Process`)
2. Delete corrupted files:
   - `rm ~/.vscode-rotator/config.json`
   - `rm ~/.vscode-rotator/experience.db`
3. Restart daemon: `node ./src/cli.js daemon start`
4. Confirm recovery: `node ./src/cli.js health --json` → { overall: "ok" }
5. Restore from backup if available (config.json.bak-chaos or last known good snapshot)

## Scenario 3: Burst load (concurrent Robot suite runs)

**Fault injected:** 3 functional + 2 regression Robot suite runs launched concurrently.

**Expected behavior — automatic recovery:**
All Robot runs complete. Failure rate stays below 1%. System health remains ok after load removed.

**Signs of automatic recovery are:**

- robot-chaos/ directory contains output.xml for each run
- computeFailureRate reports < 1% failures
- post-burst health check returns { overall: "ok" }

**Signs that manual intervention is required:**

- Failure rate > 1% — indicates a Robot suite keyword is non-deterministic or resource-starved
- Post-burst health degraded — indicates the daemon leaked resources under load

**Manual intervention procedure:**

1. Inspect robot-chaos/output.xml for the failing suite and keyword
2. If resource exhaustion: increase NODE_OPTIONS --max-old-space-size or reduce burstLoad.functionalRuns in scripts/chaos/slo.js
3. If keyword is flaky: add retry logic to the Robot resource file
4. Re-run single scenario: `npm run test:chaos:burst-load`

## Running the Chaos Suite

```powershell
# Full suite (all three scenarios sequentially)
npm run test:chaos

# Single scenario (for debugging)
npm run test:chaos:kill-daemon
npm run test:chaos:corrupt-config
npm run test:chaos:burst-load
```

CI nightly run: .github/workflows/chaos.yml (02:00 UTC, also manually triggerable)
Artifacts: robot-chaos/ uploaded as chaos-results-<run_id> on every run including failures.

## Updating SLOs

Edit scripts/chaos/slo.js. Each field is documented inline.
After changing a threshold, run npm run test:chaos locally and confirm the summary table
shows the new values taking effect before merging.
