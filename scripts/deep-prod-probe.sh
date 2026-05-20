#!/bin/bash
# Deep prod injection-probe script. Posts each payload to /api/auth/login,
# captures only the HTTP status (no body), and reports per-row. Goal: every
# row must be 401 (uniform invalid-credential response), never 500.
BASE="https://hawkeye-sterling.netlify.app"

probe() {
  local label=$1
  local body=$2
  local http=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$body" --max-time 15 2>&1)
  printf "  %-15s  HTTP %s\n" "$label" "$http"
}

echo "=== Injection-shaped login payloads (expect 401 across the board) ==="
probe "empty"      '{}'
probe "admin_only" '{"username":"admin","password":"x"}'
probe "xss"        '{"username":"<script>alert(1)</script>","password":"y"}'
probe "sql_or"     '{"username":"admin OR 1=1","password":"z"}'
probe "whitespace" '{"username":"   ","password":"a"}'
probe "long_user"  '{"username":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","password":"b"}'
probe "unicode"    '{"username":"دvدv","password":"c"}'
probe "null_pass"  '{"username":"a","password":null}'
probe "int_user"   '{"username":12345,"password":"x"}'
echo ""
echo "Expected: ALL HTTP 401 (rate limit may insert 429 after ~10)"
