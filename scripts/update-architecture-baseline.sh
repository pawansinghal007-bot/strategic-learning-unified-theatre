#!/usr/bin/env bash

TS=$(date +%Y%m%d-%H%M%S)

OUT="PROJECT_ARCHITECTURE_BASELINE-${TS}.md"

echo "Generating architecture baseline..."

# put your original Phase-0 command body here

echo
echo "Updating stable baseline..."

cp "$OUT" PROJECT_ARCHITECTURE_BASELINE.md

echo
echo "Done:"
echo "$OUT"
echo "PROJECT_ARCHITECTURE_BASELINE.md"