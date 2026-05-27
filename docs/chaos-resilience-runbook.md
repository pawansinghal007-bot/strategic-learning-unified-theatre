# Chaos Resilience Runbook

## SLO Targets

- Daemon crash recovery should complete through automatic recovery within 30 seconds; manual intervention starts if the daemon cannot restart cleanly.
- Corrupt configuration recovery should complete through automatic recovery within 30 seconds; manual intervention starts if a valid backup cannot be restored.
- Burst load testing should stay below the configured error threshold through automatic recovery; manual intervention starts when repeated test runs exceed the SLO.

## Running The Suite

Run the full suite with:

```bash
npm run test:chaos
```

Run a single scenario with:

```bash
npm run test:chaos:kill-daemon
npm run test:chaos:corrupt-config
npm run test:chaos:burst-load
```

## CI Coverage

The scheduled workflow lives at `.github/workflows/chaos.yml`. It installs Robot Framework, runs the chaos command, and uploads the chaos artifacts for review.

## Escalation

Use manual intervention when automatic recovery fails, when recovered state cannot be verified, or when the same scenario fails repeatedly across scheduled runs.
