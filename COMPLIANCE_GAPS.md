# Hawkeye Sterling — Compliance Gaps
**Date:** 2026-06-04 (last updated)  
**Status:** Items marked CLOSED have been addressed in code. Items marked Open require an explicit human or MLRO decision before they can be considered resolved.

---

## CG-1 — Anonymous screening permitted on /api/quick-screen

**Risk:** CRITICAL (regulatory)  
**Status:** CLOSED (2026-05-26)

**Description:** The `/api/quick-screen` endpoint previously allowed anonymous callers. This has been resolved — the route now calls `enforce(req, { requireAuth: true, cost: 2 })`, requiring a valid API key on every request. All screening actions are traceable to an authenticated operator identity in the audit trail.

**Resolution:** `web/app/api/quick-screen/route.ts` — `enforce(req, { requireAuth: true })` confirmed present at line 252. The auth coverage gate in `.github/workflows/ci.yml` monitors for any future regression.

---

## CG-2 — False-positive whitelist mechanism

**Risk:** HIGH (operational compliance)  
**Status:** PARTIALLY CLOSED (2026-05-26) — mechanism implemented; MLRO workflow approval pending

**Description:** `web/app/api/whitelist/route.ts` implements a full per-tenant false-positive whitelist:
- `GET /api/whitelist` — list active entries for the caller's tenant
- `POST /api/whitelist` — add an entry (CO or MLRO role required)
- `DELETE /api/whitelist?id=<entryId>` — remove an entry (MLRO role only)

All writes append to `whitelist-audit/<tenantId>.json` for a tamper-evident audit trail. The whitelist is checked during `quick-screen` and `screening/run` to suppress known-clear FP hits.

UAE Cabinet Decision No. 74 of 2020 requires documented procedures for "no match" determinations, including a record of the disambiguation basis. The audit trail satisfies this requirement.

**Remaining MLRO decision required:**
  1. Confirm the approval workflow (who can POST — CO vs. MLRO role gate)
  2. Confirm whitelist expiry policy (recommended: annual review, `expiresAt` field supported)
  3. Confirm whether whitelisted entries are excluded from ongoing monitoring (currently: excluded from first-screen alerts only)

---

## CG-3 — Periodic re-screening automation completeness

**Risk:** HIGH (regulatory)  
**Status:** PARTIALLY CLOSED (2026-05-26) — schedules implemented; MLRO enrolment confirmation pending

**Description:** `web/lib/server/ongoing-monitoring-config.ts` defines risk-tier cadences per FATF R.10/R.12/FDL 10/2025:
- `standard` (CDD): screen every 365 days, news every 30 days
- `enhanced` (EDD): screen every 90 days, news every 7 days
- `intensive`: screen every 30 days, news every 1 day
- `pep`: screen every 7 days, news every 1 day (mandatory, FATF R.12)
- `prohibited`: screen every 1 day, news every 6 hours

`netlify/functions/ongoing-screen.mts` runs hourly (cron `0 * * * *`) and dispatches to `/api/ongoing/run` which advances subjects due for re-screening based on their cadence.

**Remaining MLRO decision required:**
  1. Confirm all existing customers have been assigned a risk tier and enrolled in a schedule (operator database check required)

**Resolved (2026-05-31):** Escalation on `ongoing-screen` failure is implemented — `netlify/functions/ongoing-screen.mts` fires `ALERT_WEBHOOK_URL` on every catch (lines 88-101) with `severity: "high"`. The comment in the file references this CG-3 resolution. Additionally, `netlify/functions/warm-pool.mts`, `sanctions-daily-0830.mts`, and `transaction-monitor.mts` now also wrap their handlers in top-level try/catch with `fireAlert()` calls so all cron failures surface as ops alerts.

---

## CG-4 — goAML reporting entity IDs are placeholder values

**Risk:** CRITICAL (regulatory)  
**Description:** `.env.example` ships `"goamlRentityId": "FIU_PENDING_ENTITY_01"` … `"FIU_PENDING_ENTITY_07"` placeholders for all 7 entities in `HAWKEYE_ENTITIES`. If these placeholders are deployed to production, every STR/SAR submitted via `/api/goaml-xml` will contain an invalid reporting entity ID, causing the UAE FIU to reject the filing.

FDL 10/2025 Art. 15 requires that every STR identify the reporting entity by its goAML-assigned ID.

**Action required (operator, not MLRO):**
  1. Confirm the UAE FIU registration status of each entity
  2. Replace each `FIU_PENDING_ENTITY_0N` placeholder with the actual goAML Rentity ID in Netlify environment variables
  3. Do not commit real goAML IDs to the repository

---

## CG-5 — Google Fonts external loading (UAE PDPL)

**Risk:** MEDIUM (data protection)  
**Status:** CLOSED (2026-05-26)

**Description:** `public/hawkeye/index.html` and `public/index.html` previously referenced Google Fonts. Under UAE Federal Decree-Law No. 45 of 2021 (PDPL), this would constitute cross-border personal data transfer to a US-based third party without disclosure.

**Resolution:** Verified 2026-05-26 — all font loading uses `fonts.bunny.net` (Bunny Fonts), a GDPR/PDPL-compliant CDN hosted in the EU that does not log or share user IP addresses. `public/hawkeye/index.html:12` and `public/index.html:12-13` confirm no `fonts.googleapis.com` or `fonts.gstatic.com` references anywhere in the codebase (`grep -rn "fonts.googleapis\|fonts.gstatic" web/ public/` returns zero results). No PDPL concern remains.

---

## CG-6 — Audit chain storage durability for 10-year retention

**Risk:** HIGH (regulatory)  
**Status:** PARTIALLY CLOSED (2026-05-26) — S3/WORM replication implemented; MLRO sign-off on bucket configuration required

**Description:** The HMAC-sealed audit chain is stored in Netlify Blobs (`@netlify/blobs`). Netlify's service terms do not guarantee 10-year data retention. FDL 10/2025 Art. 24 requires DNFBP records to be retained for a minimum of 10 years.

**Resolution (2026-05-26):** `netlify/functions/audit-chain-s3-backup.mts` — nightly cron at 02:00 UTC mirrors every per-tenant audit chain blob to an S3-compatible store with object-lock (WORM) enabled:
- Custom AWS Signature Version 4 implementation (no SDK dependency)
- Object key: `audit-chain/<tenantId>/<YYYY-MM-DD>.json`
- SHA-256 of the payload stored in S3 object metadata for integrity verification
- Discovers tenants dynamically via `listStores()` filtering `hawkeye-audit-chain-*`
- Fires `ALERT_WEBHOOK_URL` on backup failure (same channel as bias/drift alerts)
- Default region: `me-south-1` (UAE/Bahrain) for data residency compliance

**Env vars required (MLRO/CTO action):**
  - `S3_BACKUP_ENDPOINT` — S3-compatible endpoint (AWS S3, Cloudflare R2, MinIO, etc.)
  - `S3_BACKUP_BUCKET` — bucket name (must have object-lock/WORM enabled)
  - `S3_BACKUP_REGION` — AWS region (default: me-south-1)
  - `S3_BACKUP_ACCESS_KEY_ID` / `S3_BACKUP_SECRET_KEY` — IAM credentials

**Remaining MLRO/CTO action required:**
  1. Configure the four env vars above in Netlify environment settings
  2. Confirm the S3 bucket has object-lock enabled with a 10-year governance/compliance retention policy
  3. Confirm the bucket is located in a UAE-approved data residency region (me-south-1 recommended)
  4. Verify the nightly backup by checking for objects in `s3://<bucket>/audit-chain/` after 02:00 UTC

---

## CG-7 — egressGate compliance pre-check not wired to all web routes

**Risk:** HIGH (compliance process)  
**Status:** CLOSED (2026-05-26)

**Description:** `src/integrations/egressGate.ts` implements a compliance pre-check (invokes `complianceAgent` before releasing Asana tasks or goAML XML).

**Resolution:**
- `/api/sar-report/route.ts` — WIRED: `runEgressCheck` called before filing; 422 returned on tipping-off detection.
- `/api/goaml/route.ts` — WIRED: egress gate added 2026-05-26; returns 422 with `egressVerdict` on tipping-off detection.
- `/api/screening-report`, `/api/batch-screen` — these routes output screening results (hits, scores) and do not generate narrative text that could constitute tipping-off under FDL 10/2025 Art.17. MLRO review confirmed: egress gate not required for pure data-export routes.

**UAE FDL 10/2025 Art.17 tipping-off control is now enforced on all narrative-generating regulator-facing routes.**

---

## CG-8 — HSTS preload list submission

**Risk:** LOW (security operations)  
**Description:** `netlify.toml` sets `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. The `preload` directive is only effective if the domain is submitted to the browser HSTS preload list at https://hstspreload.org. Without submission, the directive is a no-op for first-time visitors.

**Action required (operator):** Submit `hawkeye-sterling-v2.netlify.app` (or the custom domain) to https://hstspreload.org.

---

---

## CG-GOV-001 — Reasoning mode version governance: 338 modes on 0.0.0-pending

**Risk:** HIGH (regulatory — FATF R.18, FDL 10/2025 Art.16)
**Status:** CLOSED (2026-05-31)

**Description:**
`src/brain/reasoning-modes.ts` contains 463 reasoning mode definitions across 13 waves.
As of 2026-05-26: 125 modes had explicit version pins; 338 carried `version: '0.0.0-pending'`.

**Resolution (2026-05-31):** All 463 reasoning modes now have explicit version entries in
`_MODE_VERSION_ENTRIES`. `scripts/check-mode-versions.mjs` reports:

```
[check-mode-versions] PASS — all reasoning modes have explicit version pins.
```

The CI governance gate (`NODE_ENV=production node scripts/check-mode-versions.mjs`) now passes.
FDL 10/2025 Art.16 and FATF R.18 documentation requirements are satisfied.

**Technical controls in place:**
- `scripts/check-mode-versions.mjs` — CI gate; fails production build if any mode is `0.0.0-pending`
- `MODE_REGISTRY` in `reasoning-modes.ts` — exposes `getMissingVersionPins()` for audit discovery
- `scripts/validate-prompt-hashes.mjs` — complementary prompt-hash integrity gate (all 33 SYSTEM_PROMPTs verified)

---

---

## CG-9 — Role-based access control on regulatory-filing routes

**Risk:** HIGH (security)
**Status:** CLOSED (2026-05-27)

**Description:** Routes generating regulatory filings (SAR, goAML XML) and AI governance decisions (ai-override, four-eyes approval) previously accepted any authenticated API key — no role check beyond API key validation. An external integration key could have been used to generate a SAR or override an AI decision without MLRO authorisation.

**Resolution (2026-05-27):** `web/lib/server/role-gate.ts` — new `requireRole()` RBAC middleware wired to:
- `web/app/api/sar/route.ts` — POST requires `mlro`, `co`, or `admin` portal session role
- `web/app/api/goaml/route.ts` — POST requires `mlro`, `co`, or `admin` portal session role
- `web/app/api/four-eyes/route.ts` — PATCH (approve/reject) requires `mlro`, `co`, or `admin`
- `web/app/api/ai-override/route.ts` — POST requires `mlro`, `co`, or `admin`

All four routes call `enforce(req)` first (API key / rate limit), then `requireRole()` (portal session role). External API-key-only callers receive 401 SESSION_REQUIRED.

---

## Phase 1 Security Fixes (2026-05-27)

The following critical security defects were resolved:

**Fix-1.1 — Login lockout silent failure:**
`web/app/api/auth/login/route.ts` — when `setJson()` throws on lockout write, the route now returns 503 `Service temporarily unavailable` instead of silently allowing the request. Metric `hawkeye_auth_failures_total{reason="lockout_write_failed"}` fired.

**Fix-1.2 — Rate-limit concurrent write bypass:**
`web/lib/server/rate-limit.ts` — post-write read-back detecting `readBack.second.count > nextSecond + 1` now returns `{ allowed: false }` instead of logging and allowing. Metric `hawkeye_rate_limit_rejections_total{window="concurrent_write"}` fired.

**Fix-1.3 — Four-eyes PII exposure:**
`web/lib/server/four-eyes-gate.ts` — conflict messages now use `hashActor()` (SHA-256, first 12 hex chars) instead of the raw actor email/GID in both the pre-write same-actor check and the TOCTOU race rollback message.

**Fix-1.4 — LUISA recovery password single-use enforcement:**
`web/app/api/auth/login/route.ts` + `web/app/api/access/_store.ts` — `LUISA_INITIAL_PASSWORD` recovery path checks `luisaRecord.recoveryUsed`; sets it to `true` after first successful use. Subsequent recovery attempts using `LUISA_INITIAL_PASSWORD` are rejected, forcing normal password auth.

**Fix-1.5 — Semgrep SAST silenced:**
`.github/workflows/ci.yml` — removed `|| true` from the Semgrep scan step. SAST ERROR-severity findings now block CI.

**Fix-1.6 — requireFourEyes() PII exposure in API responses:**
`web/lib/server/four-eyes-gate.ts` — `requireFourEyes()` previously returned the full `FourEyesStatus` object (containing raw `approverGids: string[]` and `rejectedBy?: string` actor identities) and used them verbatim in error message strings. Both paths now return `SanitizedFourEyesStatus` (`approverHashes`, `rejectedByHash` — SHA-256 first 12 hex chars via `hashActor()`). The `decisions[]` array (raw `ApprovalEntry.actor` values) is stripped from all API responses. Internal audit chain reads retain the full unmasked record. Satisfies UAE PDPL + FDL 10/2025 Art.16 PII hygiene requirement.

---

## Phase 2 Security Fixes (2026-05-31)

**Fix-2.1 — JWT cross-service issuer confusion:**
`web/lib/server/jwt.ts` — `verifyJwt()` now rejects tokens that carry an explicit `iss` claim other than `"hawkeye-sterling"`. Defense-in-depth against cross-service JWT confusion if another service ever shares the signing key. Added `invalid_issuer` to the `JwtVerifyResult.reason` union. Test coverage added (`web/lib/server/__tests__/jwt.test.ts`, 10 cases).

**Fix-2.2 — Hallucination gate missing from regulatory narrative routes:**
`web/app/api/sar-narrative/route.ts`, `web/app/api/str-narrative/route.ts` — `checkHallucination()` wired as fire-and-forget post-response gate on both AI-generated regulatory document routes. Evidence fragments (activityDescription, adverseMedia, mlroNotes) passed to enable citation-grounded detection before MLRO review.

**Fix-2.3 — Emergency-reset brute-force protection:**
`web/app/api/auth/emergency-reset/route.ts` — Added `enforce(req, { requireAuth: false, cost: 5 })` rate-limiting gate to prevent automated brute-force of `LUISA_INITIAL_PASSWORD`. Previously unauthenticated callers had no request budget.

**Fix-2.4 — Blob-key path-traversal in 4 stores:**
User-supplied IDs were used as blob-store key segments without sanitization in:
- `web/lib/server/cdd-vault.ts` — `reviewKey()` now strips non-safe chars via `safeReviewId()`
- `web/lib/server/breach-store.ts` — `breachKey()` now sanitizes via `safeBreachId()`
- `web/lib/server/alerts-store.ts` — `alertKey()` now sanitizes via `safeAlertId()`
- `web/lib/server/enrichment-jobs.ts` — `jobKey()` now sanitizes via `safeJobId()`

**Fix-2.5 — batch-screen-stream missing audit chain:**
`web/app/api/batch-screen-stream/route.ts` — Added `writeAuditChainEntry` (event: `batch.screen_completed`) at stream completion, matching the non-streaming batch-screen endpoint. Previously, any batch screening run via the streaming endpoint left no trace in the tamper-evident audit chain.

---

## Phase 3 Dependency Hygiene (2026-06-04)

**Fix-3.1 — postcss XSS advisory in nested Next bundle (GHSA-qx2v-qp2m-jg93):**
`web/package.json` — `next` bundled an older nested `postcss` (<8.5.10) vulnerable to XSS via unescaped `</style>` in CSS stringify output. Added `"postcss": "$postcss"` to `overrides` to force the nested copy up to the already-patched direct dependency (`^8.5.15`), within the same 8.x major (non-breaking). `npm audit` on `web/` now reports **0 vulnerabilities**. Next.js 16 is unchanged.

**Accepted advisory — uuid bounds-check in exceljs (GHSA-w5hq-g745-h8pq), root:**
`exceljs@4.4.0` (latest) depends on `uuid@^8.3.0`; the advisory only triggers when a `buf` argument is supplied to `uuid` v3/v5/v6. exceljs calls `uuidv4()` with **no `buf` argument** (`lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`), so the vulnerable path is **unreachable**. The only available fix (`uuid@>=11.1.1`) is ESM-only and incompatible with exceljs's CommonJS `require('uuid')`, and would break XLSX ingestion of sanctions lists (au_dfat, jp_mof, uae_eocn). Risk **accepted**: moderate severity, non-reachable, and below the CI `npm audit` HIGH+CRITICAL gate. Revisit when exceljs ships a release on `uuid@11`.

---

## CG-BIAS-001 — Bias ratio threshold tighter than regulatory floor

**Risk:** LOW (regulatory alignment)
**Status:** DELIBERATE DEVIATION — MLRO acknowledgement required

**Description:** `web/lib/server/bias-monitor.ts` flags name-script groups as biased when `biasRatio > 1.15` (i.e., a group's mean screening score deviates more than 15% above the global mean). FATF R.10 Non-Discrimination and FDL 10/2025 Annex III set a regulatory floor of `biasRatio ≤ 1.5` (50% deviation).

The implementation is **more conservative** than the regulatory minimum. This is intentional: the 1.15 threshold was selected to detect emerging bias earlier and provide a margin of safety before the regulatory limit is breached.

**Configurable via:** `BIAS_RATIO_THRESHOLD` environment variable (default: `1.15`). The regulatory floor of `1.5` must never be exceeded regardless of this setting.

**Action required (MLRO):**
1. Confirm the 1.15 threshold is acceptable for the institution's risk appetite.
2. If the threshold generates excessive false-positive bias alerts on the current screening population, it may be raised up to but not exceeding `1.5`.
3. Document the MLRO sign-off date and rationale in this file.

---

## Resolution Checklist

| ID | Owner | Target Date | Status |
|----|-------|-------------|--------|
| CG-1 | MLRO | 2026-05-26 | CLOSED — requireAuth:true confirmed in code |
| CG-2 | MLRO | — | Partially closed — whitelist implemented, workflow approval pending |
| CG-3 | MLRO | — | Partially closed — cadences implemented, enrolment confirmation pending |
| CG-4 | Operator | — | Open |
| CG-5 | MLRO / DPO | 2026-05-26 | CLOSED — fonts.bunny.net (PDPL-compliant CDN); no Google Fonts in codebase |
| CG-6 | MLRO / CTO | — | Partially closed — S3/WORM replication implemented; bucket config + sign-off pending |
| CG-7 | MLRO | 2026-05-26 | CLOSED — egressGate wired to all narrative-generating routes (goAML + SAR); screening/batch data-export routes confirmed out of scope |
| CG-8 | Operator | — | Open |
| CG-9 | Engineering | 2026-05-27 | CLOSED — requireRole() RBAC wired to SAR, goAML, four-eyes, ai-override |
| CG-GOV-001 | MLRO / CO | 2026-05-31 | CLOSED — all 463 modes have explicit version pins; CI gate passes |
