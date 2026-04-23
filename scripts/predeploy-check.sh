#!/usr/bin/env bash
# Hawkeye Sterling — local reproduction of the Netlify deploy's type-check.
#
# Three of the last four PRs failed on the Netlify production build with
# `exactOptionalPropertyTypes: true` TypeScript errors that the developer's
# local `tsc --noEmit` did not catch. Running `next build` locally catches
# them because Next.js generates `.next/types/**/*.ts` files before the
# type-check runs, which extends the scope of what gets validated.
#
# Run this BEFORE pushing:
#   ./scripts/predeploy-check.sh
#
# It does exactly what netlify.toml's build.command does:
#   1. root `npm run build`   (tsc over the brain source)
#   2. gen-weaponized-brain.cjs
#   3. cd web && npm run build  (next build = compile + lint + typecheck)
#
# Requires node_modules to be present. Install with `npm ci` at the root
# and `npm ci` inside web/ if not already done.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "═══ 1/3  Root TypeScript build (src/brain, src/enterprise, …) ═══"
npm run build

echo
echo "═══ 2/3  Weaponized-brain manifest generation ═══"
node scripts/gen-weaponized-brain.cjs

echo
echo "═══ 3/3  Next.js build (web/) — the step that keeps breaking on Netlify ═══"
cd web
npm run build

echo
echo "═══ ALL GREEN — safe to push ═══"
