#!/usr/bin/env bash
set -euo pipefail

OUT="capabilities-dump.txt"
: > "$OUT"

section () {
  printf "\n\n===== %s =====\n" "$1" >> "$OUT"
}

append_file () {
  local file="$1"
  if [ -f "$file" ]; then
    printf "\n--- FILE: %s ---\n" "$file" >> "$OUT"
    sed -n '1,260p' "$file" >> "$OUT"
  fi
}

append_find () {
  local label="$1"
  shift
  section "$label"
  "$@" >> "$OUT" 2>&1 || true
}

section "PACKAGE"
cat package.json >> "$OUT"

section "README"
sed -n '1,220p' README.md >> "$OUT" 2>/dev/null || true

append_find "TOP TREE" find . -maxdepth 3 -type d
append_find "SRC DOMAINS" find src -maxdepth 3 -type f
append_find "RENDERER FILES" find renderer -maxdepth 3 -type f
append_find "ELECTRON FILES" find electron-ui -maxdepth 3 -type f
append_find "TEST FILES" find tests -maxdepth 3 -type f
append_find "E2E / PLAYWRIGHT / HUMAN" bash -lc "find . -maxdepth 3 -type f | grep -E 'e2e|playwright|human|ui'"
append_find "ROBOT" bash -lc "find . -maxdepth 3 -type f | grep -E '\\.robot$|robot'"

section "KEY ENTRY FILES"
append_file "src/cli.js"
append_file "src/ui/dashboard.js"
append_file "src/plugin-loader.js"
append_file "src/plugin-api.js"
append_file "src/knowledge/index.ts"
append_file "src/llm/index.ts"
append_file "src/security/security-overview/index.ts"
append_file "src/governance/workspace-quotas.ts"
append_file "src/governance/workspace-approvals.ts"

append_file "electron-ui/main.cjs"
append_file "electron-ui/preload.cjs"
append_file "electron-ui/ipc/handlers.cjs"
append_file "electron-ui/ipc/knowledge-handlers.cjs"
append_file "electron-ui/ipc/security-overview-handlers.cjs"
append_file "electron-ui/ipc/workspace-routing-handlers.cjs"
append_file "electron-ui/ipc/provider-policy-handlers.cjs"
append_file "electron-ui/ipc/provider-telemetry-handlers.cjs"
append_file "electron-ui/ipc/workspace-policy-handlers.cjs"
append_file "electron-ui/ipc/audit-handlers.cjs"
append_file "electron-ui/ipc/secrets-handlers.cjs"
append_file "electron-ui/ipc/risks-handlers.cjs"

section "DONE"
echo "Wrote $OUT"
