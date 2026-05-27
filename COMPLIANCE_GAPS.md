# Hawkeye Sterling — Compliance Gaps
**Date:** 2026-05-26 (last updated)  
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
  2. Define escalation procedure for when `ongoing-screen` function fails (currently: errors logged, no Asana task or alert fired)

---

## CG-4 — goAML reporting entity IDs are placeholder values

**Risk:** CRITICAL (regulatory)  
**Description:** `.env.example` shows `"goamlRentityId": "REPLACE_ME"` for all 7 entities in `HAWKEYE_ENTITIES`. If these placeholders are deployed to production, every STR/SAR submitted via `/api/goaml-xml` will contain an invalid reporting entity ID, causing the UAE FIU to reject the filing.

FDL 10/2025 Art. 15 requires that every STR identify the reporting entity by its goAML-assigned ID.

**Action required (operator, not MLRO):**
  1. Confirm the UAE FIU registration status of each entity
  2. Replace each `REPLACE_ME` with the actual goAML Rentity ID in Netlify environment variables
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
**Status:** OPEN (2026-05-26) — requires MLRO/CO sign-off on each pending mode

**Description:**
`src/brain/reasoning-modes.ts` contains 463 reasoning mode definitions across 13 waves.
As of 2026-05-26: 125 modes have explicit version pins in `_MODE_VERSION_ENTRIES`; **338 modes**
still carry `version: '0.0.0-pending'` and `approvedBy: 'pending'`.

FATF R.18 requires financial institutions to document and approve the AI/algorithmic tools
used in AML/CFT controls. FDL 10/2025 Art.16 requires that material changes to AI decision
logic be recorded in the audit trail before deployment.

**Technical controls in place:**
- `scripts/check-mode-versions.mjs` (added 2026-05-26) fails the CI build in `NODE_ENV=production`
  if any mode is on `0.0.0-pending`.
- `MODE_REGISTRY` in `reasoning-modes.ts` makes the pending set discoverable via
  `getMissingVersionPins()`.

**Action required (MLRO/CO — cannot be auto-resolved):**
1. For each of the 338 pending modes, review the mode's `description` and `apply()` logic.
2. Assign a real `version` (semver), `deployedDate`, and `contentHash` (SHA-256 of description + apply source).
3. Record approver name in `approvedBy` field.
4. Add the entry to `_MODE_VERSION_ENTRIES` in `src/brain/reasoning-modes.ts`.
5. Run `node scripts/check-mode-versions.mjs` to verify the pending count reaches 0.

**Counts (2026-05-26):** total=463, pinned=125, pending=338. Deadline: before next regulatory examination.

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
| CG-GOV-001 | MLRO / CO | Before next exam | Open — 338 of 463 modes pending version approval |
