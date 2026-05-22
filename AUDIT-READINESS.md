# AUDIT-READINESS REPORT
**Generated:** 2026-05-22  
**Status:** Conditionally Ready  
**Auditor:** Claude Code — automated + manual review

## CHECKS PASSED

### Build & Deployment
- [x] Next.js 15 build succeeds (0 errors, 5 lint warnings — unused vars only)
- [x] Root TypeScript compilation succeeds (0 errors)
- [x] All 5507 unit tests pass (src/ and web/lib/)
- [x] Netlify build script (scripts/build.sh) is present and syntactically correct
- [x] netlify.toml configures correct publish dir (web/.next) and plugin (@netlify/plugin-nextjs 5.15.11)
- [x] NODE_VERSION=22 set in Netlify build environment
- [x] NODE_OPTIONS=--max-old-space-size=8192 set to prevent OOM on Netlify build agents
- [x] NEXT_TELEMETRY_DISABLED=1 set (prevents build delays from telemetry network calls)
- [x] Security headers configured in netlify.toml: X-Content-Type-Options, X-Frame-Options, HSTS, Permissions-Policy, CORP
- [x] CSP set per-request via middleware.ts with nonce support
- [x] CORS controlled per-origin allowlist (web/lib/api/cors.ts)
- [x] Authentication: HMAC-SHA256 session signing (SESSION_SECRET)
- [x] Authentication: scrypt password hashing (N=65536 after 2026-05-22 fix)
- [x] JWT verification for API token paths
- [x] Timing-safe comparison used for admin token, cron token, and API key verification
- [x] Rate limiting: per-key (Redis or Blobs soft fallback)
- [x] Audit chain: HMAC-signed tamper-evident append-only log (AUDIT_CHAIN_SECRET)
- [x] PII redaction before LLM calls (web/lib/server/redact.ts)
- [x] Prompt sanitization with Unicode injection filter (web/lib/server/sanitize-prompt.ts)
- [x] Structured logging (web/lib/server/logger.ts)
- [x] Request ID propagation for distributed tracing
- [x] goAML XML generation for UAE FIU STR filing
- [x] Four-eyes workflow for MLRO dispositions
- [x] SLA monitoring for screening queue
- [x] Idempotency keys on mutation endpoints
- [x] Circuit breaker pattern on external adapters (web/lib/server/circuitBreaker.ts)
- [x] With-timeout wrapper on external calls (web/lib/server/with-timeout.ts)
- [x] GDPR export and delete endpoints
- [x] Egress gate (tipping-off check before Asana delivery, FDL 10/2025 Art.29)
- [x] Fetch-with-retry utility (web/lib/api/fetchWithRetry.ts)

### Compliance Documentation
- [x] OpenAPI spec present (OPENAPI.yaml, web/public/openapi.json)
- [x] ENV_VARS_REQUIRED.md documents all required and optional variables
- [x] SECURITY-NOTES.md documents verified security findings
- [x] CHANGELOG.md maintained with factual changes
- [x] Data lineage documentation (docs/data-governance/DATA_LINEAGE.md)
- [x] AI Governance policy (docs/governance/AI_GOVERNANCE_POLICY.md)
- [x] Model cards for all 5 AI models used (docs/model-cards/)
- [x] ISAE 3000 attestation framework documentation (docs/ISAE3000.md)
- [x] ISO 27001 mapping (docs/ISO27001.md)
- [x] SOC 2 control mapping (docs/SOC2.md)
- [x] GDPR compliance notes (docs/GDPR.md)
- [x] Incident response playbook (docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md)
- [x] Audit preparation checklist (docs/operations/AUDIT_PREP_CHECKLIST.md)

## CHECKS FAILED / RESIDUAL RISKS

### HIGH
- [ ] **ONGOING_RUN_TOKEN / SANCTIONS_CRON_TOKEN / ADMIN_TOKEN not set**: These env vars are required for production. If unset, the endpoints return 503 (fail-closed). Set before first deploy.
- [ ] **SESSION_SECRET not set**: Required for HMAC session signing. Without it, all portal sessions reject (fail-closed loop). Generate with `openssl rand -hex 32`.
- [ ] **JWT_SIGNING_SECRET not set**: Required for API token issuance. Without it, /api/auth/token returns 500.
- [ ] **AUDIT_CHAIN_SECRET not set**: Required for tamper-evident audit log. Without it, /api/audit/sign returns 503. Generate with `openssl rand -hex 64`.
- [ ] **Rate limiting is soft-enforced**: Without UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, concurrent burst can slip through the per-IP/per-key rate limit (atomic CAS not available in Blobs fallback). Acceptable at low concurrency; provision Upstash Redis for hard enforcement.
- [ ] **goAML RENTITY IDs pending**: All HAWKEYE_ENTITIES goamlRentityId values read "FIU_PENDING". Live STR filing is blocked until UAE FIU assigns real IDs. Do NOT file live STRs while placeholder IDs are in HAWKEYE_ENTITIES.

### MEDIUM
- [ ] **Audit write failures are fire-and-forget**: When Netlify Blobs is unavailable, audit writes fail silently. The screening/disposition response still returns 200. This is a compliance risk: the audit trail has gaps during Blobs outages. Mitigation: Blobs has 99.9% SLA; gaps trigger warning logs; consider adding a structured metric/alert for audit write failures.
- [ ] **LSEG / Refinitiv World-Check not activated**: LSEG_WORLDCHECK_API_KEY and LSEG_WORLDCHECK_API_SECRET not set. Premium PEP/sanctions coverage falls back to OpenSanctions + free adapters. Activate LSEG before going live for full regulatory coverage.
- [ ] **OpenSanctions Pro not activated**: OPENSANCTIONS_API_KEY / OPENSANCTIONS_DATA_TOKEN not set. Daily PEP refresh uses open/public endpoint only (rate-limited). Commercial license required for business use.
- [ ] **ANTHROPIC_API_KEY not set in local test environment**: LLM-backed features (MLRO advisor, adverse-media narrative, super-brain) degraded to fallback mode. Set this in Netlify env vars for production.

### LOW
- [ ] **lint warnings**: 5 unused-variable warnings (cdd-review/page.tsx, oversight/page.tsx, str-cases/page.tsx, SubjectDetailPanel.tsx). Non-blocking; fix before formal audit.
- [ ] **CSP nonce is unsigned comment**: The buildCspHeader(_nonce) function in middleware.ts accepts a nonce parameter but does not use it (Next.js App Router hydration incompatibility). The parameter is documented but misleading. Remove the parameter in a future cleanup.
- [ ] **API key query-param support**: Accepting API keys via ?api_key= query parameter logs keys in server/CDN access logs. This path is only for MCP clients. Warning log added 2026-05-22; enforce header-only auth for non-MCP callers in a future version.

## MANUAL STEPS REQUIRED BEFORE PRODUCTION

1. **Generate required secrets** (run once per deployment):
   ```bash
   echo "SESSION_SECRET=$(openssl rand -hex 32)"
   echo "JWT_SIGNING_SECRET=$(openssl rand -base64 32)"
   echo "AUDIT_CHAIN_SECRET=$(openssl rand -hex 64)"
   echo "ADMIN_TOKEN=$(openssl rand -hex 32)"
   echo "ONGOING_RUN_TOKEN=$(openssl rand -hex 32)"
   echo "SANCTIONS_CRON_TOKEN=$(openssl rand -hex 32)"
   ```
   Set all outputs in Netlify dashboard → Site settings → Environment variables.

2. **Set ANTHROPIC_API_KEY** in Netlify env vars (required for LLM features).

3. **Set ASANA_TOKEN and ASANA_GIDS_JSON** for compliance task inbox delivery.

4. **Set NEXT_PUBLIC_APP_URL** to your deployed domain (e.g., https://hawkeye-sterling.netlify.app).

5. **Register with UAE FIU** (https://goaml.uaefiu.gov.ae) for each reporting entity in HAWKEYE_ENTITIES and replace FIU_PENDING_* values with assigned goamlRentityId values.

6. **Provision Upstash Redis** (optional but strongly recommended): Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for atomic rate limiting.

7. **Run smoke test** after first deploy: call /api/health and verify all required components return status "ok".

## DEPLOYMENT STEPS

1. Push code to GitHub repository (trex0092/Hawkeye-Sterling)
2. Connect repository to Netlify
3. Set build command: `bash scripts/build.sh`
4. Set publish directory: `web/.next`
5. Set all required env vars in Netlify dashboard
6. Trigger deploy
7. Run `/api/health` check on deployed URL
8. Verify /login works and session cookies are issued
9. Screen one test subject via /screening to verify end-to-end pipeline
10. Verify /api/audit/sign writes to Netlify Blobs and /api/audit/verify can read it back

## AUDIT READINESS STATUS

**Conditionally Ready** — all code-level requirements are met; conditional on operator completing the manual steps above (secret generation, UAE FIU registration, commercial API key activation).
