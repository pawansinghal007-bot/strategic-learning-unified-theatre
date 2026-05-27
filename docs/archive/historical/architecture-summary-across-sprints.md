Architecture summary across sprints:

S1 — encrypted account store + CLI foundation (the bedrock everything else builds on)
S2 — atomic auth-file swapping and VS Code kill/restart logic (the core rotation mechanism)
S3 — the background watcher daemon that auto-triggers rotation when a token expires or quota is hit
S4 — VS Code profile isolation so each account gets its own extensions, theme, and workspace binding
S5 — lightweight PROGRESS.md journal and Git monitor (uncommitted changes, unsynced commits surfaced as warnings)
S6 — OS-native secret storage via keytar, an Electron system-tray UI, e2e tests, and a one-command service installer

