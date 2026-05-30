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
# Trap any command failure and print its exit code + the failing command so
# the Netlify build log pinpoints exactly which step returned non-zero.
trap 'echo ">>> HS-BUILD-FAILED: exit_code=$? line=$LINENO cmd=$BASH_COMMAND"' ERR

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
npm ci --include=dev --no-audit --no-fund
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
# --require the preload script before Next.js starts so graceful-fs patches
# fs.open() before webpack caches any unpatched references. This is needed
# on Netlify agents and containers where the fd hard limit is ≤ 4096:
# 604 routes × compiled chunks exhaust the limit during manifest writes.
PRELOAD_SCRIPT="$(cd .. && pwd)/scripts/preload-graceful-fs.cjs"
if [ -f "$PRELOAD_SCRIPT" ]; then
  echo ">>> HS-STEP-6 preloading graceful-fs via $PRELOAD_SCRIPT"
  GRACEFUL_FS_REQUIRE="--require $PRELOAD_SCRIPT"
else
  echo ">>> HS-STEP-6 preload script not found, proceeding without graceful-fs"
  GRACEFUL_FS_REQUIRE=""
fi
# Heap cap at 8192 matches netlify.toml. Netlify Pro build agents have ≥8 GB
# RAM; 8192 was verified working (commit 360b4650, deploy_time 346 s). The
# 4096 cap caused every build to fail with exit code 2 — webpack needs more
# than 4 GB to compile 600+ routes with the compiled brain + Anthropic SDK.
APP_VERSION=$(node -p "require('../package.json').version") \
  GIT_COMMIT_SHA="${COMMIT_REF:-}" \
  NEXT_PUBLIC_COMMIT_SHA="${COMMIT_REF:-}" \
  NODE_OPTIONS="--max-old-space-size=8192 ${GRACEFUL_FS_REQUIRE}" \
  npm run build && echo ">>> HS-STEP-6 ok (exit 0)" || { ec=$?; echo ">>> HS-STEP-6 FAILED (exit $ec)"; exit $ec; }

echo ">>> HS-STEP-DONE"
