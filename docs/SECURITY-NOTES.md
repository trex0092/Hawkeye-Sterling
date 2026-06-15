# Hawkeye-Sterling — Security Notes

This document captures the **active** security controls in
Hawkeye-Sterling, the threat model they address, and known
gaps. Every claim cites file:line evidence so a reviewer can
audit without reading the whole codebase.

> See also **`docs/SECURITY-HARDENING-REPORT.md`** — operator-facing
> walkthrough (Spanish) of the CORS policy, HTTP security headers, and
> the per-user/per-tenant isolation that substitutes for SQL row-level
> security (this stack has no Supabase/SQL DB).

## 1. Authentication + authorisation

### 1.1 `enforce()` fail-closed default

- File: `web/lib/server/enforce.ts:39`
- Behaviour: `enforce(req)` without explicit args inherits
  `{ requireAuth: true }`. Anonymous callers get HTTP 401 unless
  the route explicitly opts in with `{ requireAuth: false }`.
- CI guard: `.github/workflows/ci.yml:82-97` —
  `auth-coverage-gate` job fails the build if any route declares
  `requireAuth: false` without bumping the `ALLOWED_COUNT`
  constant with documented justification.
- Live verification: `GET /api/integrations/status` →
  HTTP 401 (was HTTP 200 prior to fix).

### 1.2 Portal admin token via Edge middleware

- File: `web/middleware.ts:170-189`
- Behaviour: Same-origin portal requests get `ADMIN_TOKEN` injected
  server-side. The token is **never** shipped to the browser bundle.
- Same-origin verification: `host`/`origin`/`referer` hostnames
  must match. Cross-origin callers do not get the token.

### 1.3 HMAC session cookies

- File: `web/middleware.ts:108-122` (Edge edge-check) +
  `web/lib/server/auth.ts` (Node.js full verify)
- Behaviour: Sessions are HMAC-signed with `SESSION_SECRET`. Edge
  checks expiry only (fast path); Node.js verifies the HMAC on
  every API call.
- Fail mode: spoofed cookie reaches the SPA shell but cannot
  authenticate any real-data fetch.

### 1.4 Login brute-force lockout

- File: `web/app/api/auth/login/route.ts:9-95`
- Behaviour: 10 failures per 15-min sliding window per
  SHA-hashed username. Locked accounts get HTTP 429 with
  `retry-after` header. Uniform 400 ms delay on every failure
  prevents user-enumeration via timing.
- Memory safety: `failureMap` bounded at 10 000 entries with FIFO
  eviction + lazy sweep (commit `52004ff3`).

### 1.5 Asana webhook HMAC verification

- File: `web/app/api/asana/escalation-hook/route.ts:103-117`
- Behaviour: Every Asana POST verifies
  `HMAC-SHA256(rawBody, ASANA_WEBHOOK_SECRET) === X-Hook-Signature`
  with `timingSafeEqual`. Handshake stores the secret in Blobs;
  events without a matching signature get HTTP 401.

## 2. Transport + content

### 2.1 Security headers

Set on every dynamic response by `web/middleware.ts:71-80`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Cross-Origin-Opener-Policy: same-origin`
- API responses also: `Cross-Origin-Resource-Policy: same-origin`

Static assets get the same headers plus
`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
via `netlify.toml:88-122`.

### 2.2 Content Security Policy

- File: `web/middleware.ts:82-97`
- Current: `script-src 'self' 'unsafe-inline'`.
  Documented trade-off — Next.js App Router injects hydration
  scripts that do not carry a nonce; a strict-CSP attempt was
  rolled back (commit `ca4a0a7`). Accepted regulator-defensible
  position pending a Next.js upgrade that supports nonce
  threading through the router.

### 2.3 `poweredByHeader`

- File: `web/next.config.mjs:25`
- `poweredByHeader: false` — framework/version not advertised.

## 3. Secret hygiene

### 3.1 Secrets are env-only

- All sensitive credentials read from `process.env` at runtime.
  Documented in `.env.example`.
- Hardcoded-secret scan in CI:
  `.github/workflows/ci.yml:62-71` — `grep -E "(sk-ant-[A-Z0-9]{32,}|AKIA[A-Z0-9]{16})"`
  fails the build if any committed source matches a known
  Anthropic / AWS-style secret format.

### 3.2 Client-component env exposure scan

- File: `.github/workflows/ci.yml:72-81`
- Fails the build if any `.tsx` under `web/app/` references
  server-only env vars (`ANTHROPIC_API_KEY`, `ADMIN_TOKEN`,
  `AUDIT_CHAIN_SECRET`, `SANCTIONS_CRON_TOKEN`).

### 3.3 LSEG / Equasis / external-vendor passwords

The operator accepts the documented exposure trade-off for vendor
credentials passed via env vars. Stored only in Netlify env, never
echoed in logs or error responses.
See [[feedback_no_external_password_warnings]] in operator memory.

## 4. Audit chain integrity (FDL 10/2025 Art.24)

### 4.1 Append-only, hash-linked

- Files: `web/lib/server/audit-chain.ts` (verifier helpers) +
  `web/app/api/audit/sign/route.ts` (writer) +
  `web/app/api/audit/verify/route.ts` (verifier).
- Invariants:
  - `entry.id = sha256(canonical({action, target, actor, body, at}))`
  - `entry.signature = HMAC-SHA256(previousHash || id || at, AUDIT_CHAIN_SECRET)`
  - `entry.previousHash = prior_entry.id` (genesis = 64 zeros)
  - `entry.sequence = prior_entry.sequence + 1`
- Test coverage: 10 vitest cases at
  `web/lib/server/__tests__/audit-chain.test.ts` proving the
  verifier detects tampered body, tampered actor, broken chain
  link, forged signature, sequence gap, and wrong secret.

### 4.2 Tamper-evidence model

An attacker who modifies any entry must recompute every downstream
signature; without `AUDIT_CHAIN_SECRET` that is computationally
infeasible. The `/api/audit/verify` route surfaces all three fault
classes (`brokenLinks`, `invalidIds`, `invalidSignatures`) plus
`sequenceGaps` and `headConsistent`.

## 5. Data integrity

### 5.1 Feed-integrity guard

- File: `src/ingestion/blobs-store.ts:84` (the production
  `putDataset`).
- Refuses to overwrite a healthy sanctions snapshot with an empty
  parse. Throws `EmptyOverwriteRefusedError` with
  `priorEntityCount`. Persists rejected report to
  `<listId>/latest.rejected.json` for forensic evidence.
- Implements RULE 12 / Mandatory Feed Integrity.

### 5.2 Cron min-interval lock

- File: `src/ingestion/cron-lock.ts`.
- Wired into all five sanctions ingestion crons. Blocks Netlify
  automatic retries and concurrent-cron races.

## 6. Network resilience

### 6.1 GDELT circuit breaker

- File: `web/lib/intelligence/gdelt-cache.ts:60-185`.
- Three-state breaker (`closed` / `open` / `half_open`).
  Trips at 5 consecutive failures, exponential backoff capped at
  10 min. State exposed at `/api/status` `gdeltCache.breaker`.

### 6.2 Per-vendor circuit breakers

- File: `web/lib/server/circuitBreaker.ts`.
- Generic `isBreakerOpen` / `recordSuccess` / `recordFailure` for
  named services. Persisted to Blobs so state survives Lambda
  cold starts.

## 7. Rate limiting

- File: `web/lib/server/rate-limit.ts`.
- Per-API-key fixed-window counters in Blobs. Two windows
  (per-second, per-minute). Tier-defined limits in
  `web/lib/data/tiers.ts`.
- Documented soft-limit caveat: Blobs has no atomic CAS so under
  high concurrency a burst can slip 1-2 calls past the cap. The
  operator opted out of Upstash Redis upgrade
  ([[hawkeye_sterling_no_redis]]); the cap-overshoot is accepted.

## 8. CI security checks

- File: `.github/workflows/ci.yml`.
- `npm audit --audit-level=high` on root and web (fails CI;
  no longer `|| true`).
- Hardcoded-secret regex scan.
- Client-component env-exposure scan.
- Auth-coverage gate (no silent `requireAuth: false`).
- Lethal-trifecta governance check (Control 5.08).
- PII guard (no direct Anthropic client instantiation in routes).

## 9. Known security gaps (not closed on this branch)

- **D13** zod validation at API boundaries — not yet enforced
  uniformly across the ~341-route surface.
- **D15 / D16** uniform error/success contract — partial; not
  audited per-route.
- **D17** API schema-drift audit between similar endpoints.
- **D18** Arabic transliteration accuracy benchmark.
- **D19** sanctions deduplication (cross-list entity collapse).
- **D20** forensic export with chain-of-custody hash.
- CSP nonce mode — documented trade-off, not closed.
