#!/usr/bin/env bash
set -e
cd ~/vscodeagent/Solution

echo "=== GIT STATUS ==="
git status

echo -e "\n=== DIFF STAT (tracked changes) ==="
git diff --stat

echo -e "\n=== UNTRACKED FILES ==="
git status --porcelain | grep '^??'

echo -e "\n=== EXISTING SPRINT TAGS ==="
git tag -l 'sprint-*' | sort -V

echo -e "\n=== LAST 8 COMMITS ==="
git log -8 --oneline

echo -e "\n=== FULL TEST SUITE (fresh run) ==="
npx vitest run --reporter=verbose 2>&1 | tail -60

echo -e "\n=== TYPESCRIPT CHECK ==="
npx tsc --noEmit 2>&1 | tail -30