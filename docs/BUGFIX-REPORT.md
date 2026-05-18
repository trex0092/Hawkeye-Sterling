# Hawkeye-Sterling — Bugfix Report

This document records every bug **observed, diagnosed, and fixed** on
branch `claude/fix-build-failures` (commits `a95019be`..`9d515ae0`).
Each entry has reproducible evidence — no aspirational claims.

## 1. Auth bypass — `enforce()` defaulted `requireAuth: false`

**Status:** Fixed on prior session (`f0aa84a9` ancestor; verified
2026-05-18 at `web/lib/server/enforce.ts:39`).

**Symptom.** 341 compliance routes (`super-brain`, `quick-screen`,
`mcp`, `screening/run`, etc.) silently accepted unauthenticated traffic.

**Root cause.** `enforce(req)` called without an explicit `requireAuth`
argument inherited the default `{ requireAuth: false }`. The fail-open
default was the master root cause behind dozens of audit findings.

**Fix.** Flip default to `{ requireAuth: true }`. One-line change at
`enforce.ts:39`.

**Verification.** Live probe 2026-05-18:
`GET https://hawkeye-sterling.netlify.app/api/integrations/status` →
HTTP 401 "API key required" (was 200 before fix).

---

## 2. Watchlist corpus collapse (6 651 → 65 entries)

**Status:** Root cause is operational, not code. Code-side guard added
(`3fcde0e9`).

**Symptom.** `/api/screening/health` `watchlist_corpus.entries` dropped
from 6 651 to 65 across the audit-v9 merge deploy.

**Root cause.** Netlify Blobs `hawkeye-lists` store is empty in
production. `candidates-loader.ts` falls back to the 65-entry static
seed in `web/lib/data/candidates.ts`. The cause is environment-side:
either `NETLIFY_API_TOKEN` is misconfigured (forcing 401 on Blobs
writes) or the scheduled ingest functions stopped firing. **Not** a
code regression in audit-v9 — `git log a5fb95ea..624f2db7` shows no
changes to `candidates-loader.ts`, `store.ts`, `blobs-store.ts`, or
related env handling.

**Fix.** Operational: see
[INCIDENT-RECOVERY.md §2](INCIDENT-RECOVERY.md). The code-side
prevention against the *next* manifestation (where an adapter
regression parses to zero entities and the writer would overwrite
healthy data) shipped as the feed-integrity guard (item #3 below).

---

## 3. Feed-integrity gap — empty parses could overwrite healthy snapshots

**Status:** Fixed `3fcde0e9` + tests `1a7b47cb`.

**Symptom.** Theoretical: an adapter parser regression returning zero
entities would silently overwrite `<listId>/latest.json` in Blobs.
The screening engine would then match against the seed corpus only.
This is the exact failure mode that produced symptom #2 if a parser
also regressed.

**Root cause.** `BlobsStore.putDataset()` at
`src/ingestion/blobs-store.ts:84-87` performed an unconditional
`setJSON(latest.json, {entities, report})` regardless of
`entities.length` and regardless of the prior snapshot's healthy
state.

**Fix.** `putDataset()` now reads the prior `latest.json` before
writing. If `entities.length === 0` AND prior `entities.length > 0`,
throws `EmptyOverwriteRefusedError` (which carries `listId` and
`priorEntityCount` for forensic logging). The rejected report is
persisted to `<listId>/latest.rejected.json` in the reports store.
`run-all.ts` distinguishes the refusal from a transport failure and
surfaces it as `phase: 'integrity-guard'` in the ingest-error log.
`PutDatasetOptions.allowEmpty` provides an opt-out for operator
resets.

**Verification.** Five vitest cases at
`src/ingestion/__tests__/feed-integrity.test.ts` — all passing.

---

## 4. GDELT brownout latency (60+ s per screening call)

**Status:** Fixed `dbddcd42` + observability `0f74e1f8`.

**Symptom.** When GDELT (`api.gdeltproject.org`) suffered brownouts
(2-10 minute periods of 502s / timeouts), every screening call paid
the 20 s fetch timeout + 3 s retry delay + 20 s retry timeout = ~43 s
of wall-clock latency per upstream call. Super-brain pipelines
making multiple GDELT calls compounded this.

**Root cause.** `gdelt-cache.ts` had TTL cache + stale-Redis fallback
but no circuit breaker — every request paid the full timeout every
time during a brownout.

**Fix.** Three-state breaker (`CLOSED` / `OPEN` / `HALF_OPEN`) on the
live-fetch path. Trips at 5 consecutive failures, short-circuits
upstream calls until cooldown elapses (initial 60 s, doubled each
re-trip, capped at 10 min), single half-open probe on cooldown
elapse. State is per-Lambda (no Redis dependency) for deterministic
behaviour even with `feedback_no_redis` in effect.

**Verification.** Web typecheck clean; production build clean; state
exposed at `/api/status` `gdeltCache.breaker` for monitoring.

---

## 5. Login-failureMap memory leak

**Status:** Fixed `52004ff3`.

**Symptom.** `failureMap` in `web/app/api/auth/login/route.ts:24` was
unbounded. A username-probing attacker could add one entry per
attempt (~80 bytes, 15-min TTL but no auto-eviction) and steadily
grow warm-Lambda memory until OOM.

**Fix.** FIFO eviction once cap (10 000) reached + periodic sweep every
64 inserts removes entries whose window expired and lock elapsed.
V8 Map insertion-order iteration makes the eviction O(1).

---

## 6. `commercialAdapters.ts` TS2769 typecheck failure

**Status:** Fixed `a95019be`.

**Symptom.** `cd web && npx tsc --noEmit -p tsconfig.json` exited 1
with one error:
`lib/intelligence/commercialAdapters.ts(96,15): error TS2769: No
overload matches this call.`

**Root cause.** `process.env["LSEG_WC1_MCP_URL"]` narrows to `string`
after the early-return guard but TypeScript's control-flow narrowing
doesn't propagate into nested closures. Two `fetch(mcpUrl, …)` call
sites inside `discoverScreenTool` and the `lookup` arrow inherited
`string | undefined`, failing the `RequestInfo` overload.

**Fix.** Bind to a typed local `const url: string = mcpUrl` after the
guard and use `url` in both closure call sites. Three-line change.

**Verification.** Typecheck exits 0 after the fix (was 1).

---

## 7. `next.config.mjs` build-error suppression no longer needed

**Status:** Fixed `97b9e41f` (`ignoreBuildErrors`) +
`3cdd5c3b` (`ignoreDuringBuilds`).

**Symptom.** Both flags were `true`, originally to suppress TS7026/2741
JSX implicit-any errors and an ESLint `react-hooks/rules-of-hooks`
stack overflow on `web/app/mlro-advisor/page.tsx:1398`. Any new
type or lint regression on any route would land silently in
production.

**Re-probe 2026-05-18.** Bare `tsc --noEmit` exits 0. `next lint`
completes with warnings only, no stack overflow. The original
justifications no longer hold.

**Fix.** Both flags flipped to `false`. Verified by full `next build`
exit 0 with both flags off.

---

## 8. RULE 9/10 contract violations

**Status:** Partial fix `fd12d4ad`. Full audit still pending (see
PRODUCTION-READINESS.md item D15+D16).

**Symptom.**
- `/api/health` always returned HTTP 200 even when degraded (RULE 10).
- `/api/auth/token` returned HTTP 429 on quota_exceeded with no
  `Retry-After` header (RULE 9).

**Fix.**
- `/api/health` now returns 207 when degraded.
- `/api/auth/token` 429 now carries `Retry-After: 86400` +
  `retryAfterSec` field.

The full per-route RULE 9/10 schema audit across the ~341-route surface
is **not** complete on this branch.

---

## Items deferred (Large; not closed on this branch)

Each is its own focused work cycle. Listed in
[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).

- D5  goAML XSD validation
- D6  batch screening idempotency
- D8  requestId propagation
- D9  structured JSON logging
- D13 zod validation at API boundaries
- D15+D16 full uniform contract audit
- D17 API schema-drift audit
- D18 Arabic transliteration accuracy benchmark
- D19 sanctions deduplication (cross-list collapse + provenance)
- D20 forensic export with chain-of-custody
