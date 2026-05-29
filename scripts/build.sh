#!/usr/bin/env bash
# Hawkeye Sterling — Netlify build script.
#
# Step markers (>>> HS-STEP-N) make the failing step instantly findable
# in the Netlify deploy log. Exit code of each step is also echoed so a
# non-zero from a piped command stays visible. `set -euo pipefail` ensures
# any unset variable or pipe failure is treated as an error.
#
# Build order:
#   1. npm install root    → deps incl. optional exceljs for XLSX adapters
#   2. tsc root            → compiles src/brain → dist/
#   3. gen-weaponized-brain → weaponizes the compiled brain
#   4. cd web && npm ci   → reproducible install for Next.js tree
#   4b. patch-als          → patches async-local-storage for Next.js 15 compat
#   4c. patch-runtime-snapshot → injects runtime snapshot for the web build
#   5. clear .next cache   → avoids stale chunk refs after major dep bumps
#   6. next build          → produces the Next.js 15 SSR bundle

set -euo pipefail

# Raise the open-file-descriptor limit. Next.js 16 + webpack opens hundreds
# of files concurrently during static page generation; Netlify build agents
# default to 1024 which causes EMFILE failures on repos with 130+ routes.
# 65535 is the standard Linux per-user ulimit hard limit (RLIMIT_NOFILE_MAX
# on most distros). Falls back to lower values if the hard limit is stricter
# (container-constrained environments may lock the hard limit at 4096).
# experimental.cpus=1 in next.config.mjs further reduces concurrent fd usage.
ulimit -n 65535 2>/dev/null || ulimit -n 8192 2>/dev/null || ulimit -n 4096 2>/dev/null || true
echo ">>> HS-ULIMIT: open-files limit = $(ulimit -n)"

step() {
  echo ">>> HS-STEP: $*"
}

step "1 npm ci root"
# Use npm ci (not npm install) so the build is fully reproducible against
# package-lock.json. npm install can pull newer dep versions between builds
# and fail with ERESOLVE (exit code 2) when a new peer-dep conflict lands —
# this was the root cause of the non-deterministic "exit code 2" Netlify
# failures: the same commit succeeded at 3:46 PM and failed at 3:51 PM
# because npm install resolved a different transitive dep version.
# package-lock.json is committed (verified in sync) so npm ci is safe here.
npm ci --include=dev --no-audit --no-fund
echo ">>> HS-STEP-1 ok (exit $?)"

step "2 tsc root"
npm run build
echo ">>> HS-STEP-2 ok (exit $?)"

step "3 gen-weaponized-brain"
node scripts/gen-weaponized-brain.cjs
echo ">>> HS-STEP-3 ok (exit $?)"

step "4 cd web && npm ci"
cd web
npm ci --include=dev
echo ">>> HS-STEP-4 ok (exit $?)"

step "4b patch-als"
node ../scripts/patch-als.cjs
echo ">>> HS-STEP-4b ok (exit $?)"

step "4c patch-runtime-snapshot"
node ../scripts/patch-runtime-snapshot.cjs
echo ">>> HS-STEP-4c ok (exit $?)"

step "5 clear .next cache"
rm -rf .next
echo ">>> HS-STEP-5 ok (exit $?)"

step "5b web typecheck"
npm run typecheck
echo ">>> HS-STEP-5b ok (exit $?)"

step "6 next build"
APP_VERSION=$(node -p "require('../package.json').version") \
  GIT_COMMIT_SHA="${COMMIT_REF:-}" \
  NEXT_PUBLIC_COMMIT_SHA="${COMMIT_REF:-}" \
  npm run build
echo ">>> HS-STEP-6 ok (exit $?)"

echo ">>> HS-STEP-DONE"
