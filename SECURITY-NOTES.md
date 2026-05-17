# Hawkeye Sterling — Security Architecture Notes

**Classification:** Internal / Compliance-Sensitive  
**Last updated:** 2026-05-17

---

## 1. Authentication Model

### 1.1 — Session-based (browser portal)
- Cookie: `HttpOnly; Secure; SameSite=Strict`
- HMAC-SHA256 signed with `SESSION_SECRET`
- `/api/auth/login` → `/api/auth/me` → `/api/auth/logout`

### 1.2 — API-key (programmatic callers)
- Bearer token in `Authorization: Bearer <token>`
- Keys stored in `hawkeye-sterling` Netlify Blobs store under `api-key/<id>`
- Key shape: `{ id, tierId, tenantId, hashedSecret, createdAt, lastUsed }`
- Secret hashed with PBKDF2-SHA256 (100,000 iterations) before storage
- Rate-limited per-key: tier-configurable burst (rps) and sustained (rpm) windows
- Enforced via `lib/server/enforce.ts` → `lib/server/api-keys.ts`

### 1.3 — Admin-only routes
- `Bearer ADMIN_TOKEN` — static secret set as Netlify env var
- Protected by `enforce(req)` with `requireAdmin: true` or `withGuard()`
- Routes: `/api/admin/*`, `/api/audit-trail/export`, `/api/four-eyes/*`, `/api/metrics`

### 1.4 — Regulator JWT (read-only external access)
- Ed25519-signed JWT; algorithm `EdDSA`
- Signed with `REPORT_ED25519_PRIVATE_KEY`; public key published at `/.well-known/hawkeye-pubkey.pem`
- Claims: `iss`, `sub: "regulator:<id>"`, `aud: "regulator-read-only"`, `scope: ["tenant:<id>"]`
- Max TTL: 90 days; default 7 days; `nbf` supported for windowed audits
- JTI included for revocation linkage
- Issued via `POST /api/admin/issue-regulator-token` (admin-only)
- Verified via `lib/server/regulator-jwt.ts:verifyRegulatorToken()`

---

## 2. Audit Chain

- All screening, four-eyes decisions, and regulatory events written to `hawkeye-audit-chain` blob store
- Each entry: `{ seq, at, event, actor, payload, hash, prevHash }`
- Hash: FNV-1a HMAC keyed with `AUDIT_CHAIN_SECRET` over `seq + at + event + actor + JSON(payload) + prevHash`
- Chain integrity verifiable via `GET /api/audit-trail/verify`
- Export: `GET /api/audit-trail/export?from=<ISO>&to=<ISO>&format=json|csv`
- Retention: 10 years (FDL 10/2025 Art. 24); `retention-scheduler.mts` enforces this

---

## 3. Secrets Never Logged or Exposed

The following secrets are never read, printed, or included in API responses:

- `LSEG_WORLDCHECK_API_KEY`
- `LSEG_WORLDCHECK_API_SECRET`
- `LSEG_APP_KEY`
- `ASANA_TOKEN`
- `ADMIN_TOKEN`
- `AUDIT_CHAIN_SECRET`
- `SESSION_SECRET`
- `JWT_SIGNING_SECRET`
- `ONGOING_RUN_TOKEN`
- `SANCTIONS_CRON_TOKEN`

All credential-presence checks use `Boolean(process.env["VAR_NAME"])` — never the value itself.

---

## 4. Input Validation

### 4.1 — LLM prompt injection
- All user-supplied strings sanitised via `lib/server/sanitize-prompt.ts`
- `sanitizeField()` strips newlines (single-line fields) before LLM interpolation
- `sanitizeText()` caps length (5,000 chars) for multi-line fields

### 4.2 — Blob store key injection
- All keys derived from user input validated against `SAFE_ID_RE = /^[a-zA-Z0-9_\-:.]+$/`
- Max key length: 96–128 characters depending on resource type
- Prevents directory traversal and key namespace pollution

### 4.3 — SQL / NoSQL
- No relational database — all persistence via Netlify Blobs (key-value)
- No injection surface beyond key construction (guarded by SAFE_ID_RE above)

### 4.4 — Four-eyes self-approval prevention
- `POST /api/four-eyes/approve` and `PATCH /api/four-eyes` both enforce:
  - `actor !== item.initiatedBy` — no self-approval (UAE FDL 10/2025 Art.16)
  - Actor may not submit two approvals for the same item (duplicate-approver guard)

---

## 5. HTTP Security Headers

Set via Next.js middleware (`web/middleware.ts`) on every response:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | Nonce-based; `default-src 'self'`; inline scripts via `nonce-*` |

`X-Request-ID` echoed on all responses (set by middleware from caller header or generated as 24-char hex).

---

## 6. CORS Policy

- Production: origin restricted to `NEXT_PUBLIC_APP_URL`
- `OPTIONS` preflight handlers on all mutating routes return `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers`
- No `Access-Control-Allow-Origin: *` on mutation endpoints

---

## 7. Rate Limiting

- Per-API-key: Netlify Blobs fixed-window counters (burst + sustained)
- Caveat: non-atomic (Blobs has no CAS) — under high concurrency a burst of P parallel requests can pass up to P × rps limit. For strict enforcement, replace with `@upstash/ratelimit` backed by `UPSTASH_REDIS_REST_URL`
- Rate-limit headers returned: `x-ratelimit-tier`, `x-ratelimit-limit-minute`, `x-ratelimit-remaining-minute`
- 429 response includes `retry-after` header

---

## 8. Dependency Vulnerabilities

**Current status (2026-05-17):**

| Severity | Count | Affected | Status |
|----------|-------|---------|--------|
| Critical | 0 | — | — |
| High | 0 | — | — |
| Moderate | 2 | `postcss` (via `next`) | Accepted — fix requires major Next.js upgrade |
| Low | 0 | — | — |

The PostCSS moderate vulnerability (GHSA-qx2v-qp2m-jg93) relates to HTML/CSS output escaping.
Hawkeye Sterling does not render untrusted HTML through PostCSS, so the practical risk surface
is minimal. Track against the next Next.js major release.

---

## 9. Cron Function Authentication

Scheduled functions that call internal API routes use token-based auth:

| Function | Token Variable |
|---------|---------------|
| `ongoing-screen.mts` | `ONGOING_RUN_TOKEN` |
| `sanctions-daily-*.mts` / `refresh-lists.ts` | `SANCTIONS_CRON_TOKEN` |
| `health-monitor.mts` | `ADMIN_TOKEN` |

Cron functions check `X-Netlify-Scheduled-Function: true` header (set by Netlify runtime) as a secondary guard.

---

## 10. Regulator Access Control

- Regulators receive time-limited read-only JWTs scoped to specific tenants or cases
- JWT cannot be used to write data — regulator routes are `GET` only
- Tokens expire within 90 days; ops team issues new tokens via admin UI
- Every token issuance is written to the audit chain with `issuedBy` actor
- Token fingerprint (SHA-256 truncated to 16 hex) stored for revocation linkage

---

## 11. Known Security Debt

| Item | Risk | Mitigation |
|------|------|-----------|
| Blobs rate-limit non-atomic | Double-spend under burst load | Replace with Upstash Redis for strict enforcement |
| PostCSS moderate CVE | Low (no untrusted HTML via PostCSS) | Track Next.js upgrade |
| No CSP violation reporting endpoint | Blind to injection attempts | Add `report-to` directive and collector |
| CFS file upload not virus-scanned | Malicious XLSX payload risk | Add ClamAV scan step on upload |

---

## 12. Incident Response Contacts

For security issues, contact the compliance team via the internal escalation channel.  
Do not discuss vulnerabilities in public GitHub issues — use the private security channel or email.
