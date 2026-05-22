#!/usr/bin/env bash
# Secret scan — fails if obvious hardcoded credentials are found in source.
# Mirrors the CI secret-leak-check step in .github/workflows/ci.yml.
set -euo pipefail

if grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
  -E "(sk-ant-[a-zA-Z0-9]{32,}|AKIA[A-Z0-9]{16})" \
  src/ web/app/ web/lib/ netlify/ 2>/dev/null; then
  echo "HARDCODED SECRET DETECTED — remove from source and rotate immediately"
  exit 1
fi
echo "No hardcoded secrets found"
