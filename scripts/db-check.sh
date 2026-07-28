#!/usr/bin/env bash
set -euo pipefail
# This is a SHARED, long-running instance owned by qwen-stack (restart: unless-stopped),
# already holding real indexed data at the time this sprint was written. Solution's
# tooling does not own its lifecycle and must not stop it here — another consumer, or
# the rest of the qwen-stack `quality` profile, may depend on it staying up. This
# script only reports status. To actually stop it, do so deliberately and manually:
#   cd ~/qwen-stack && docker compose stop postgres
docker exec qwen-postgres psql -U unified -d unified_theatre -c '\dt'
docker exec qwen-postgres psql -U unified -d unified_theatre -c 'SELECT count(*) FROM symbols;'
