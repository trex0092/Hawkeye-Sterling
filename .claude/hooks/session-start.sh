#!/bin/bash
# Hawkeye Sterling — Claude Code SessionStart hook (web sessions only).
#
# Prepares a fresh cloud-session container so every test surface works
# immediately: typecheck, vitest (root + web), integration tests (need
# dist/ for the @brain alias), eslint, and Playwright E2E.
#
# Idempotent: safe to run on every session start; fast when the container
# cache already has dependencies.
set -euo pipefail

# Local dev machines manage their own environment — only run on the web.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "[session-start] installing root dependencies"
npm install --no-audit --no-fund

echo "[session-start] installing web dependencies"
(cd web && npm install --no-audit --no-fund && npm run gen:next-env)

echo "[session-start] building dist/ (integration tests resolve @brain from dist)"
npx tsc || echo "[session-start] WARN: tsc build failed — integration tests may not resolve @brain"

# ── Playwright browser shim ──────────────────────────────────────────────
# The web sandbox network policy blocks cdn.playwright.dev (and mirrors),
# so the exact browser build this repo's Playwright version expects usually
# cannot be downloaded. The base image ships a compatible Chromium under
# $PLAYWRIGHT_BROWSERS_PATH; when the expected build directory is missing,
# link its executable to the newest build available so browserType.launch
# finds a working binary.
BROWSERS_DIR="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

shim_browser() {
  local prefix="$1" rel_expected="$2" rel_existing="$3"
  local expected exe fallback
  expected=$( (cd web && npx playwright install --dry-run 2>/dev/null) \
    | grep -oE "${BROWSERS_DIR}/${prefix}-[0-9]+" | head -1) || true
  [ -n "$expected" ] || return 0
  exe="$expected/$rel_expected"
  [ -e "$exe" ] && return 0
  fallback=$(ls -d "${BROWSERS_DIR}/${prefix}-"* 2>/dev/null | sort -V | tail -1) || true
  if [ -z "$fallback" ] || [ ! -e "$fallback/$rel_existing" ]; then
    echo "[session-start] WARN: no ${prefix} build available to shim ${exe}"
    return 0
  fi
  mkdir -p "$(dirname "$exe")"
  ln -sfn "$fallback/$rel_existing" "$exe"
  echo "[session-start] shimmed ${exe} -> ${fallback}/${rel_existing}"
}

shim_browser "chromium_headless_shell" \
  "chrome-headless-shell-linux64/chrome-headless-shell" \
  "chrome-linux/headless_shell"
shim_browser "chromium" \
  "chrome-linux/chrome" \
  "chrome-linux/chrome"

# ── E2E auth plumbing ────────────────────────────────────────────────────
# The Playwright specs authenticate with ADMIN_TOKEN; the same default test
# value is baked into the specs and playwright.config.ts webServer env, so
# the suite is self-consistent. Exporting it session-wide keeps ad-hoc
# dev-server runs and curl probes in agreement with the suite. This is a
# TEST-ONLY value — never the production ADMIN_TOKEN, which lives solely in
# Netlify env vars.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export ADMIN_TOKEN="${ADMIN_TOKEN:-test-admin-token-for-e2e}"' >> "$CLAUDE_ENV_FILE"
fi

echo "[session-start] done"
