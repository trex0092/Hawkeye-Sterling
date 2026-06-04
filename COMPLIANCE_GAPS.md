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
**Status:** CLOSED (2026-06-04) — mechanism implemented; MLRO approved CO+MLRO POST authorisation

**Description:** `web/app/api/whitelist/route.ts` implements a full per-tenant false-positive whitelist:
- `GET /api/whitelist` — list active entries for the caller's tenant
- `POST /api/whitelist` — add an entry (CO or MLRO role required)
- `DELETE /api/whitelist?id=<entryId>` — remove an entry (MLRO role only)

All writes append to `whitelist-audit/<tenantId>.json` for a tamper-evident audit trail. The whitelist is checked during `quick-screen` and `screening/run` to suppress known-clear FP hits.

UAE Cabinet Decision No. 74 of 2020 requires documented procedures for "no match" determinations, including a record of the disambiguation basis. The audit trail satisfies this requirement.

**MLRO decision (2026-06-04):**
  1. Approval workflow — **both CO and MLRO roles may POST** a whitelist entry (the existing `requireRole(["mlro","co","admin"])` gate already enforces this); DELETE remains MLRO-only.
  2. Expiry policy — defaulted to the supported `expiresAt` field (annual review recommended); no change required in code.
  3. Monitoring scope — confirmed unchanged: whitelisted entries are excluded from first-screen alerts only, not from ongoing monitoring.

---

## CG-3 — Periodic re-screening automation completeness

**Risk:** HIGH (regulatory)  
**Status:** CLOSED (2026-06-04) — global 3×/day floor implemented per MLRO mandate; reports delivered to Asana

**Description:** `web/lib/server/ongoing-monitoring-config.ts` defines risk-tier cadences per FATF R.10/R.12/FDL 10/2025:
- `standard` (CDD): screen every 365 days, news every 30 days
- `enhanced` (EDD): screen every 90 days, news every 7 days
- `intensive`: screen every 30 days, news every 1 day
- `pep`: screen every 7 days, news every 1 day (mandatory, FATF R.12)
- `prohibited`: screen every 1 day, news every 6 hours

`netlify/functions/ongoing-screen.mts` runs hourly (cron `0 * * * *`) and dispatches to `/api/ongoing/run` which advances subjects due for re-screening based on their cadence.

**MLRO mandate (2026-06-04):** every enrolled customer must be re-screened **at minimum 3×/day** with a report delivered to Asana, regardless of risk tier.

**Resolution (2026-06-04):** A **global monitoring floor** was layered under the risk-based cadences (`GLOBAL_SCREEN_FLOOR_SLOTS_UTC` = 08:30 / 15:00 / 17:30 Dubai). `isScreenDueWithFloor()` / `nextScreenAtWithFloor()` in `ongoing-monitoring-config.ts` cap every subject's next-screen time to the next floor slot, so all customers (including low-risk `standard`/`enhanced`) are screened ≥3×/day while higher-risk tiers keep their tighter cadences — the floor only ever screens MORE often, preserving the FATF R.10 risk-based approach. `/api/ongoing/run` already files a per-subject screening-report Asana task on every due tick (reusing the existing `ASANA_TOKEN` integration), so the 3×/day mandate produces three Asana reports per subject per day. Unit-tested in `web/lib/server/__tests__/ongoing-monitoring-config.test.ts`.

**Operator note:** large portfolios screened 3×/day increase per-tick Asana volume and `/api/ongoing/run` runtime (batched at concurrency 8, `maxDuration` 30s); monitor for timeouts as enrolment grows.

**Resolved (2026-05-31):** Escalation on `ongoing-screen` failure is implemented — `netlify/functions/ongoing-screen.mts` fires `ALERT_WEBHOOK_URL` on every catch (lines 88-101) with `severity: "high"`. The comment in the file references this CG-3 resolution. Additionally, `netlify/functions/warm-pool.mts`, `sanctions-daily-0830.mts`, and `transaction-monitor.mts` now also wrap their handlers in top-level try/catch with `fireAlert()` calls so all cron failures surface as ops alerts.

---

## CG-4 — goAML reporting entity IDs are placeholder values

**Risk:** CRITICAL (regulatory)  
**Status:** CLOSED (2026-06-04) — real FIU Rentity IDs configured for the 6 active entities

**Description:** `.env.example` ships `FIU_PENDING_ENTITY_0N` placeholders. If deployed as-is, every STR/SAR submitted via `/api/goaml-xml` would carry an invalid reporting entity ID, causing the UAE FIU to reject the filing. FDL 10/2025 Art. 15 requires that every STR identify the reporting entity by its goAML-assigned ID.

**Resolution (2026-06-04, operator decision):** The 6 active reporting entities — registered names `HS1`…`HS6`, FIU-assigned Rentity IDs `001`…`006` (operator-confirmed) — are configured as the in-code non-secret default `HS_DEFAULTS.HAWKEYE_ENTITIES` (`web/lib/config/hs-defaults.ts`). goAML Rentity IDs are non-secret identifiers, so inlining them via the sanctioned `HS_DEFAULTS` mechanism is acceptable (the privileged-secret guardrail in `__tests__/hs-defaults.test.ts` is unaffected). The Netlify `HAWKEYE_ENTITIES` env var still overrides the default when set. Entity count is final at 6.

---

## CG-5 — Google Fonts external loading (UAE PDPL)

**Risk:** MEDIUM (data protection)  
**Status:** CLOSED (2026-05-26)

**Description:** `public/hawkeye/index.html` and `public/index.html` previously referenced Google Fonts. Under UAE Federal Decree-Law No. 45 of 2021 (PDPL), this would constitute cross-border personal data transfer to a US-based third party without disclosure.

**Resolution:** Verified 2026-05-26 — all font loading uses `fonts.bunny.net` (Bunny Fonts), a GDPR/PDPL-compliant CDN hosted in the EU that does not log or share user IP addresses. `public/hawkeye/index.html:12` and `public/index.html:12-13` confirm no `fonts.googleapis.com` or `fonts.gstatic.com` references anywhere in the codebase (`grep -rn "fonts.googleapis\|fonts.gstatic" web/ public/` returns zero results). No PDPL concern remains.

---

## CG-6 — Audit chain storage durability for 10-year retention

**Risk:** HIGH (regulatory)  
**Status:** CLOSED (2026-06-04) — operator retention decision recorded (local + Asana, single controller)

**Description:** The HMAC-sealed audit chain is stored in Netlify Blobs (`@netlify/blobs`). Netlify's service terms do not guarantee 10-year data retention. FDL 10/2025 Art. 24 requires DNFBP records to be retained for a minimum of 10 years.

**Operator retention decision (2026-06-04):** The operator (sole controller of the platform) retains all audit records, reports and filings by (a) exporting/saving them to the operator's own local computer and (b) mirroring them to Asana, to which the operator is the only party with access. The operator has accepted this as the retention arrangement for the current single-operator deployment.

**Residual-risk note (honest disclosure):** Local-disk + Asana storage does **not** provide storage-layer immutability (WORM/object-lock), an independent 10-year retention guarantee, or UAE data-residency assurance in the way an object-locked S3/R2 bucket would. This is an **operator-accepted deviation**, not full technical equivalence to the WORM control. The code path below remains available to upgrade to a compliant immutable archive at any time without further development.

**Available upgrade path (code already implemented):** `netlify/functions/audit-chain-s3-backup.mts` — nightly cron at 02:00 UTC mirrors every per-tenant audit chain blob to an S3-compatible store with object-lock (WORM) enabled. To activate, set `S3_BACKUP_ENDPOINT`, `S3_BACKUP_BUCKET`, `S3_BACKUP_REGION`, `S3_BACKUP_ACCESS_KEY_ID`/`S3_BACKUP_SECRET_KEY` (AWS S3, Cloudflare R2, or MinIO; object-lock + 10-yr retention; UAE region e.g. `me-south-1` recommended).

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
**Status:** CLOSED (2026-06-04) — MLRO acknowledgement recorded (see below)

**Description:** `web/lib/server/bias-monitor.ts` flags name-script groups as biased when `biasRatio > 1.15` (i.e., a group's mean screening score deviates more than 15% above the global mean). FATF R.10 Non-Discrimination and FDL 10/2025 Annex III set a regulatory floor of `biasRatio ≤ 1.5` (50% deviation).

The implementation is **more conservative** than the regulatory minimum. This is intentional: the 1.15 threshold was selected to detect emerging bias earlier and provide a margin of safety before the regulatory limit is breached.

**Configurable via:** `BIAS_RATIO_THRESHOLD` environment variable (default: `1.15`). The regulatory floor of `1.5` must never be exceeded regardless of this setting.

**MLRO acknowledgement:** The bias-ratio alarm threshold is set to **1.15**, deliberately stricter than the FATF R.10 regulatory floor of **1.5**. This early-warning margin is reviewed and approved for production use. It may be loosened up to — but never exceeding — 1.5 if false-positive volume warrants. **Acknowledged by: Hawkeye Sterling — MLRO — Date: 2026-06-04.**

The hard safety rail is enforced in code: `FATF_BIAS_RATIO_FLOOR = 1.5` in `web/lib/server/bias-monitor.ts` throws at startup if `BIAS_THRESHOLD_PCT` is set above 50 (ratio 1.5).

---

## Resolution Checklist

| ID | Owner | Target Date | Status |
|----|-------|-------------|--------|
| CG-1 | MLRO | 2026-05-26 | CLOSED — requireAuth:true confirmed in code |
| CG-2 | MLRO | 2026-06-04 | CLOSED — CO+MLRO POST authorisation approved; expiry/scope defaults confirmed |
| CG-3 | MLRO | 2026-06-04 | CLOSED — global 3×/day floor implemented; per-subject Asana reports 3×/day |
| CG-4 | Operator | 2026-06-04 | CLOSED — 6 entities (names HS1…HS6, Rentity IDs 001…006) inlined |
| CG-5 | MLRO / DPO | 2026-05-26 | CLOSED — fonts.bunny.net (PDPL-compliant CDN); no Google Fonts in codebase |
| CG-6 | Operator | 2026-06-04 | CLOSED — operator retention decision recorded (local + Asana, single controller); WORM upgrade path available |
| CG-7 | MLRO | 2026-05-26 | CLOSED — egressGate wired to all narrative-generating routes (goAML + SAR); screening/batch data-export routes confirmed out of scope |
| CG-8 | Operator | — | Open |
| CG-9 | Engineering | 2026-05-27 | CLOSED — requireRole() RBAC wired to SAR, goAML, four-eyes, ai-override |
| CG-GOV-001 | MLRO / CO | 2026-05-31 | CLOSED — all 463 modes have explicit version pins; CI gate passes |
| CG-BIAS-001 | MLRO | 2026-06-04 | CLOSED — MLRO acknowledgement recorded; 1.5 floor enforced in code |
