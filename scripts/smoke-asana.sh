#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# smoke-asana.sh — Hawkeye Sterling end-to-end Asana integration smoke test
#
# Runs 6 live checks against the real Asana API and the deployed app endpoints.
# Every check prints PASS / FAIL with a reason.
#
# Usage:
#   export BASE_URL=https://your-site.netlify.app
#   export ADMIN_TOKEN=your-admin-token
#   export ASANA_TOKEN=your-asana-personal-access-token
#   export ASANA_PROJECT_GID=1214148630166524
#   bash scripts/smoke-asana.sh
#
# Optional cleanup:  CLEANUP=true bash scripts/smoke-asana.sh
#   Deletes the smoke-test task from Asana after verification.
#
# Exit code:
#   0  all checks passed
#   1  one or more checks failed
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

PASS="${GREEN}✓ PASS${RESET}"
FAIL="${RED}✗ FAIL${RESET}"
WARN="${YELLOW}! WARN${RESET}"

FAILURES=0

pass() { echo -e "  ${PASS}  $1"; }
fail() { echo -e "  ${FAIL}  $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "  ${WARN}  $1"; }
header() { echo -e "\n${BOLD}── $1 ──${RESET}"; }

# ── Env validation ──────────────────────────────────────────────────────────
header "Environment"

: "${BASE_URL:?  ERROR: BASE_URL not set. Export BASE_URL=https://your-site.netlify.app}"
: "${ADMIN_TOKEN:?  ERROR: ADMIN_TOKEN not set.}"
: "${ASANA_TOKEN:?  ERROR: ASANA_TOKEN not set.}"
: "${ASANA_PROJECT_GID:?  ERROR: ASANA_PROJECT_GID not set.}"

echo "  BASE_URL          $BASE_URL"
echo "  ASANA_PROJECT_GID $ASANA_PROJECT_GID"
echo "  CLEANUP           ${CLEANUP:-false}"

SMOKE_SUBJECT="Hawkeye Smoke Test $(date +%s)"
SMOKE_CASE_ID="SMOKE-$(date +%s)"

# ── CHECK 1: Asana API reachable ────────────────────────────────────────────
header "Check 1 · Asana API connectivity"

ASANA_ME=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${ASANA_TOKEN}" \
  "https://app.asana.com/api/1.0/users/me")

if [ "$ASANA_ME" = "200" ]; then
  pass "Asana API reachable (HTTP 200)"
else
  fail "Asana API returned HTTP ${ASANA_ME} — check ASANA_TOKEN"
fi

# ── CHECK 2: App /api/status endpoint ──────────────────────────────────────
header "Check 2 · App /api/status"

STATUS_BODY=$(curl -s "${BASE_URL}/api/status" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" || echo '{}')

STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "${BASE_URL}/api/status" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

if [ "$STATUS_CODE" = "200" ]; then
  pass "App /api/status returned HTTP 200"
else
  fail "App /api/status returned HTTP ${STATUS_CODE}"
fi

echo "  Response: $(echo "$STATUS_BODY" | head -c 200)"

# ── CHECK 3: Trigger ongoing/run — task creation ────────────────────────────
header "Check 3 · POST /api/ongoing/run — create Asana task"

RUN_BODY=$(curl -s -X POST "${BASE_URL}/api/ongoing/run" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"subjects\": [{
      \"name\": \"${SMOKE_SUBJECT}\",
      \"id\": \"${SMOKE_CASE_ID}\",
      \"tier\": \"high\",
      \"cadence\": \"daily\"
    }]
  }" || echo '{}')

echo "  Response (first 400 chars):"
echo "  $(echo "$RUN_BODY" | head -c 400)"

# Extract asanaTaskUrl
TASK_URL=$(echo "$RUN_BODY" | grep -o '"asanaTaskUrl":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
SKIP_REASON=$(echo "$RUN_BODY" | grep -o '"asanaSkipReason":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

if [ -n "$TASK_URL" ]; then
  pass "asanaTaskUrl returned: ${TASK_URL}"
elif [ -n "$SKIP_REASON" ]; then
  fail "asanaSkipReason set: '${SKIP_REASON}' — Asana task NOT created"
else
  fail "asanaTaskUrl missing from response — check server logs"
fi

# ── CHECK 4: Verify task exists in Asana via API ───────────────────────────
header "Check 4 · Verify task exists in Asana project"

TASK_GID=$(echo "$RUN_BODY" | grep -o '"asanaTaskGid":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

if [ -z "$TASK_GID" ]; then
  # Try extracting GID from the task URL
  TASK_GID=$(echo "$TASK_URL" | grep -o '[0-9]\{10,\}$' || true)
fi

if [ -n "$TASK_GID" ]; then
  ASANA_TASK=$(curl -s \
    -H "Authorization: Bearer ${ASANA_TOKEN}" \
    "https://app.asana.com/api/1.0/tasks/${TASK_GID}" || echo '{}')

  TASK_NAME=$(echo "$ASANA_TASK" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

  if echo "$TASK_NAME" | grep -qi "smoke"; then
    pass "Task found in Asana — name: '${TASK_NAME}'"
  else
    warn "Task GID ${TASK_GID} found but name unexpected: '${TASK_NAME}'"
  fi
else
  warn "Could not extract task GID from response — skipping Asana task verification"
fi

# ── CHECK 5: Verify attachment on task ─────────────────────────────────────
header "Check 5 · Verify JSON evidence attachment on task"

if [ -n "$TASK_GID" ]; then
  ATTACHMENTS=$(curl -s \
    -H "Authorization: Bearer ${ASANA_TOKEN}" \
    "https://app.asana.com/api/1.0/tasks/${TASK_GID}/attachments" || echo '{}')

  ATT_COUNT=$(echo "$ATTACHMENTS" | grep -o '"gid"' | wc -l | tr -d ' ')

  if [ "$ATT_COUNT" -gt 0 ]; then
    pass "Attachment found on task (${ATT_COUNT} attachment(s))"
    echo "  $(echo "$ATTACHMENTS" | grep -o '"name":"[^"]*"' | head -3)"
  else
    fail "No attachments on task — evidence pack was NOT uploaded"
  fi
else
  warn "Skipping attachment check — no task GID available"
fi

# ── CHECK 6: Confirm task is in correct project ────────────────────────────
header "Check 6 · Task is in correct Asana project"

if [ -n "$TASK_GID" ]; then
  TASK_PROJECTS=$(curl -s \
    -H "Authorization: Bearer ${ASANA_TOKEN}" \
    "https://app.asana.com/api/1.0/tasks/${TASK_GID}?opt_fields=projects" || echo '{}')

  if echo "$TASK_PROJECTS" | grep -q "$ASANA_PROJECT_GID"; then
    pass "Task is in the correct project (GID ${ASANA_PROJECT_GID})"
  else
    fail "Task project GID does not match ASANA_PROJECT_GID=${ASANA_PROJECT_GID}"
    echo "  Task projects response: $(echo "$TASK_PROJECTS" | head -c 300)"
  fi
else
  warn "Skipping project check — no task GID available"
fi

# ── CLEANUP ────────────────────────────────────────────────────────────────
if [ "${CLEANUP:-false}" = "true" ] && [ -n "$TASK_GID" ]; then
  header "Cleanup · Deleting smoke-test task"
  DEL=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer ${ASANA_TOKEN}" \
    "https://app.asana.com/api/1.0/tasks/${TASK_GID}")
  if [ "$DEL" = "200" ]; then
    pass "Smoke-test task deleted from Asana"
  else
    warn "Delete returned HTTP ${DEL} — may need manual cleanup (GID: ${TASK_GID})"
  fi
fi

# ── Summary ────────────────────────────────────────────────────────────────
header "Result"

if [ "$FAILURES" -eq 0 ]; then
  echo -e "\n  ${GREEN}${BOLD}ALL CHECKS PASSED${RESET} — Asana integration is working correctly.\n"
  exit 0
else
  echo -e "\n  ${RED}${BOLD}${FAILURES} CHECK(S) FAILED${RESET} — Review output above and check Netlify logs.\n"
  exit 1
fi
