#!/usr/bin/env bash
# Hawkeye Sterling — operator close-out script for the May-14 audit residue.
#
# Run from the repo root. Assumes `netlify` CLI is installed and you've
# already run `netlify login` + `netlify link` against the production site.
#
# This script does NOT take destructive actions. It SETS env vars and runs
# the admin import-cfs endpoint when LSEG bulk files are available.
# Inspect, then run sections you want.
#
# Usage:
#   bash scripts/operator-finish.sh status              # show what would change
#   bash scripts/operator-finish.sh apply <section>     # actually run one section
#
# Sections:
#   redis        — UPSTASH_REDIS_REST_URL + token  (audit M-01)
#   rss          — GOOGLE_NEWS_RSS_ENABLED=true     (audit M-02)
#   pep-uplift   — set LSEG_WORLDCHECK_API_KEY/SECRET or trigger CFS import (H-06)
#   uae-seeds    — set UAE_EOCN_SEED_PATH/UAE_LTL_SEED_PATH paths in env (C-01)
#   vessel       — placeholders for vessel-intel provider env vars (C-02)
#   opensanctions — set OPENSANCTIONS_API_KEY for free-tier PEP fallback
#   verify       — re-run smoke checks against the live deployment

set -euo pipefail
MODE="${1:-status}"
SECTION="${2:-}"
SITE_URL="${SITE_URL:-https://hawkeye-sterling.netlify.app}"

NF=netlify
if ! command -v "$NF" >/dev/null 2>&1; then
  echo "netlify CLI not installed. Install: npm i -g netlify-cli, then 'netlify login' + 'netlify link'."
  exit 1
fi

apply_env() {
  local var="$1"; local val="${2:-}"
  if [[ -z "$val" ]]; then
    echo "  [SKIP] $var — value not provided. Re-run with VAR=value in the section block."
    return
  fi
  if [[ "$MODE" == "apply" ]]; then
    "$NF" env:set "$var" "$val" --context production
    echo "  [SET]  $var (production)"
  else
    echo "  [PLAN] would set $var=********** (production)"
  fi
}

section_redis() {
  echo "== Section: redis (M-01) =="
  apply_env UPSTASH_REDIS_REST_URL  "${UPSTASH_REDIS_REST_URL:-}"
  apply_env UPSTASH_REDIS_REST_TOKEN "${UPSTASH_REDIS_REST_TOKEN:-}"
  echo "  Provision a DB at https://console.upstash.com/redis and export URL + TOKEN first."
}

section_rss() {
  echo "== Section: rss (M-02) =="
  apply_env GOOGLE_NEWS_RSS_ENABLED "true"
}

section_pep_uplift() {
  echo "== Section: pep-uplift (H-06) =="
  echo "  Path A — Live World-Check API (~5M records):"
  apply_env LSEG_WORLDCHECK_API_KEY    "${LSEG_WORLDCHECK_API_KEY:-}"
  apply_env LSEG_WORLDCHECK_API_SECRET "${LSEG_WORLDCHECK_API_SECRET:-}"
  echo "  Path B — Import LSEG CFS bulk files (already downloaded by the 6h cron):"
  if [[ "$MODE" == "apply" ]]; then
    if [[ -z "${ADMIN_TOKEN:-}" ]]; then
      echo "  [SKIP] ADMIN_TOKEN not set in shell env — export ADMIN_TOKEN=... first."
    else
      echo "  [RUN]  POST $SITE_URL/api/admin/import-cfs"
      curl -sS --max-time 90 -X POST \
        -H "authorization: Bearer $ADMIN_TOKEN" \
        "$SITE_URL/api/admin/import-cfs" | jq '. | { ok, filesProcessed, entitiesIndexed, buckets }'
    fi
  else
    echo "  [PLAN] would POST $SITE_URL/api/admin/import-cfs with Bearer ADMIN_TOKEN"
  fi
  echo "  Path C — OpenSanctions free-tier PEP fallback:"
  apply_env OPENSANCTIONS_API_KEY "${OPENSANCTIONS_API_KEY:-}"
}

section_opensanctions() {
  echo "== Section: opensanctions =="
  apply_env OPENSANCTIONS_API_KEY "${OPENSANCTIONS_API_KEY:-}"
}

section_uae_seeds() {
  echo "== Section: uae-seeds (C-01) =="
  echo "  NOTE: I never fabricate sanctions data. You must obtain the authoritative"
  echo "  UAE EOCN + LTL lists from the EOCN / UAE IEC portal and provide local JSON"
  echo "  paths conforming to the seed schema in src/ingestion/sources/uae-seed.ts."
  echo "  The default bundled paths are:"
  echo "    data/eocn_seed.json   (currently 1 placeholder record)"
  echo "    data/uae_ltl_seed.json (currently 1 placeholder record)"
  echo "  Either replace those files OR set the env vars to point at real seed JSON:"
  apply_env UAE_EOCN_SEED_PATH "${UAE_EOCN_SEED_PATH:-}"
  apply_env UAE_LTL_SEED_PATH  "${UAE_LTL_SEED_PATH:-}"
}

section_vessel() {
  echo "== Section: vessel (C-02) =="
  echo "  Subscribe to a vessel-intel provider, then set the integration's env vars."
  echo "  Example slots used by src/integrations/vesselCheck (verify exact names with the file):"
  apply_env VESSEL_CHECK_API_KEY      "${VESSEL_CHECK_API_KEY:-}"
  apply_env VESSEL_CHECK_API_ENDPOINT "${VESSEL_CHECK_API_ENDPOINT:-}"
}

section_verify() {
  echo "== Section: verify =="
  echo "--- /api/health ---"
  curl -sS --max-time 15 "$SITE_URL/api/health" | jq '. | { ok, status, commitRef, buildId, brain }'
  echo "--- /api/sanctions/status (summary + warnings) ---"
  curl -sS --max-time 30 "$SITE_URL/api/sanctions/status" \
    | jq '. | { ok, degraded, summary, warnings }'
  echo "--- /api/status (PEP corpus) ---"
  curl -sS --max-time 30 "$SITE_URL/api/status" \
    | jq '. | { commitSha: .feedVersions.commitSha, knownPepEntries: .feedVersions.knownPepEntries, pepSources: .feedVersions.pepSources, warnings: .warnings }'
  echo "--- /api/regulatory-feed (totalCount + sources) ---"
  curl -sS --max-time 30 "$SITE_URL/api/regulatory-feed" \
    | jq '. | { ok, totalCount, sourceCount: (.sources|length), errors: (.errors|length) }'
}

case "${SECTION:-all}" in
  redis)         section_redis ;;
  rss)           section_rss ;;
  pep-uplift)    section_pep_uplift ;;
  opensanctions) section_opensanctions ;;
  uae-seeds)     section_uae_seeds ;;
  vessel)        section_vessel ;;
  verify)        section_verify ;;
  all|"")
    section_redis
    section_rss
    section_pep_uplift
    section_uae_seeds
    section_vessel
    [[ "$MODE" == "apply" ]] && section_verify
    ;;
  *) echo "Unknown section: $SECTION"; exit 2 ;;
esac
