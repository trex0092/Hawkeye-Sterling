# Hawkeye-Sterling — Stability Report

Runtime stability of the platform as of branch
`claude/fix-build-failures` tip (`09a2cb83`, 2026-05-18).

Distinct from RELIABILITY-REPORT.md which focuses on *failure-mode
defences*; this document focuses on *runtime-execution stability*
(crashes, hangs, leaks, build flakiness).

## 1. Build stability

| Surface | State |
|---|---|
| Root `tsc` (compiles `dist/`) | ✅ exit 0 |
| Web `tsc --noEmit -p tsconfig.json` | ✅ exit 0 |
| Web `npm run build` (full `next build`) | ✅ exit 0 |
| ESLint via `next build` | ✅ warnings only, no fatal errors, no stack overflow |
| `next lint` standalone | ✅ exit 0 |
| Netlify deploy build (`netlify.toml`) | ⚠️ depends on `NODE_OPTIONS=--max-old-space-size=8192` set in `f0aa84a9` — required to prevent OOM on current bundle size |

Both `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` were
flipped to `false` on this branch and re-verified. Future TS or
lint regressions will fail the build at Netlify, not land
silently.

## 2. Test-suite stability

Full `npx vitest run` from repo root:

- 86 test files
- 1342 tests (was 1325 at session start; +17 new this branch)
- Duration: ~9 s on the dev box
- Exit code: 0

New test files this branch:
- `src/ingestion/__tests__/feed-integrity.test.ts` (5 cases)
- `web/lib/server/__tests__/ongoing-escalation.test.ts` (7 cases)
- `web/lib/server/__tests__/audit-chain.test.ts` (10 cases)

## 3. Memory stability

Three in-memory Maps were audited for unbounded growth under
public-traffic load (`feedback_no_redis` accepts in-memory
fallbacks — they must be bounded):

| Map | File | Status |
|---|---|---|
| `failureMap` (login brute-force) | `web/app/api/auth/login/route.ts:24` | **Bounded** — 10 000 cap, FIFO evict, lazy sweep (commit `52004ff3`) |
| `_mem` (gdelt cache) | `web/lib/intelligence/gdelt-cache.ts:66` | Bounded — 500-entry FIFO already in place |
| `breakers` (circuitBreaker) | `web/lib/server/circuitBreaker.ts:15` | Bounded by code — keys come from fixed call sites (named services), not user input |
| `_rateCache`/`_breakerCache`/`_rateFallback`/`_breakerFallback` | `web/lib/mcp/shared-state.ts:37-43` | Bounded by code — keys are tool names from `tool-manifest`, not user input |

No remaining unbounded user-controllable Maps in the runtime hot
path.

## 4. Async stability

- Process-level `unhandledRejection` + `uncaughtException` handlers
  installed via `installGlobalAsyncSafetyNet()` at the ingestion
  module load (`src/ingestion/run-all.ts`).
- Every `void logIngestError(...)` rejection is caught by the
  global net and logged as structured JSON
  (`[safe-async] UNHANDLED_REJECTION: ...`).
- Process is **not** killed on `uncaughtException` — Netlify
  Lambdas survive one per invocation; crashing would 5xx a single
  request that may have already completed user-visible work.

## 5. Cold-start stability

- AsyncLocalStorage.snapshot() shim installed for Node.js < 22.3
  (`web/next.config.mjs:91-100` BannerPlugin) — prevents the
  cold-start crash that affected every `next start` page load on
  certain Netlify Node 22 minor versions.
- Build-time `COMMIT_REF` inlined as `HAWKEYE_BUILD_COMMIT_REF`
  (`web/next.config.mjs:11-16`) so runtime SHA lookups return the
  correct value rather than falling through to "dev".
- `outputFileTracingRoot` + `outputFileTracingIncludes` ensure
  compiled `dist/src/brain/**` ships with every serverless
  function (was MODULE_NOT_FOUND 502 on every cold start before
  this configuration).

## 6. Concurrency stability

- Cron min-interval lock (`src/ingestion/cron-lock.ts`) blocks
  same-window retries + concurrent cron races. Documented soft
  caveat: Blobs has no atomic CAS, so two crons firing within the
  same ~50 ms blob round-trip can both "acquire" — the
  feed-integrity guard then covers that worst case.
- Per-key rate-limit fixed-window counters (`web/lib/server/
  rate-limit.ts`) have the same soft caveat; a P-parallel burst
  in the same second can slip 1-2 calls past the cap. Accepted
  per `feedback_no_redis`.

## 7. Sources of historical instability — closed

| Issue | Closed by |
|---|---|
| Auth bypass on 341 routes | `enforce()` `requireAuth: true` default |
| AsyncLocalStorage.snapshot() missing on Node 22 < 22.3 | BannerPlugin shim |
| `dist/` not in serverless bundle (MODULE_NOT_FOUND) | `outputFileTracingRoot` configuration |
| React shipped twice (`useSyncExternalStore` crash) | `outputFileTracingExcludes` for raw `react`/`react-dom` |
| Netlify build OOM | NODE_OPTIONS=8192 |
| TS suppressed errors silently shipping | `ignoreBuildErrors: false` |
| ESLint suppressed warnings silently shipping | `ignoreDuringBuilds: false` |
| Login `failureMap` unbounded memory leak | FIFO eviction + lazy sweep |
| GDELT brownout 60 s+ latency stalls | Circuit breaker |
| `void logIngestError` rejections opaque | Global safety net |
| Cron retries duplicate-firing | min-interval lock |
| Empty parses overwriting healthy sanctions | Feed-integrity guard |

## 8. Sources of instability still open

- **D8** — `requestId` not propagated everywhere. A request that
  crosses multiple routes leaves logs with no shared
  correlation ID.
- **D9** — Mix of `console.warn(...)` and structured logging.
  Operator greps differ per module.
- **D13** — Validation of incoming payloads is per-route hand-
  rolled rather than zod-enforced; malformed JSON can still reach
  business-logic code paths.
- **D17** — Similar endpoints (`/api/quick-screen` vs
  `/api/batch-screen`) have subtly different response shapes.
- **AUDIT_CHAIN_SECRET rotation** — no `keyId`-aware verifier; a
  rotation invalidates prior chain verification until older
  entries are re-signed.

## 9. Verification before claiming "stable" for production

1. Branch merged + deployed (steps in PRODUCTION-READINESS.md §6)
2. Production `NETLIFY_API_TOKEN` confirmed as a full Netlify PAT
3. `netlify/functions/refresh-lists` triggered manually post-deploy
4. `/api/health` → HTTP 200
5. `/api/screening/health` → HTTP 200, all 3 checks healthy
6. `/api/sanctions/status` → all lists `status: "healthy"`
7. `/api/audit/verify` → `ok: true, headConsistent: true`
8. `/api/status` `gdeltCache.breaker.state: "closed"`
9. Manual 4-eyes flow end-to-end (POST + PATCH from second user)
10. Manual STR submission flow end-to-end

Until items 1-10 pass post-deploy, the platform is **build-stable**
but not yet **operationally-stable** in production.
