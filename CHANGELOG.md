# Hawkeye Sterling — Changelog

## [v9-audit] — 2026-05-17

Production-readiness uplift covering 18 audit phases. All changes on branch
`claude/hawkeye-sterling-audit-v9-AqP7h`.

### Phase 9 — Weighted risk scoring
- Added `totalWeightedScore` (0–100 weighted composite across hit lists) to `QuickScreenResult`
- Added `confidenceScore` (0–100 mean discriminator confidence) to `QuickScreenResult`
- Added `listBreakdown` (per-list hits/topScore/weight summary) to `QuickScreenResult`
- Defined regulatory weights per list: EOCN/UN=40, OFAC SDN=38, OFAC CONS=30, EU FSF=25, UK OFSI=22, CA/CH/AU=20, JP=15
- Updated `web/lib/api/quickScreen.types.ts` to match

### Phase 10 — Name disambiguation
- Added `disambiguationConfidence` (0–100) to `QuickScreenHit` — derived from DOB (+40 exact, +20 year, −40 conflict), nationality (+20), phonetics (+10)
- Added `recommendation` (`match` | `review` | `dismiss`) to `QuickScreenHit`
- Both fields present on all hits above threshold; operators can filter `recommendation=dismiss` to suppress common-name false positives

### Phase 11 — Regulatory feed metadata
- Added `filterMetadata` block to regulatory-feed response: `totalBeforeFilter`, `totalAfterFilter`, `filtersApplied`
- Added `lowConfidence` array: GDELT/GNews items with no snippet flagged so operators know headline-only results require manual verification

### Phase 13 — API contract standardisation
- Added `httpError()`, `methodNotAllowed()`, `optionsResponse()` helpers to `web/lib/server/api-error.ts`
- Helpers return consistent `{ ok: false, error, code }` shape with correct HTTP status and `Allow` header

### Phase 14 — Observability
- New `GET /api/metrics` — exposes uptime, Redis availability, and GDELT cache stats (admin auth required)
- `warm-pool.mts` (4-min synthetic keep-alive) already present and covering the 5-min requirement

### Phase 15 — Provenance
- `commitSha` in `/api/status` now returns full 40-char SHA instead of `.slice(0,7)` truncation
- `X-Request-ID` added to all API responses via middleware — echoes caller-supplied header or generates fresh 24-char hex per request

### Phase 16 — Ongoing monitoring audit trail
- `writeAuditChainEntry({ event: "new_hits_alert", actor: "cron_internal", ... })` fires in `ongoing/run/route.ts` whenever new sanctions hits are found
- Entry includes subjectId, severity, topScore, scoreDelta, newHitCount, and top-10 hit fingerprints
- Creates immutable regulatory audit trail for regulator replay of monitoring activity

### Phase 17 — LSEG World-Check status
- New `GET /api/admin/lseg-status` — reports credential presence (`apiKeyConfigured`, `apiSecretConfigured`, `appKeyConfigured`, `fullyConfigured`) and CFS index state
- Key values are never returned; endpoint is admin-auth-gated
- Reports CFS index entity count and build time from `hawkeye-lseg-pep-index` blob store

### Phase 6 — Redis warning
- `/api/status` now includes a `redisWarning` in the `warnings` array when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are not set, explaining that GDELT cache will not persist across cold starts

---

## [14e030c] — 2026-05-17

### Asana GID update (Phase 5)
- Updated `HARDCODED` GIDs in `asanaConfig.ts`: workspace `1213645083721318`, all project GIDs → `1214148630166524`
- Added `maybeWarnMissingGids()` — fires once per process if `ASANA_TOKEN`, `ASANA_WORKSPACE_GID`, or `ASANA_PROJECT_GID` are absent

### Four-eyes GET fix (Phase 7)
- `handleGet` defaults to `wantStatus = "pending"` (was undefined/all)
- Items pending > 24h now include `overdue: true, overdueHours: N`
- Response shape: `{ ok: true, pending: [...], total: N, items: [...] }`

### Regulatory feed (Phase 11 pre-work)
- Archive cutoff: 180 days (was 30)
- Source-domain whitelist applied to GDELT/GNews items; scrapers/FATF/OFAC/UN bypass
- Static items (`static-*`, `uae-*`) exempt from freshness pruning

### Enrichment audit trail (Phase 8)
- `completeEnrichmentJob()` writes `enrichment.completed` audit chain entry with `actor: "system"`

### Zero-entity guards (Phases 2–4)
- `eu-fsf.ts`, `ch-seco.ts`, `ca-osfi.ts`, `au-dfat.ts` — all throw (instead of returning empty) if 0 entities parsed
- Error messages include XML/CSV length, source URL, and diagnostic hints

---

## [0f51438] — 2026-05-17

### Delta timestamp parsing fix (designation-alert-check)
- `Date.parse()` was always returning `NaN` on hyphenated timestamps (`2026-05-17T10-30-00-000Z`)
- Fixed with regex that restores valid ISO 8601 before parsing
- Bug caused MLRO bell alerts to never fire on new designation deltas
