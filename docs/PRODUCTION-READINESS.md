# Hawkeye-Sterling — Production Readiness

Honest readiness assessment of the platform as of branch
`claude/fix-build-failures` (last commit `9d515ae0` on 2026-05-18).

This document is **not** a marketing pitch. Every claim is
evidence-backed; every known gap is listed openly.

## Headline scores

| Domain | Score | Evidence |
|---|---|---|
| Code build integrity | 95 % | tsc + ESLint hard-fail flags removed; full `next build` clean |
| Auth & access control | 95 % | `enforce()` fail-closed default + CI auth-coverage gate; HMAC sessions; brute-force lockout; HMAC webhook signatures |
| Audit chain | 90 % | hash-linked + HMAC tamper-evidence, helper extracted, 10 unit tests |
| Sanctions ingestion | 80 % | feed-integrity guard prevents empty-overwrite; per-list health on `/api/sanctions/status`; **but prod Blobs is currently empty** |
| Resilience | 85 % | GDELT circuit breaker; cron lock; global async safety net; stale-Redis fallback |
| Observability | 70 % | `/api/status` rich; structured logging not yet uniform |
| Forensic exportability | 60 % | audit chain exportable + verifiable; case-bundle download not implemented |
| Regulator defensibility | 80 % | FDL Art.24 audit chain + RULE 12 integrity guard; per-list freshness on `/api/sanctions/status` |
| Test coverage | High | 1342 vitest passing (86 files) |

## What is verified production-ready on this branch

### Build + deploy

- ✅ Root tsc clean (`npm run build` exit 0)
- ✅ Web tsc clean (`cd web && npx tsc --noEmit` exit 0)
- ✅ Full `next build` with `ignoreBuildErrors: false` AND
  `ignoreDuringBuilds: false` exits 0
- ✅ NODE_OPTIONS=--max-old-space-size=8192 prevents Netlify build
  OOM on the current bundle size
- ✅ All 1342 vitest cases passing

### Security controls (file:line cited)

- ✅ `web/lib/server/enforce.ts:39` — `requireAuth: true` default
- ✅ `web/app/api/auth/login/route.ts:9-95` — brute-force lockout,
  bounded failureMap
- ✅ `web/app/api/asana/escalation-hook/route.ts:103-117` — HMAC
  webhook verification
- ✅ `web/middleware.ts:71-80` — security headers on every dynamic
  response
- ✅ `netlify.toml:88-122` — security headers on static assets
- ✅ `.github/workflows/ci.yml:82-97` — auth-coverage CI gate
- ✅ `web/app/api/four-eyes/route.ts:268-270` — approver ≠ initiator
  enforced server-side (FATF four-eyes principle)

### Data integrity controls

- ✅ `src/ingestion/blobs-store.ts:84` — feed-integrity guard
- ✅ `src/ingestion/cron-lock.ts` — min-interval lock on all 5
  sanctions crons
- ✅ `web/lib/intelligence/gdelt-cache.ts:60-185` — GDELT circuit
  breaker
- ✅ `web/lib/server/audit-chain.ts` — verifiable hash-linked +
  HMAC-signed audit chain (FDL Art.24)

### Health endpoints

- ✅ `/api/health` — 200/207 HTTP semantics
- ✅ `/api/screening/health` — 200/207/503 HTTP semantics
- ✅ `/api/sanctions/status` — per-list `healthy / stale / missing /
  unconfigured`
- ✅ `/api/status` — full integration health + GDELT cache + GDELT
  breaker state

## What is NOT production-ready on this branch

### Operational (your action)

- 🔴 **Production sanctions corpus is empty.** Live re-probe
  2026-05-18: `/api/screening/health` HTTP 207 with
  `watchlist_corpus: 65 entries` (= seed only). Recovery requires
  verifying `NETLIFY_API_TOKEN` is a full Netlify PAT in prod env
  and triggering `netlify/functions/refresh-lists`. See
  [INCIDENT-RECOVERY.md §2](INCIDENT-RECOVERY.md).
- 🔴 **This branch is not merged to `main`.** gh CLI not authed on
  the dev machine; PR not opened. 13 commits sit on
  `claude/fix-build-failures` only.

### Code work not closed on this branch

Each is its own focused work cycle:

- **D5** STR / SAR generation against current goAML XSD — needs
  XSD validation harness + schema-drift detection.
- **D6** Batch screening idempotency-key support — currently a retry
  CAN create duplicate Asana tasks if it arrives before the first
  request's write completes.
- **D8** `requestId` propagation across every route + log line —
  partial coverage today (some routes generate them, not all).
- **D9** Structured JSON logging uniformly — many routes still use
  `console.warn(...)` with positional string formatting.
- **D13** zod validation at every public-API boundary — currently
  ad-hoc per route.
- **D15 + D16** Uniform `{ok, error, hint, requestId, generatedAt}`
  error contract + matching success contract — partial; ~341
  routes not audited.
- **D17** API schema-drift audit between similar endpoints.
- **D18** Arabic transliteration accuracy benchmark.
- **D19** Sanctions deduplication (cross-list collapse +
  provenance) — listed entities can appear once per source list
  today; UN + OFAC + EU listings of the same person are not
  collapsed.
- **D20** Forensic case-bundle export with chain-of-custody hash.

### Data ownership (compliance officer)

- 🟡 `data/eocn_seed.json` and `data/uae_ltl_seed.json` are `[]`
  (4 bytes each). Real UAE EOCN + LTL data needs to be sourced
  and committed (or migrated to env-fed paths).

## Regulator-defensible posture (what we CAN claim today)

- Fail-closed auth on every paid route; CI guard prevents silent
  drift.
- Tamper-evident audit chain with verifier endpoint and unit
  tests proving the verifier catches all three fault classes.
- Refuse-empty-overwrite guard on sanctions writes — empty
  parses cannot wipe healthy snapshots.
- Cron lock blocks Netlify automatic retries from duplicate-firing
  webhooks.
- GDELT brownouts collapse to ~0 ms (was ~60 s) once breaker trips.
- Per-list sanctions freshness exposed at `/api/sanctions/status`
  with `healthy / stale / missing / unconfigured` status.
- Login brute-force lockout with bounded memory.
- Asana webhook HMAC-verified with timing-safe-equal.

## What we should NOT claim today

- We do **NOT** have uniform structured JSON logging.
- We do **NOT** have full requestId propagation across all routes.
- We do **NOT** have zod validation at every API boundary.
- We do **NOT** have an XSD-validated goAML XML generator.
- We do **NOT** have cross-list sanctions deduplication.
- We do **NOT** have a chain-of-custody-signed case-bundle export.
- We do **NOT** have an Arabic-transliteration accuracy benchmark
  with a published recall rate.

## Pre-deploy checklist

Before merging this branch + deploying:

1. ☐ `gh auth login` on the operator machine
2. ☐ `git push -u origin claude/fix-build-failures`
3. ☐ Open PR `claude/fix-build-failures` → `main`
4. ☐ PR review (security headers, audit chain, integrity guard)
5. ☐ Merge to main
6. ☐ Verify Netlify build picks up the merge
7. ☐ Confirm `NETLIFY_API_TOKEN` is a full Netlify PAT in prod env
8. ☐ Trigger `netlify/functions/refresh-lists` from Netlify dashboard
9. ☐ Re-probe `/api/screening/health` — must show
   `sanctions_lists: healthy` and `watchlist_corpus` thousands
10. ☐ Re-probe `/api/health` — must show 200 (not 207)

Until those 10 steps land, this branch is **ready for review**,
not ready for production traffic.
