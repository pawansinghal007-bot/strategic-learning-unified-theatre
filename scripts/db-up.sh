#!/usr/bin/env bash
set -euo pipefail
QWEN_STACK_DIR="${QWEN_STACK_DIR:-$HOME/qwen-stack}"
if [ ! -d "$QWEN_STACK_DIR" ]; then
  echo "qwen-stack not found at $QWEN_STACK_DIR — set QWEN_STACK_DIR if it lives elsewhere." >&2
  exit 1
fi
# --profile quality makes the profile-gated 'postgres' service eligible to start;
# naming it explicitly here starts ONLY postgres (it declares no depends_on), not
# sonarqube/sonar-db. Standard `docker compose up <service>` semantics: --profile
# widens what's selectable, the explicit service name scopes what actually starts.
# Idempotent: if postgres is already running this is a no-op.
(cd "$QWEN_STACK_DIR" && docker compose --profile quality up -d postgres)
