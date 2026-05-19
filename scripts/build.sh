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

step "6 next build"
APP_VERSION=$(node -p "require('../package.json').version") \
  GIT_COMMIT_SHA="${COMMIT_REF:-}" \
  NEXT_PUBLIC_COMMIT_SHA="${COMMIT_REF:-}" \
  npm run build
echo ">>> HS-STEP-6 ok (exit $?)"

echo ">>> HS-STEP-DONE"
