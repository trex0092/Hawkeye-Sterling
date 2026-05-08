# Hawkeye Sterling — Fix Report
**Audit date:** 2026-05-08  
**Auditor:** Claude Code (claude-sonnet-4-6)  
**Repository:** github.com/trex0092/Hawkeye-Sterling  
**Deployment:** https://hawkeye-sterling-v2.netlify.app

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| CRITICAL | Immediate regulatory or security exposure; production-blocking |
| HIGH | Significant compliance or security gap requiring prompt resolution |
| MEDIUM | Compliance process gap or best-practice deviation |
| LOW | Code quality / operational improvement |
| INFO | Verified correct; documented for completeness |

---

## CRITICAL

### C-1 — SESSION_SECRET hardcoded fallback in production middleware
- **File:** `web/middleware.ts:42`
- **Finding:** `process.env["SESSION_SECRET"] ?? "hawkeye-sterling-dev-secret-change-in-prod"` — the fallback is a known public string. Any operator who deploys without setting `SESSION_SECRET` in Netlify gets a portal where session tokens can be forged by anyone who reads the source code. An attacker can craft a valid `hs_session` cookie and bypass authentication entirely.
- **Fix applied:** Removed the fallback. When `SESSION_SECRET` is unset, `isValidSession()` now returns `false` (fail-closed), redirecting all users to `/login`. This is consistent with `web/lib/server/auth.ts:39` which already throws on missing secret.
- **File after fix:** `web/middleware.ts:42–46`

---

## HIGH

### H-1 — SESSION_SECRET missing from .env.example
- **File:** `.env.example` (missing entry)
- **Finding:** `SESSION_SECRET` was not documented in the env template. Operators following the template would omit it, triggering C-1 or (with the C-1 fix applied) locking everyone out of the portal.
- **Fix applied:** Added `SESSION_SECRET=` to `.env.example` with full documentation and generation command (`openssl rand -hex 32`), under the REQUIRED block.

### H-2 — Asana MLRO assignee not set in egressGate delivery path
- **File:** `src/integrations/asana.ts:91–99`
- **Finding:** `deliverToAsana()` builds `taskBody` without an `assignee` field. Tasks created via the `egressGate.ts` path land in Project 00 unassigned — Luisa Fernanda (GID 1213645083721304) does not receive Asana inbox notifications. MLRO may miss screening results.
- **Fix applied:**
  1. Added `assigneeGid?: string` to `AsanaConfig` interface.
  2. `deliverToAsana()` sets `taskBody['assignee'] = config.assigneeGid` when present.
- **Note:** Web API routes that create tasks directly (e.g., `screening-report`, `batch-screen`) already set `assignee` inline via `process.env["ASANA_ASSIGNEE_GID"]`. This fix closes the gap only for the `egressGate` → `deliverToAsana` path.

### H-3 — Cache-Control: no-store absent from /api/quick-screen
- **File:** `web/app/api/quick-screen/route.ts:59`
- **Finding:** The route exports `dynamic = "force-dynamic"` which prevents Next.js internal caching, but no explicit `Cache-Control: no-store` header was set. Intermediate CDN layers (Netlify Edge, shared proxies) may cache screening responses. A cached CLEAR verdict served to a subsequent screening of the same name is a compliance failure.
- **Fix applied:** Added `"cache-control": "no-store, no-cache, must-revalidate"` to `CORS_HEADERS` (applied to every response).

### H-4 — CSP script-src hash stale — inline clock script silently blocked
- **File:** `netlify.toml:75`
- **Finding:** `Content-Security-Policy` `script-src` contained hash `sha256-RnIa4LmlLAqFFOZR6v14/CDoOXk0745RlcTFwZE3qEE=`. The actual SHA-256 of the inline UTC-clock script (normalised to LF as served by Netlify/Linux) in both `public/hawkeye/index.html` and `docs/overview.html` is `sha256-uAiHQr4EnpWqCN2LcM80Nn9IIvUzB/jnDmO/OmYrL3E=`. The stale hash causes the clock script to be silently blocked by CSP in all browsers — the navigation UTC timestamp displays `—` and never updates.
- **Fix applied:** Updated `netlify.toml:75` to `sha256-uAiHQr4EnpWqCN2LcM80Nn9IIvUzB/jnDmO/OmYrL3E=`.
- **Verification:** After deploy, open DevTools console — no CSP violations should appear on `public/hawkeye/index.html`.

---

## MEDIUM

### M-1 — robots meta tag absent — compliance pages indexable
- **Files:** `public/hawkeye/index.html`, `public/index.html`
- **Finding:** Neither page carried `<meta name="robots" content="noindex, nofollow">`. A compliance screening portal should not be indexed by search engines (privacy, security, UAE PDPL).
- **Fix applied:** Added `<meta name="robots" content="noindex, nofollow">` to both pages.

### M-2 — Asana task due_on not set based on risk urgency
- **File:** `src/integrations/asana.ts:54–79`
- **Finding:** `buildAsanaEnvelope()` set no `dueOn`. UAE DNFBP compliance requires: Positive hit → same-day disposition; Possible hit → 3 days; no hit → 5 days (for audit record filing).
- **Fix applied:** Added `dueOnFor()` helper that derives `dueOn` from `keyFindings.verdictBreakdown`: `Positive > 0 → today`, `Possible > 0 → today+3`, otherwise `today+5`.

### M-3 — Fragile relative import path to compiled brain
- **File:** `web/app/api/quick-screen/route.ts:36`
- **Finding:** Import used four levels of `..` (`../../../../dist/src/brain/quick-screen.js`). Any directory restructuring silently breaks the runtime import.
- **Fix applied:**
  1. Added `"@brain/*": ["../dist/src/brain/*"]` path alias to `web/tsconfig.json`.
  2. Updated import to `@brain/quick-screen.js`.

### M-4 — Google Fonts loaded from external CDN
- **Files:** `public/hawkeye/index.html:10–12`, `public/index.html:11–13`
- **Finding:** Both pages load Inter, IBM Plex Mono, and Cormorant Garamond from `fonts.googleapis.com` / `fonts.gstatic.com`. Under UAE Federal Decree-Law No. 45 of 2021 (PDPL), loading external resources transfers visitor IP addresses to Google — a third-party data processor — without an explicit lawful basis disclosed to the user.
- **Fix not applied (product decision required):** See COMPLIANCE_GAPS.md CG-5.
- **Recommended fix:** Self-host fonts via `@font-face` in the existing CSS bundles.

---

## LOW

### L-1 — gen-weaponized-brain.cjs produces no checksum for CI validation
- **File:** `scripts/gen-weaponized-brain.cjs`
- **Finding:** The script writes `web/public/weaponized-brain.json` and logs its byte size but produces no hash. The HS-STEP-3 marker in the Netlify log cannot confirm whether the output matches expectations.
- **Fix not applied (low risk):** Consider logging `crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex')` alongside the byte count.

### L-2 — style-src 'unsafe-inline' in CSP
- **File:** `netlify.toml:75`
- **Finding:** `style-src 'self' 'unsafe-inline'` permits injected inline styles, which can be abused for CSS-based data exfiltration. The comment notes a nonce-based approach requires Next.js middleware.
- **Fix not applied (Next.js complexity):** Migrating to nonce-based CSP for styles requires Next.js middleware and is a larger effort. Documented as a future hardening item.

---

## Session 2 Fixes (2026-05-08)

### S2-1 — Next.js upgraded 14.2.35 → 15.5.18 (HIGH — 7 CVEs eliminated)
- **Files:** `web/package.json`, 4 dynamic route handlers
- **Finding:** Next.js 14.2.35 had 7 HIGH/MODERATE CVEs including SSRF via middleware rewrites, cache key confusion for image optimisation, HTTP request smuggling, and denial of service via Server Components. `npm audit fix --force` recommended `next@15.5.18` (the 15.x security backport tag).
- **Fix applied:**
  1. Updated `web/package.json`: `"next": "14.2.35"` → `"15.5.18"`.
  2. Updated `@netlify/plugin-nextjs`: `5.7.2` → `5.15.11` (latest stable, full Next.js 15 support).
  3. Migrated 4 dynamic route handlers to Next.js 15 async `params` pattern (`Promise<{ id: string }>`): `web/app/api/advisor-job/[jobId]/route.ts`, `web/app/api/alerts/[id]/dismiss/route.ts`, `web/app/api/corrections/[id]/route.ts`, `web/app/api/keys/[id]/route.ts`.
  4. All 3 existing `cookies()` usages already used `await` — no changes needed.
- **Remaining:** 2 moderate vulnerabilities remain in `node_modules/next/node_modules/postcss` (Next.js-internal bundled postcss <8.5.10). These are unfixable without a breaking Next.js 16 upgrade. Actual risk is LOW — the app does not run attacker-controlled CSS through Next.js's internal postcss.

### S2-2 — Google Fonts replaced with Bunny Fonts (MEDIUM — UAE PDPL)
- **Files:** `public/hawkeye/index.html:11–13`, `public/index.html:12–14`, `netlify.toml:75`
- **Finding:** Both static HTML pages loaded fonts from `fonts.googleapis.com` / `fonts.gstatic.com`, transmitting visitor IP and browser fingerprint to Google (US-based third party) without disclosure. UAE PDPL Art. 22 requires lawful basis for cross-border personal data transfer.
- **Fix applied:** Replaced Google Fonts CDN with `fonts.bunny.net` (Bunny CDN — GDPR-compliant, no user tracking, EEA-resident servers). Updated `Content-Security-Policy` in `netlify.toml` to allow `https://fonts.bunny.net` in `style-src` and `font-src`, removing `fonts.googleapis.com` and `fonts.gstatic.com`.

### S2-3 — PII (subject names) logged to server stdout (HIGH — UAE PDPL)
- **File:** `web/app/api/adverse-media/route.ts:242,378`
- **Finding:** Two `console.warn` calls included the subject name (customer entity) in the message: `GDELT unavailable for "${subject}"` and `Claude returned non-JSON for "${subject}"`. Under UAE PDPL, subject names are personal data and must not be written to unencrypted logs.
- **Fix applied:** Replaced interpolated subject name with `(subject redacted)` in both log messages.

### S2-4 — Asana taskGid undefined returned as ok:true (HIGH — audit trail)
- **File:** `src/integrations/asana.ts:139–141`
- **Finding:** `const taskGid = json.data?.gid` could be `undefined` if the Asana API returned a malformed response (missing `gid` field). The function then returned `{ ok: true, taskGid: undefined }`, which callers treated as successful delivery. The MLRO audit trail would record no task URL.
- **Fix applied:** Added guard — if `taskGid` is falsy after the API call, return `{ ok: false, error: 'Asana task created but GID missing in response — audit trail broken' }`.

### S2-5 — Input validation hardening (MEDIUM)
- **Files:** `web/app/api/agent/batch-screen/route.ts:91`, `web/app/api/feedback/route.ts:70–107`
- **Finding 1:** `agent/batch-screen` validated name presence and length but not type (`string`) or whitespace-only content.
- **Finding 2:** `feedback/route.ts` validated field presence but not whitespace-only values or length bounds on `analyst` field.
- **Fix applied:** 
  1. Added `typeof sub.name !== "string"` and `!sub.name.trim()` to batch-screen guard.
  2. Added `clean` object in feedback POST that trims all string fields, caps `analyst` at 200 chars, and caps `reason` at 2000 chars. `submitFeedback` called with cleaned values.

### S2-6 — Phonetic agreement flag on tied scores (LOW — matching accuracy)
- **File:** `src/brain/quick-screen.ts:104`
- **Finding:** The `else if` branch that set `phonetic = true` on a tie included a redundant `!phonetic` guard that prevented re-affirmation. The guard was never semantically useful.
- **Fix applied:** Removed `&& !phonetic` — any tie with phonetic agreement correctly sets the flag.

---

## INFO (Verified Correct — No Action Required)

| ID | Item | Status |
|----|------|--------|
| I-1 | `strict: true` in root `tsconfig.json` | ✓ Enabled with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| I-2 | Claude model strings | ✓ `claude-opus-4-7` / `claude-sonnet-4-6` / `claude-haiku-4-5-20251001` — correct Claude 4.x family |
| I-3 | Anthropic API error handling | ✓ `httpRetry.ts` implements per-attempt timeout, idle-read timeout, exponential backoff, 3 retries, 429/5xx detection, partial-response detection |
| I-4 | max_tokens adequacy | ✓ `claudeAgent.ts`: 16,000; `complianceAgent.ts` / `mlroAdvisor.ts`: configurable |
| I-5 | All Anthropic calls server-side | ✓ `check:pii-guard` npm script enforces `getAnthropicClient()` only; no `new Anthropic()` in client code |
| I-6 | Asana task flow (Project 00 as landing hub) | ✓ All tasks land in `ASANA_PROJECT_GID` (Project 00); no direct writes to Projects 01–19 found |
| I-7 | Asana token security | ✓ `ASANA_TOKEN` in env only; not present in any committed `.ts`/`.js`/`.html` |
| I-8 | `dist/` not committed to git | ✓ `git ls-files dist/` returns empty |
| I-9 | HSTS header | ✓ `max-age=63072000; includeSubDomains; preload` in `netlify.toml` |
| I-10 | System prompt (compliance charter) | ✓ P1–P10 prohibitions, mandatory output structure, transliteration guidance, UAE regulatory anchors all present in `src/policy/systemPrompt.ts` |
| I-11 | Sanctions list coverage | ✓ UN / OFAC SDN / OFAC Cons / EU FSF / UK OFSI / UAE EOCN plus AU, CH, CA, NZ, JP, SG adapters |
| I-12 | Fuzzy name matching | ✓ Levenshtein, Jaro-Winkler, Soundex, Double Metaphone in `src/brain/lib/name-matching.ts` |
| I-13 | Audit trail immutability | ✓ HMAC-sealed audit chain in `src/brain/audit-chain.ts` via `/api/audit/sign` + `AUDIT_CHAIN_SECRET` |
| I-14 | Input validation on quick-screen | ✓ Name type/presence checked; candidate array shape validated at runtime; 5,000-entry cap |
| I-15 | No localStorage/sessionStorage for PII | ✓ Not found in any reviewed component |
| I-16 | Warm-pool function uses production URL | ✓ `process.env['URL'] ?? process.env['DEPLOY_PRIME_URL']` — no hardcoded dev URL |
| I-17 | gen-weaponized-brain.cjs reads from dist/ | ✓ Reads `dist/src/brain/weaponized.js`; requires HS-STEP-2 (tsc) to precede HS-STEP-3 |
| I-18 | HS-STEP markers preserved | ✓ 6-step pipeline structure intact in `netlify.toml` |
| I-19 | Session tokens httpOnly cookie | ✓ `issueSession()` writes `hs_session` cookie; `web/middleware.ts` validates HMAC |

---

## Change Summary

| Fix | File(s) | Lines |
|-----|---------|-------|
| C-1 SESSION_SECRET fail-closed | `web/middleware.ts` | 42–46 |
| H-1 SESSION_SECRET env doc | `.env.example` | after ADMIN_TOKEN |
| H-2 Asana assignee | `src/integrations/asana.ts` | interface + taskBody |
| H-3 Cache-Control: no-store | `web/app/api/quick-screen/route.ts` | CORS_HEADERS |
| H-4 CSP hash | `netlify.toml` | 75 |
| M-1 robots noindex | `public/hawkeye/index.html`, `public/index.html` | head |
| M-2 Asana due_on urgency | `src/integrations/asana.ts` | buildAsanaEnvelope |
| M-3 @brain path alias | `web/tsconfig.json`, `web/app/api/quick-screen/route.ts` | paths + import |
| S2-1 Next.js 14→15.5.18 + async params | `web/package.json`, 4 route handlers | — |
| S2-2 Bunny Fonts (PDPL) | `public/hawkeye/index.html`, `public/index.html`, `netlify.toml` | head, CSP |
| S2-3 PII in server logs | `web/app/api/adverse-media/route.ts` | 242, 378 |
| S2-4 Asana taskGid guard | `src/integrations/asana.ts` | 139–144 |
| S2-5 Input validation hardening | `web/app/api/agent/batch-screen/route.ts`, `web/app/api/feedback/route.ts` | 91, 70–107 |
| S2-6 Phonetic tie flag | `src/brain/quick-screen.ts` | 104 |
