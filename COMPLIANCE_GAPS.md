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

## CG-2 — No false-positive whitelist mechanism

**Risk:** HIGH (operational compliance)  
**Description:** There is no mechanism to whitelist known-clear entities that generate repeated false-positive hits (e.g., common Arabic names that phonetically match list entries). Without a whitelist, compliance officers must manually re-clear the same subject on every re-screening run, creating alert fatigue and increasing the risk of a real hit being dismissed.

UAE Cabinet Decision No. 74 of 2020 requires documented procedures for "no match" determinations, including a record of the disambiguation basis.

**Decision required:** MLRO to define:
  1. Whitelist approval workflow (who can approve, what documentation is required)
  2. Whitelist record format and retention period
  3. Whether whitelists expire (recommended: annual review)
  4. Whether whitelisted entries are excluded from ongoing monitoring or only from first-screening alerts

---

## CG-3 — Periodic re-screening automation completeness

**Risk:** HIGH (regulatory)  
**Description:** `netlify/functions/ongoing-screen.mts` and `/api/ongoing/` routes exist but it is unclear from static analysis alone whether all active customers are enrolled in periodic re-screening and whether the schedule meets the frequency required by the MLRO's risk-based programme.

UAE MoE Circular 3/2025 requires DNFBPs to conduct ongoing monitoring commensurate with customer risk tier.

**Decision required:** MLRO to confirm:
  1. The frequency of automated re-screening per risk tier (HIGH/MEDIUM/LOW)
  2. Whether all existing customers have an active `ongoing_screen` schedule
  3. What happens when the `ongoing-screen` function fails (current: errors are logged but no escalation is triggered)

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
**Description:** `public/hawkeye/index.html` and `public/index.html` load fonts from `fonts.googleapis.com`. Every page load transmits the visitor's IP address and browser fingerprint to Google (a US-based third party). Under UAE Federal Decree-Law No. 45 of 2021 (PDPL), this constitutes cross-border personal data transfer without disclosure.

**Decision required:** MLRO / DPO to choose:
  - **Option A (recommended):** Self-host Inter, IBM Plex Mono, and Cormorant Garamond via `@font-face` in the existing CSS bundles. No PDPL concern.
  - **Option B:** Add a cookie/consent banner that discloses the Google Fonts transfer before page load. Adds UX friction.

---

## CG-6 — Audit chain storage durability for 10-year retention

**Risk:** HIGH (regulatory)  
**Description:** The HMAC-sealed audit chain is stored in Netlify Blobs (`@netlify/blobs`). Netlify's service terms do not guarantee 10-year data retention. FDL 10/2025 Art. 24 requires DNFBP records to be retained for a minimum of 10 years.

**Decision required:** MLRO / CTO to confirm:
  1. Whether Netlify Blobs is contractually committed to 10-year retention in the current plan, or
  2. Whether the audit chain should be replicated to a durable external store (S3, Azure Blob Storage, etc.) with explicit 10-year lifecycle policy

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

## Resolution Checklist

| ID | Owner | Target Date | Status |
|----|-------|-------------|--------|
| CG-1 | MLRO | 2026-05-26 | CLOSED — requireAuth:true confirmed in code |
| CG-2 | MLRO | — | Open |
| CG-3 | MLRO | — | Open |
| CG-4 | Operator | — | Open |
| CG-5 | MLRO / DPO | — | Open |
| CG-6 | MLRO / CTO | — | Open |
| CG-7 | MLRO | 2026-05-26 | CLOSED — egressGate wired to all narrative-generating routes (goAML + SAR); screening/batch data-export routes confirmed out of scope |
| CG-8 | Operator | — | Open |
