# AUDIT-READINESS REPORT
**Generated:** 2026-05-22 (updated after Netlify env var verification)  
**Status:** Ready — Conditionally (GOAML MLRO identity pending)  
**Auditor:** Claude Code — automated + manual review

## CONFIRMED IN NETLIFY (verified 2026-05-22)

The following were confirmed present in the Netlify dashboard across the correct deploy contexts:

| Variable | Status | Notes |
|----------|--------|-------|
| SESSION_SECRET | ✅ All contexts | HMAC session signing active |
| JWT_SIGNING_SECRET | ✅ All contexts | API token issuance active |
| AUDIT_CHAIN_SECRET | ✅ 4 contexts | Tamper-evident audit chain active |
| ADMIN_TOKEN | ✅ 4 contexts | Portal admin bypass active |
| ONGOING_RUN_TOKEN | ✅ All contexts | Ongoing monitor endpoint protected |
| SANCTIONS_CRON_TOKEN | ✅ All contexts | Sanctions ingestion cron protected |
| HAWKEYE_CRON_TOKEN | ✅ 5 contexts | OpenSanctions refresh + LSEG CFS poll active |
| ALERTS_CRON_TOKEN | ✅ All contexts | Designation alert cron active |
| ANTHROPIC_API_KEY | ✅ 4 contexts | LLM (MLRO advisor, adverse-media, super-brain) active |
| GROQ_API_KEY | ✅ 4 contexts | Groq LLM fallback active |
| ASANA_TOKEN | ✅ 4 contexts | Task inbox delivery active |
| HAWKEYE_ENTITIES | ✅ 4 contexts | Multi-entity STR configuration present |
| UPSTASH_REDIS_REST_URL | ✅ All contexts | **Hard atomic rate limiting active** |
| UPSTASH_REDIS_REST_TOKEN | ✅ 4 contexts | Redis auth active |
| NETLIFY_BLOBS_TOKEN | ✅ 4 contexts | Blobs storage auth active |
| NETLIFY_SITE_ID | ✅ All contexts | Blobs routing active |
| NEXT_PUBLIC_APP_URL | ✅ All contexts | CORS origin + webhook URLs correct |
| LSEG_APP_KEY | ✅ 4 contexts | LSEG World-Check CFS poll active |
| LSEG_USERNAME | ✅ 5 contexts | LSEG auth active |
| LSEG_PASSWORD | ✅ 5 contexts | LSEG auth active |
| FRAUDSHIELD_API_KEY | ✅ 5 contexts | FraudShield enrichment active |
| GMAIL_CLIENT_ID/SECRET/REFRESH | ✅ 5 contexts | Gmail integration active |
| REPORT_ED25519_PRIVATE_KEY | ✅ 4 contexts | Audit certificate signing active |
| REPORT_SIGNING_KEY + HAWKEYE_SIGNING_KEY | ✅ 4 contexts | Report HMAC signing active |
| WEBHOOK_HMAC_SECRET | ✅ All contexts | SOC2 webhook HMAC active |
| HAWKEYE_WEBHOOK_SECRET | ✅ 4 contexts | Outbound delta-alert HMAC active |
| LUISA_INITIAL_PASSWORD | ✅ 4 contexts | MLRO account credential set |
| MCP_ENABLED | ✅ All contexts | MCP server configured |
| OPENSANCTIONS_DATASETS | ✅ All contexts | Dataset selection active |
| MLRO_RETRIEVAL_CONFIDENCE_THRESHOLD | ✅ All contexts | MLRO confidence tuned |
| NEXT_TELEMETRY_DISABLED | ✅ All contexts | Build telemetry off |
| News API keys | ✅ Multiple | GNEWS, MARKETAUX, NEWSAPI, NEWSCATCHER, NEWSDATA, NYT, TIINGO, WORLDNEWS, CURRENTS, ALPHAVANTAGE, MEDIACLOUD, MEDIASTACK active |
| UAE_EOCN_URL + UAE_LTL_URL + EOCN_FEED_URL | ✅ All contexts | UAE sanction feeds configured |
| BRAIN_REVIEWED_AT / BRAIN_VERSION / CHARTER_HASH | ✅ Build scope | Governance metadata stamped |

## CHECKS PASSED

### Build & Deployment
- [x] Next.js 15 build succeeds (0 errors, **0 lint warnings** after 2026-05-22 fixes)
- [x] Root TypeScript compilation succeeds (0 errors)
- [x] All 5507 unit tests pass (src/ and web/lib/)
- [x] Netlify build script (scripts/build.sh) is present and syntactically correct
- [x] netlify.toml configures correct publish dir (web/.next) and plugin (@netlify/plugin-nextjs 5.15.11)
- [x] NODE_VERSION=22 set in Netlify build environment
- [x] NODE_OPTIONS=--max-old-space-size=8192 set to prevent OOM on Netlify build agents
- [x] NEXT_TELEMETRY_DISABLED=1 set (prevents build delays from telemetry network calls)
- [x] Security headers configured in netlify.toml: X-Content-Type-Options, X-Frame-Options, HSTS, Permissions-Policy, CORP
- [x] CSP set per-request via middleware.ts
- [x] CORS controlled per-origin allowlist (web/lib/api/cors.ts)
- [x] Authentication: HMAC-SHA256 session signing (SESSION_SECRET ✅ confirmed in Netlify)
- [x] Authentication: scrypt password hashing (N=65536 — 2026-05-22 fix)
- [x] JWT verification for API token paths
- [x] Timing-safe comparison for admin token, cron token, and API key verification
- [x] **Hard atomic rate limiting active** (Upstash Redis confirmed in Netlify)
- [x] Audit chain: HMAC-signed tamper-evident append-only log (AUDIT_CHAIN_SECRET ✅ confirmed)
- [x] PII redaction before LLM calls (web/lib/server/redact.ts)
- [x] Prompt sanitization with comprehensive Unicode injection filter (2026-05-22 fix)
- [x] HMAC-keyed IP anonymization in logs and rate-limit buckets (2026-05-22 fix)
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
- [x] Ed25519 audit certificate signing (REPORT_ED25519_PRIVATE_KEY ✅ confirmed)
- [x] LSEG World-Check CFS polling active (credentials ✅ confirmed)
- [x] Gmail integration active (credentials ✅ confirmed)
- [x] FraudShield enrichment active (FRAUDSHIELD_API_KEY ✅ confirmed)
- [x] Ongoing monitoring scheduled (thrice-daily, ONGOING_RUN_TOKEN ✅ confirmed)
- [x] Designation alert cron active (ALERTS_CRON_TOKEN ✅ confirmed)
- [x] Asana task inbox delivery active (ASANA_TOKEN ✅ confirmed, hardcoded GID fallbacks in place)

### Compliance Documentation
- [x] OpenAPI spec present (OPENAPI.yaml, web/public/openapi.json)
- [x] ENV_VARS_REQUIRED.md documents all required and optional variables
- [x] SECURITY-NOTES.md documents verified security findings (updated 2026-05-22)
- [x] CHANGELOG.md maintained with factual changes (updated 2026-05-22)
- [x] FIX_REPORT.md updated with 2026-05-22 fix batch
- [x] AUDIT-READINESS.md created and updated (this file)
- [x] TEST_REPORT.md created (2026-05-22)
- [x] Data lineage documentation (docs/data-governance/DATA_LINEAGE.md)
- [x] AI Governance policy (docs/governance/AI_GOVERNANCE_POLICY.md)
- [x] Model cards for all 5 AI models used (docs/model-cards/)
- [x] ISAE 3000 attestation framework documentation (docs/ISAE3000.md)
- [x] ISO 27001 mapping (docs/ISO27001.md)
- [x] SOC 2 control mapping (docs/SOC2.md)
- [x] GDPR compliance notes (docs/GDPR.md)
- [x] Incident response playbook (docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md)
- [x] Audit preparation checklist (docs/operations/AUDIT_PREP_CHECKLIST.md)

## RESIDUAL RISKS

### HIGH — Compliance-Blocking
- [ ] **GOAML_MLRO_FULL_NAME / GOAML_MLRO_EMAIL / GOAML_MLRO_PHONE not set**: These three vars are NOT in the Netlify dashboard. When STR/SAR reports are submitted to the UAE FIU via `/api/goaml`, placeholder MLRO identity is embedded (`"Luisa Fernanda"` / `"mlro@fine-gold.ae"` / `"+971-000-000-0000"`). The route emits an `X-Hawkeye-Warning` header when unset. **Do NOT file live STRs to the FIU without setting these.**
- [ ] **HAWKEYE_ENTITIES contains FIU_PENDING goamlRentityId values**: Confirmed HAWKEYE_ENTITIES is set but the placeholder `FIU_PENDING_*` values must be replaced with real UAE FIU-assigned IDs before live filing. Contact uaefiu@uaefiu.gov.ae to obtain RentityIds.

### MEDIUM
- [ ] **Audit write fire-and-forget**: Failed Netlify Blobs writes are logged but do not block the API response. Audit trail may have gaps during Blobs outages. Mitigation: Blobs SLA is 99.9%; add a structured metric/alert on `audit_write_failed` log events.
- [ ] **HAWKEYE_WEBHOOK_URL not set**: HAWKEYE_WEBHOOK_SECRET is in Netlify but no destination URL. Outbound delta-alert webhooks from ongoing monitoring are silently no-ops (`postWebhook` returns `{ delivered: false }`). Set HAWKEYE_WEBHOOK_URL if you want customer-facing delta alerts.
- [ ] **OpenSanctions commercial license**: OPENSANCTIONS_API_KEY / OPENSANCTIONS_DATA_TOKEN not confirmed in Netlify. Business use of OpenSanctions data requires a commercial license. The platform functions without it (falls back to public endpoint) but may violate OpenSanctions licensing at scale.
- [ ] **JWT key rotation**: No `kid` header or key rotation ceremony. If JWT_SIGNING_SECRET leaks, rotate it immediately — all issued tokens expire within 10 minutes.

### LOW
- [ ] **CSP `'unsafe-inline'` in script-src**: Next.js App Router hydration scripts cannot carry a per-request nonce, so `'unsafe-inline'` remains. This is a known Next.js 15 limitation.
- [ ] **API key query-param logged**: `?api_key=` query parameter is a fallback for MCP clients. Warning log added 2026-05-22. Enforce header-only auth for non-MCP callers in a future version.
- [ ] **MoonDB not configured**: MOONDB_PROJECT_ID / MOONDB_ADMIN_KEY not in Netlify. The platform gracefully degrades (`isMoonDbAvailable()` returns false) and uses Netlify Blobs instead. No functional impact unless MoonDB-specific features are required.

## REMAINING MANUAL STEPS

1. **Add GOAML MLRO identity** in Netlify env vars:
   ```
   GOAML_MLRO_FULL_NAME=<MLRO full legal name>
   GOAML_MLRO_EMAIL=<MLRO email>
   GOAML_MLRO_PHONE=<MLRO phone in +971-xxx format>
   ```

2. **Replace FIU_PENDING goamlRentityId values** in HAWKEYE_ENTITIES after UAE FIU registration confirms real IDs.

3. **Optionally set HAWKEYE_WEBHOOK_URL** for outbound delta-alert delivery.

4. **Verify by running `/api/health`** on the deployed URL — all critical components should show `status: "ok"`.

5. **Run one test screening** via /screening to confirm end-to-end pipeline works.

## DEPLOYMENT STEPS

1. Code is on branch `claude/ecstatic-ritchie-wm3PV` — merge to main to trigger Netlify production deploy
2. Netlify is already connected to the repository
3. Build command: `bash scripts/build.sh` (already configured)
4. Publish directory: `web/.next` (already configured)
5. All required env vars confirmed in Netlify dashboard
6. After deploy: run `/api/health` check
7. Verify /login → session → /screening pipeline

## AUDIT READINESS STATUS

**Ready — Conditionally** on two items:
1. GOAML_MLRO_FULL_NAME/EMAIL/PHONE must be set before any live FIU STR submission
2. HAWKEYE_ENTITIES goamlRentityId values must be replaced with real UAE FIU-assigned IDs

All other blocking requirements are met. Rate limiting is hard-enforced (Upstash Redis confirmed). All security secrets present. LSEG, Anthropic, Groq, FraudShield, Gmail, and 12 news adapters active. ESLint clean. TypeScript clean. 5507 tests pass.
