# Sprint 27 — Policy Modes + Manual Provider Controls

## Goal

Add persistent policy controls that shape routing behavior through routing
mode, allow/block rules, and manual provider pinning.

## In scope

- Persistent routing mode (cloud/hybrid/local-only)
- Persistent provider allow/block lists
- Manual provider pinning
- Gateway policy filtering before provider execution
- Dashboard controls for policy settings
- CLI commands for policy settings

## Out of scope

- Role-based governance
- Team policy sync
- Sensitive-data detection
- Automatic enterprise compliance policies
- Cost-based policy optimization

## Acceptance criteria

1. Gateway filters provider candidates through policy rules.
2. Local-only mode routes only to local.
3. Blocked providers are never selected.
4. Manual provider pinning moves pinned provider to front when allowed.
5. Dashboard and CLI can inspect and modify provider policy.

## Estimated effort

24–32 hours, building on Sprint 26 routing and Sprint 24 storage patterns.
