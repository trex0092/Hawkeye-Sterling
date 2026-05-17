# Hawkeye Sterling — API Reference

**Platform:** UAE-regulated AML/CFT/CPF compliance system  
**Stack:** Next.js 15 / Netlify Functions (Node.js runtime)  
**Base URL:** `https://hawkeye-sterling.netlify.app`  
**Specification revision:** 2026-05-17  

---

## Authentication

All endpoints require a bearer token in the `Authorization` header, except `GET /api/health` which is public. Two token classes are recognised:

| Class | Header value | Access level |
|---|---|---|
| **Admin token** | `Bearer <ADMIN_TOKEN>` | Full platform access; rate-limited at enterprise tier |
| **Operator API key** | `Bearer <api-key>` | Scoped to the key's tier and tenant |
| **ONGOING_RUN_TOKEN** | `Bearer <ONGOING_RUN_TOKEN>` | Dedicated token for `/api/ongoing/run` only |
| **Regulator JWT** | `Bearer <jwt>` | Read-only; issued by `/api/admin/issue-regulator-token` |

The `enforce()` middleware accepts both Admin and API-key paths. The `withGuard()` wrapper is an alias used by many routes. Some routes also accept `x-api-key` as a header alternative to `Authorization`.

Unauthenticated requests to `requireAuth: true` routes return `401`. Insufficient role returns `403`.

---

## Common Response Fields

All JSON responses include `ok: boolean`. Errors include `error: string` and optionally `detail` or `hint`. All timestamps are ISO 8601 UTC.

---

## 1. Health & Status

### `GET /api/health`

Liveness and mandatory-list health probe. No authentication required. Authenticated callers additionally receive `buildId` and `commitRef` fields.

**Mandatory lists checked** (stale threshold: 36 h): `uae_eocn`, `uae_ltl`, `un_consolidated`, `ofac_sdn`

**HTTP status codes:**

| Code | Condition |
|---|---|
| `200` | All mandatory lists healthy AND brain operational |
| `207` | 1–2 mandatory lists down (degraded) |
| `503` | 3+ mandatory lists down OR brain module missing |

**Response body:**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` when HTTP status < 500 |
| `status` | `"operational" \| "degraded" \| "down"` | Overall platform status |
| `mandatoryListsHealthy` | boolean | `true` when all four mandatory lists pass |
| `sanctionsDown` | number | Count of mandatory lists currently down |
| `brain.ok` | boolean | Brain module reachable and functional |
| `ts` | string | ISO timestamp of response |
| `runtime` | `"nodejs"` | Lambda runtime identifier |
| `buildId` | string | (authenticated only) Netlify build ID |
| `commitRef` | string | (authenticated only) 7-char git SHA |

**Error codes:** None (shape is constant regardless of HTTP status).

---

### `GET /api/status`

Full platform status. Requires authentication (`enforce()`). Admin callers (ADMIN_TOKEN or enterprise-tier key) receive extended fields including env-var names, brain integrity hashes, and build SHAs. Non-admin callers see aggregate counts only.

**Response body (key fields):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | Endpoint operational (not the same as all-green) |
| `status` | `"operational" \| "degraded" \| "down"` | Derived from internal checks only |
| `degraded` | boolean | `true` when status ≠ operational |
| `servicesUp` | string[] | Names of operational services |
| `servicesDown` | `{name, status, note}[]` | Non-operational services |
| `checks` | Check[] | Internal service check results (screening, storage, etc.) |
| `externalChecks` | Check[] | External dependency checks (Asana, Google News, GDELT) |
| `sanctions` | SanctionsFreshness | Per-list age and entity count |
| `listsFreshness` | object | Map of listId → `{lastRefreshed, ageHours, entityCount, status}` |
| `cognitiveGrade` | `{grade, score, breakdown}` | Brain self-assessment (A+/A/B/C/F) |
| `brainNarrative` | string | Plain-English MLRO-style system assessment |
| `threatSurface` | `{clear, impaired[]}` | Compliance functions affected by degraded services |
| `configHealth` | object | Env-var presence summary (admin: names; non-admin: counts only) |
| `feedVersions` | object | Brain version, adverse-media category/keyword counts, PEP corpus size |
| `warnings` | string[] | (optional) Operational warnings: stale sanctions, PEP corpus too small, etc. |
| `sla.rolling` | `{window30d, window90d, windowYtd}` | Rolling SLA percentages |
| `uptimeSec` | number | Seconds since Lambda cold start |
| `errorHeatmap` | object | Request/error counts in 5 m, 1 h, 24 h windows |
| `gdeltCache` | object | GDELT adverse-media cache stats, `redisConfigured` flag |

**UAE seed warnings:** `warnings[]` includes `UAE_EOCN_SEED_PATH` and `UAE_LTL_SEED_PATH` notices when those env vars are unset.

**Redis availability:** Surfaced via `gdeltCache.redisConfigured` and a warning in `warnings[]` when unset.

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing or invalid bearer token |
| `503` | Top-level unhandled exception (also sets `ok: false`, `degraded: true`) |

---

### `GET /api/metrics`

Lightweight in-process metrics. Admin-only (`enforce()` — returns 401 for non-admin callers).

Metrics are per-Lambda-instance and reset on cold start.

**Response body:**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | Always `true` on success |
| `generatedAt` | string | ISO timestamp |
| `uptime.startedAt` | string | Lambda instance start time (ISO) |
| `uptime.uptimeMs` | number | Milliseconds since instance start |
| `uptime.uptimeHuman` | string | Human-readable uptime (e.g. `"2h 14m"`) |
| `cache.gdelt` | object | GDELT cache statistics |
| `infrastructure.redisConfigured` | boolean | Whether Upstash Redis is configured |
| `infrastructure.redisNote` | string | Operational note on Redis availability |

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing or invalid admin token |

---

## 2. Screening

### `POST /api/quick-screen`

Single-subject sanctions and adverse-media screening. Authentication required (`requireAuth: true`). Results are never cached (`Cache-Control: no-store`). Writes a tamper-evident audit chain entry on every call.

Subjects matching the tenant's whitelist return immediately with a `whitelisted` block. Medium/high/critical severity subjects are automatically enrolled in pKYC monitoring and a case record is auto-opened.

The route enforces a 2.8 s hard deadline: if enrichment adapters do not resolve within budget, a fast-path result is returned immediately with `enrichmentPending: true` and an `enrichJobId` for polling at `GET /api/quick-screen/enrich/<jobId>`.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `subject.name` | string | Yes | Max 512 characters |
| `subject.aliases` | string[] | No | Max 50 entries |
| `subject.entityType` | `"individual" \| "organisation" \| "vessel" \| "aircraft" \| "other"` | No | |
| `subject.dateOfBirth` | string | No | ISO date or `dob` alias accepted |
| `subject.nationality` | string | No | ISO 3166-1 alpha-2/3 |
| `subject.jurisdiction` | string | No | Country code |
| `options.maxHits` | number | No | Override maximum hit count |
| `evidenceUrls` | string[] | No | Max 20 URLs to ingest as adverse-media evidence |
| `enrichmentHints` | object | No | `{email?, phone?, ip?, wallet?, url?}` for public-API enrichment |
| `candidates` | object[] | No | Caller-supplied candidates; if absent, live watchlist corpus is used |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `subject` | object | Sanitised subject as processed |
| `hits` | Hit[] | Matched candidates (deduplicated; highest score per entity retained) |
| `topScore` | number | 0–100 match score |
| `severity` | `"clear" \| "low" \| "medium" \| "high" \| "critical"` | Verdict |
| `listsChecked` | number | Number of lists consulted |
| `durationMs` | number | Screening engine duration |
| `generatedAt` | string | ISO timestamp |
| `reasoning` | object | Multi-source consensus, contradiction, coverage gap, and audit rationale |
| `riskLevel` | `"standard" \| "medium" \| "high" \| "very_high"` | FATF/UAE country-risk tier for subject's nationality/jurisdiction |
| `listHealthAtScreeningTime` | object | Per-list entity count, age, and status at time of screening |
| `screeningWarnings` | string[] | (optional) Warnings about missing, empty, or stale lists |
| `_provenance` | object | Machine-readable list health summary: `missingLists`, `staleListIds`, `degradedListIds`, `newsArticleCount` |
| `openSanctionsAugmentation` | object[] | (optional) Live OpenSanctions hits |
| `enrichmentPending` | boolean | (optional) `true` when adapters timed out |
| `enrichJobId` | string | (optional) Job ID for polling enriched result |
| `commonNameExpansion` | boolean | Whether common-name hit-cap expansion fired |
| `fraudShield` | object | (optional) FraudShield enrichment signal |
| `whitelisted` | object | (optional) Present when subject matched tenant whitelist; includes `entryId`, `approvedBy`, `approverRole`, `approvedAt`, `reason` |

**Error codes:**

| Code | Body | Condition |
|---|---|---|
| `400` | `{ok:false, error}` | Missing `subject.name`, name too long, too many aliases, too many `evidenceUrls` |
| `401` | — | Missing/invalid token |
| `503` | `{ok:false, errorCode:"LISTS_MISSING", missingLists:[]}` | Watchlist corpus empty or both critical lists (`ofac_sdn`, `un_consolidated`) absent |
| `500` | `{ok:false, errorCode:"HANDLER_EXCEPTION"}` | Unhandled internal error |

---

### `POST /api/screen/batch`

Batch screening for up to 20 subjects per request. Accepts both Admin and API-key tokens (`enforce()`). Duplicate subject names (case-insensitive) within a batch are rejected.

For larger batches use `/api/batch-screen`.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `subjects` | SubjectInput[] | Yes | 1–20 entries |
| `subjects[].name` | string | Yes | |
| `subjects[].aliases` | string[] | No | |
| `subjects[].entityType` | string | No | `individual \| organisation \| vessel \| aircraft \| other` |
| `subjects[].jurisdiction` | string | No | |
| `subjects[].dob` | string | No | ISO date |
| `options.threshold` | number | No | 0–100, default 70 |
| `options.includeAdverseMedia` | boolean | No | Default `false` |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `requestId` | string | Unique batch ID (`sbatch_<ts>_<rand>`) |
| `screenedAt` | string | ISO timestamp |
| `count` | number | Total subjects screened |
| `elevatedCount` | number | Subjects with topScore ≥ 70 |
| `results` | ScreenResult[] | One entry per subject |
| `results[].name` | string | |
| `results[].topScore` | number | 0–100 |
| `results[].band` | `"critical" \| "high" \| "medium" \| "low" \| "clear"` | Score band |
| `results[].hitCount` | number | Hits at or above threshold |
| `results[].recommendation` | `"match" \| "review" \| "dismiss"` | |
| `results[].lists` | string[] | List IDs with hits |
| `results[].topHitName` | string | (optional) Name of highest-scoring candidate |

**Error codes:**

| Code | Body | Condition |
|---|---|---|
| `400` | `{ok:false, error:"batch_too_large", limit:20}` | More than 20 subjects |
| `400` | `{ok:false, error:"duplicate_subjects", duplicates:[]}` | Duplicate names in batch |
| `400` | `{ok:false, error:"invalid_body"}` | Malformed JSON or missing `subjects` |
| `401` | — | Missing/invalid token |
| `503` | `{ok:false, error:"screening_corpus_unavailable"}` | Watchlist corpus unavailable |
| `503` | `{ok:false, error:"screening_engine_unavailable"}` | Brain module not built |

---

### `POST /api/batch-screen`

Large batch screening — up to 10,000 rows. Accepts both Admin and API-key tokens (`enforce()`). Batches over 500 rows use a fast path that skips external cross-validation (Watchman, Marble, Jube, Yente). On CRITICAL or HIGH hits, an Asana task is created automatically.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `rows` | BatchRow[] | Yes | 1–10,000 entries |
| `rows[].name` | string | Yes | |
| `rows[].aliases` | string[] | No | |
| `rows[].entityType` | string | No | |
| `rows[].jurisdiction` | string | No | |
| `rows[].dob` | string | No | |
| `rows[].gender` | string | No | |
| `rows[].idNumber` | string | No | |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `summary` | object | `{total, critical, high, medium, low, clear, errors, totalDurationMs}` |
| `results` | RowResult[] | One entry per row |
| `results[].topScore` | number | Keyword-adjusted composite score (0–100) |
| `results[].rawScore` | number | Unadjusted sanctions-match score |
| `results[].severity` | string | Score band |
| `results[].hitCount` | number | |
| `results[].listCoverage` | string[] | List IDs with hits |
| `results[].keywordGroups` | string[] | Adverse-media keyword groups matched |
| `results[].esgCategories` | string[] | ESG risk categories matched |
| `results[].checkpoints` | string[] | KYC checkpoint flags (e.g. `sanctions-hit`, `pep-flag`, `missing-dob`) |
| `results[].crossRef` | object | (optional, ≤500 rows) `{watchmanHits, marbleStatus, jubeRisk, yenteScore, yenteDatasets}` |
| `latencyMs` | number | Total processing time |
| `asanaTaskUrl` | string | (optional) Asana task URL when elevated hits were filed |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | `rows` not an array, empty, or exceeds 10,000-row limit |
| `401` | Missing/invalid token |

---

### `GET /api/screening-history`

Retrieve paginated screening history for a subject. Uses `withGuard` (Admin or API-key). History is stored per-subject, newest 50 entries retained.

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `subjectId` | string | Yes | Alphanumeric/`._-:` max 96 chars |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `count` | number | Successfully loaded entries |
| `keysFound` | number | Total blob keys found (may exceed `count` on storage errors) |
| `readFailures` | number | (optional) Number of entries that could not be loaded |
| `degraded` | boolean | (optional) `true` when `readFailures > 0` |
| `entries` | ScreeningHistoryEntry[] | Sorted newest-first |
| `entries[].at` | string | ISO timestamp |
| `entries[].topScore` | number | |
| `entries[].severity` | string | |
| `entries[].lists` | string[] | |
| `entries[].hits` | string[] | |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | Missing or invalid `subjectId` |
| `401` | Missing/invalid token |

---

## 3. Ongoing Monitoring

### `GET /api/ongoing`

List all subjects enrolled in ongoing monitoring for the authenticated tenant. Uses `withGuard`.

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `count` | number | Number of enrolled subjects |
| `subjects` | EnrolledSubject[] | Array of enrolled subjects |
| `subjects[].id` | string | Subject identifier |
| `subjects[].name` | string | |
| `subjects[].aliases` | string[] | (optional) |
| `subjects[].entityType` | string | (optional) |
| `subjects[].jurisdiction` | string | (optional) |
| `subjects[].group` | string | (optional) |
| `subjects[].caseId` | string | (optional) |
| `subjects[].enrolledAt` | string | ISO timestamp |

---

### `POST /api/ongoing`

Enroll a subject in ongoing monitoring. Uses `withGuard`. Sets a default `thrice_daily` schedule (08:30/15:00/17:30 Dubai time = 04:30/11:00/13:30 UTC).

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Alphanumeric/`._-:` max 128 chars |
| `name` | string | Yes | |
| `aliases` | string[] | No | |
| `entityType` | string | No | `individual \| organisation \| vessel \| aircraft \| other` |
| `jurisdiction` | string | No | |
| `group` | string | No | Grouping label |
| `caseId` | string | No | Associated case ID |
| `cadence` | string | No | `hourly \| thrice_daily \| daily \| weekly \| monthly`; default `thrice_daily` |

**Response body (201/200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `subject` | EnrolledSubject | The enrolled subject record |
| `cadence` | string | Effective monitoring cadence |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | Missing `id` or `name`; `id` fails character/length validation |
| `401` | Missing/invalid token |

---

### `DELETE /api/ongoing?id=<id>`

Unenroll a subject from ongoing monitoring. Uses `withGuard`. Only the enrolling tenant may delete. Also removes the associated schedule entry.

**Query parameters:**

| Parameter | Type | Required |
|---|---|---|
| `id` | string | Yes |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | Missing or invalid `id` |
| `401` | Missing/invalid token |
| `404` | Subject not found or not owned by this tenant |

---

### `POST /api/ongoing/run`

Trigger a monitoring run across all enrolled subjects. Protected by `ONGOING_RUN_TOKEN` only (not `ADMIN_TOKEN`). Called by Netlify scheduled functions at 04:30/11:00/13:30 UTC. Compares each subject against the live watchlist corpus, detects new hits and score escalations (delta ≥ 15 points), fires webhooks, and creates Asana tasks.

**Auth:** `Authorization: Bearer <ONGOING_RUN_TOKEN>` only.

**Request body:** Empty.

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `runAt` | string | ISO timestamp of run |
| `total` | number | Total enrolled subjects |
| `rescreened` | number | Subjects actually screened this tick |
| `withNewHits` | number | Subjects with new sanctions hits vs previous run |
| `escalations` | number | Subjects with score delta ≥ 15 points |
| `results` | array | Per-subject results including `subjectId`, `topScore`, `rawScore`, `severity`, `scoreDelta`, `escalated`, `newHits[]`, `asanaTaskUrl?`, `newsAlertTaskUrl?`, `adverseMediaRiskTier?`, `sarRecommended?` |

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Invalid or missing `ONGOING_RUN_TOKEN` |
| `503` | `ONGOING_RUN_TOKEN` env var not configured |

---

## 4. Sanctions Management

### `GET /api/sanctions/status`

Per-list freshness, entity counts, and health for all 22 sanctions list adapters (core + LSEG supplement). Requires authentication (`enforce()`). Accepts optional `?staleHours=` override (default 36).

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `staleHours` | number | `36` | Age threshold in hours above which a list is considered stale |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` when at least one list is healthy |
| `degraded` | boolean | `true` when any list is missing, stale, or degraded |
| `warnings` | string[] | Human-readable issue descriptions |
| `generatedAt` | string | ISO timestamp |
| `staleThresholdHours` | number | Effective stale threshold |
| `summary` | `{healthy, stale, missing, unconfigured, degraded}` | Aggregate counts |
| `lists` | ListReport[] | Per-list detail (see below) |
| `dataFreshness` | object | Map of listId → `{lastRefreshed, ageHours, status}` |
| `env` | object | Presence booleans for operational env vars (no values) |
| `hint` | string | Human-readable operational guidance |
| `latencyMs` | number | |

**ListReport fields:**

| Field | Type | Description |
|---|---|---|
| `listId` | string | e.g. `ofac_sdn`, `un_consolidated`, `uae_eocn` |
| `displayName` | string | Human-readable list name |
| `configured` | boolean | Whether adapter is configured |
| `configEnvVar` | string \| null | Env var that enables the adapter, or `null` for URL-hardcoded adapters |
| `present` | boolean | Blob exists in store |
| `entityCount` | number \| null | |
| `lastModified` | string \| null | ISO timestamp of last fetch |
| `ageHours` | number \| null | |
| `status` | `"healthy" \| "stale" \| "missing" \| "unconfigured" \| "degraded"` | |

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing/invalid token |

---

### `GET /api/sanctions/last-errors`

Recent adapter failures from the ingestion pipeline. Requires authentication (`enforce()`). Returns up to 100 entries by default.

**Query parameters:**

| Parameter | Type | Default | Max |
|---|---|---|---|
| `limit` | number | `20` | `100` |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `generatedAt` | string | ISO timestamp |
| `total` | number | Count of returned entries |
| `entries` | IngestErrorEntry[] | Most-recent first |
| `entries[].at` | string | ISO timestamp |
| `entries[].adapterId` | string | e.g. `ofac_sdn` |
| `entries[].phase` | `"fetch" \| "parse" \| "write" \| "verify"` | Pipeline stage |
| `entries[].message` | string | Error message |
| `entries[].httpStatus` | number | (optional) Upstream HTTP status |
| `byAdapter` | object | Entries grouped by `adapterId` |

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing/invalid token |
| `503` | Ingestion error log module unavailable (dist/ not built) |

---

### `POST /api/admin/refresh-sanctions`

Force a full re-ingest of all sanctions lists followed by in-process candidate cache invalidation. Admin-only (`withGuard`). Runs `runIngestionAll` (up to 60 s).

**Request body:** Empty.

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `triggeredAt` | string | ISO timestamp |
| `message` | string | Confirmation message |
| `hint` | string | `"Check /api/sanctions/status in 60s"` |
| `results` | unknown | Per-adapter ingestion results from `runIngestionAll` |

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing/invalid admin token |
| `500` | Ingestion runner unavailable or `runIngestionAll` threw |

---

### `POST /api/sanctions/refresh`

Invalidate the in-process candidate cache. Admin-only (`withGuard`). Lightweight — does not re-fetch upstream lists. Use `/api/admin/refresh-sanctions` for a full re-ingest.

**Request body:** Empty.

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | `true` | |
| `cacheInvalidated` | `true` | |
| `scheduledCron` | `"0 3 * * *"` | Daily refresh schedule (03:00 UTC) |
| `lastRunBlobKey` | string | Blob key template for report data |
| `message` | string | Operational guidance |

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing/invalid admin token |

---

## 5. Cases

### `GET /api/cases`

List case records for the authenticated tenant. Requires `enforce()`. Supports filtering and pagination.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string | `"all"` | Filter by status (e.g. `active`, `closed`) |
| `includeArchived` | boolean | `true` | When `false`, excludes `status=closed` |
| `category` | string | — | Filter by `badge` or evidence category |
| `sourceType` | string | — | Filter by `badge` field |
| `limit` | number | `500` | Max 500 per page |
| `offset` | number | `0` | Pagination offset |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `tenant` | string | Resolved tenant identifier |
| `cases` | CaseRecord[] | Paginated case records |
| `totalCount` | number | Total matching cases before pagination |
| `limit` | number | |
| `offset` | number | |

---

### `POST /api/cases`

Create or merge case records (last-write-wins on `lastActivity`). Requires `enforce()`.

**Request body:**

| Field | Type | Required |
|---|---|---|
| `cases` | CaseRecord[] | Yes |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `tenant` | string | |
| `cases` | CaseRecord[] | Merged case register |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | Missing `cases` array |
| `401` | Missing/invalid token |

---

### `PUT /api/cases`

Replace the entire case register for the tenant. Requires `enforce()`. Use with care — this is a destructive overwrite.

**Request body:**

| Field | Type | Required |
|---|---|---|
| `cases` | CaseRecord[] | Yes |

**Response body (200):** Same as `POST /api/cases`.

---

### `GET /api/cases/[id]`

Get a single case record plus a canonical investigation timeline. Requires `enforce()`.

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `tenant` | string | |
| `case` | CaseRecord | Full case record |
| `investigationTimeline` | TimelineEvent[] | Brain-canonical timeline (phase, actor, sourceKind, sourceId) |

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing/invalid token |
| `404` | Case not found for this tenant |

---

### `POST /api/cases/[id]/disposition`

Record the MLRO's disposition outcome for a case. Requires `enforce()` with MLRO role (`role: "mlro"` on API key, or Admin token). Feeds the OutcomeFeedbackJournal for Brier/log-score calibration and agreement-rate analytics.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | string | Yes | Brain run identifier |
| `modeIds` | string[] | No | Reasoning mode IDs that produced the verdict |
| `autoProposed` | DispositionCode | Yes | Auto-dispositioner's proposed outcome |
| `autoConfidence` | number | Yes | 0–1 confidence score |
| `mlroDecided` | DispositionCode | Yes | MLRO's final disposition |
| `overridden` | boolean | No | Computed from `autoProposed ≠ mlroDecided` if absent |
| `overrideReason` | string | No | |
| `reviewerId` | string | No | Defaults to tenant ID |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `tenant` | string | |
| `caseId` | string | Path parameter |
| `recorded` | boolean | `true` when journal write succeeded; `false` on journal unavailability |
| `overridden` | boolean | Whether MLRO overrode the auto-dispositioner |
| `note` | string | (optional) Present when `recorded: false` |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | Missing `runId`, `autoProposed`, `mlroDecided`, or invalid `autoConfidence` |
| `401` | Missing/invalid token |
| `403` | Caller lacks MLRO role (Cabinet Res 134/2025 Art.19) |

---

## 6. Four-Eyes Approval

The four-eyes queue enforces UAE FDL 10/2025 Art.16 (two distinct actors required). The initiating actor cannot approve their own submission.

**Allowed actions:** `str`, `freeze`, `decline`, `edd-uplift`, `escalate`

### `GET /api/four-eyes`

List four-eyes queue items. Uses `withGuard`.

**Query parameters:**

| Parameter | Values | Default | Description |
|---|---|---|---|
| `status` | `pending \| approved \| rejected \| expired` | `pending` | Filter by item status |
| `caseId` | string | — | Filter by case or subject ID |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `total` | number | Count of returned items |
| `items` | FourEyesItem[] | Newest-first |
| `items[].overdue` | boolean | (optional) `true` if pending > 24 h |
| `items[].overdueHours` | number | (optional) Hours overdue |

---

### `POST /api/four-eyes`

Enqueue a new four-eyes action. Uses `withGuard`. Rejects if the same `initiatedBy` actor already has a pending entry for the same subject (duplicate-actor guard). AI enriches each item with `aiSummary`, `aiRegulatoryAnchor`, and `aiRiskLevel` when `ANTHROPIC_API_KEY` is set.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `subjectId` | string | Yes | Also accepts `caseId` alias |
| `subjectName` | string | Yes | |
| `action` | string | Yes | One of the five allowed actions |
| `initiatedBy` | string | Yes | Also accepts `actor` alias |
| `reason` | string | No | Also accepts `rationale` alias |
| `contextUrl` | string | No | Link to supporting evidence |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `item` | FourEyesItem | Created item including `id`, timestamps, and optional AI fields |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | Missing required fields or invalid `action` |
| `401` | Missing/invalid token |
| `409` | `duplicate_approver` — initiator already has a pending entry for this subject |

---

### `PATCH /api/four-eyes?id=<id>`

Approve or reject a pending four-eyes item. Uses `withGuard`. Operator must differ from the initiator.

**Query parameters:** `id` (required) — the `FourEyesItem.id`.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `operator` | string | Yes | Approving/rejecting operator identifier |
| `decision` | `"approve" \| "reject"` | Yes | |
| `rejectionReason` | string | No | Required on rejection |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `item` | FourEyesItem | Updated item |
| `asanaTaskUrl` | string | (optional) Asana task URL for the decision record |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | Missing `id`, `operator`, or invalid `decision` |
| `401` | Missing/invalid token |
| `403` | Operator is the same as `initiatedBy` (self-approval) |
| `404` | Item not found |
| `409` | Item already approved, rejected, or expired |

---

### `POST /api/four-eyes/approve`

Explicit approve/reject endpoint for programmatic callers. Uses `withGuard`. Implements a two-approval model: the first `approve` keeps status `pending`; the second flips status to `approved`. Any `reject` is immediate.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `itemId` | string | Yes | FourEyesItem ID |
| `actor` | string | Yes | Approving/rejecting actor |
| `decision` | `"approve" \| "reject"` | Yes | |
| `rationale` | string | Yes | Non-empty justification |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `itemId` | string | |
| `status` | string | Current item status after this action |
| `approvalsCount` | number | Total approvals recorded |
| `requiredApprovals` | `2` | |
| `completedAt` | string \| null | ISO timestamp when both approvals complete |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | `missing_fields` — any required field absent |
| `400` | `invalid_decision` — not `approve` or `reject` |
| `401` | Missing/invalid token |
| `404` | `item_not_found` |
| `409` | `item_not_pending` — already resolved |
| `409` | `duplicate_approver` — actor already recorded |
| `409` | `self_approval_not_permitted` — actor is initiator (UAE FDL 10/2025 Art.16) |

---

### `POST /api/four-eyes/expire`

Expire one or all overdue pending items. Admin-only (`withGuard`). Idempotent for already-resolved items.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `itemId` | string | One of these | Expire a specific item |
| `expireOverdueAll` | boolean | required | `true` to expire all overdue items |
| `thresholdHours` | number | No | Overdue threshold 1–720 h; default `24` |
| `reason` | string | No | Audit-chain note; default `"expired_by_admin"` |
| `actor` | string | No | Default `"system"` |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `expired` | number | Items expired this call |
| `itemIds` | string[] | IDs of expired items |
| `thresholdHours` | number | (when `expireOverdueAll`) Threshold used |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | `missing_target` — neither `itemId` nor `expireOverdueAll` provided |
| `401` | Missing/invalid token |
| `404` | `item_not_found` (single-item path) |
| `409` | `item_not_pending` (single-item path) |

---

### `DELETE /api/four-eyes?id=<id>`

Remove a four-eyes item. Uses `withGuard`. Prefer leaving items for audit purposes.

**Query parameters:** `id` (required).

**Response body (200):** `{ok: true}`

**Error codes:**

| Code | Condition |
|---|---|
| `400` | Missing or invalid `id` |
| `401` | Missing/invalid token |

---

## 7. Audit Trail

The audit chain is stored in Netlify Blobs (`hawkeye-audit-chain/chain.json`) as an append-only array. Each entry includes a FNV-1a hash linking it to the previous entry, creating a tamper-evident sequence.

### `GET /api/audit-trail`

Read paginated audit chain entries. Requires `enforce()`. Newest-first.

**Query parameters:**

| Parameter | Type | Default | Max | Description |
|---|---|---|---|---|
| `page` | number | `1` | — | 1-indexed page |
| `pageSize` | number | `50` | `200` | Entries per page |
| `verified` | boolean | `false` | — | When `true`, annotates each entry with `hashValid` |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `totalEntries` | number | Total entries in chain |
| `page` | number | |
| `pageSize` | number | |
| `entries` | ChainEntry[] | |
| `entries[].seq` | number | Sequential entry number |
| `entries[].prevHash` | string | FNV-1a hash of preceding entry |
| `entries[].entryHash` | string | FNV-1a hash of this entry |
| `entries[].payload` | object | Event data (event type, actor, subject, severity, etc.) |
| `entries[].at` | string | ISO timestamp |
| `entries[].hashValid` | boolean | (optional, when `verified=true`) |
| `tamperMarker` | object | (optional) Present when the audit-chain-probe scheduled function detected tampering |

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing/invalid token |
| `503` | Blob store unavailable |

---

### `GET /api/audit-trail/export`

Download audit entries as JSON or CSV within an optional date range. Admin-only (`withGuard`). Response is a file download.

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `from` | ISO date | No | Inclusive start date |
| `to` | ISO date | No | Inclusive end date (normalised to 23:59:59.999 UTC) |
| `format` | `json \| csv` | No | Default `json` |

**Response (JSON):**

`Content-Type: application/json`; `Content-Disposition: attachment; filename="hawkeye-audit-<date>.json"`

```json
{
  "ok": true,
  "format": "json",
  "count": 150,
  "from": "2026-01-01",
  "to": "2026-03-31",
  "entries": [...],
  "exportedAt": "2026-05-17T09:00:00.000Z"
}
```

**Response (CSV):**

`Content-Type: text/csv`; columns: `seq, event, subject, actor, severity, hitsCount, listsChecked, enrichmentPending, caseId, asanaTaskId, at`

**Error codes:**

| Code | Condition |
|---|---|
| `400` | Invalid `from` or `to` date |
| `401` | Missing/invalid token |
| `503` | Blob store unavailable |

---

### `GET /api/audit-trail/verify`

Verify the integrity of the full audit chain by recomputing every FNV-1a hash and checking `prevHash` links. Admin-only (`withGuard`).

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `chainIntegrity` | `"intact" \| "broken"` | Verification result |
| `entriesVerified` | number | Total entries checked |
| `firstBreakAt` | number \| null | Sequence number of first broken link, or `null` |
| `compositeHash` | string | FNV-1a hash of the last entry (chain fingerprint) |
| `verifiedAt` | string | ISO timestamp |

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing/invalid token |
| `503` | Blob store unavailable |

---

## 8. Regulator Access

### `POST /api/admin/issue-regulator-token`

Issue a read-only JWT for UAE FIU / FATF / internal-audit examiners. Admin-only (`adminAuth` — strict ADMIN_TOKEN check). Signed with `REPORT_ED25519_PRIVATE_KEY` (Ed25519). Issuance is logged to Netlify Blobs (fingerprint only; token value is never stored).

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `examinerId` | string | Yes | Examiner identifier |
| `issuedBy` | string | Yes | Operator email/GID for audit-trail attribution |
| `tenants` | string[] | One of these | Tenant scope |
| `cases` | string[] | required | Case ID scope |
| `ttlDays` | number | No | Default 7, max 90 |
| `notBefore` | string | No | ISO date — optional windowed access |

At least one of `tenants` or `cases` must be non-empty.

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `token` | string | Signed JWT (Ed25519) |
| `claims` | object | Decoded claims: `jti`, `sub`, `iat`, `exp`, `nbf?`, `scope.{tenants, cases}` |
| `publicKeyUrl` | string | URL of the verification public key |
| `issuanceLogKey` | string | Blob store key for the issuance audit record |
| `fingerprint` | string | First 16 hex chars of SHA-256(token) |
| `hint` | string | Usage instructions |

**Error codes:**

| Code | Condition |
|---|---|
| `400` | Missing `examinerId`, `issuedBy`, or empty scope |
| `401` | Missing or invalid `ADMIN_TOKEN` |
| `503` | `REPORT_ED25519_PRIVATE_KEY` not configured |

---

### `GET /.well-known/hawkeye-pubkey.pem`

Ed25519 public key in PEM format for offline signature verification.

**Auth:** None required.

**Response (200):** `Content-Type: application/x-pem-file`; 5-minute public cache.

**Response (404):** Plain text — `REPORT_ED25519_PRIVATE_KEY` not configured on this deployment.

**Shell verification example:**
```sh
curl -O https://hawkeye-sterling.netlify.app/.well-known/hawkeye-pubkey.pem
openssl pkeyutl -verify -pubin -inkey hawkeye-pubkey.pem \
  -sigfile sig.bin -in hash.bin
```

---

### `GET /.well-known/jwks.json`

JSON Web Key Set (RFC 7517) for the report-signing Ed25519 key.

**Auth:** None required.

**Response (200):** `Content-Type: application/jwk-set+json`; 5-minute public cache.

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "<fingerprint>",
      "x": "<base64url-public-key>"
    }
  ]
}
```

Returns `{"keys": []}` when `REPORT_ED25519_PRIVATE_KEY` is not set.

---

## 9. Admin

### `GET /api/admin/lseg-status`

LSEG World-Check credential presence and CFS index state. Requires `enforce()`. Never returns key values.

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `generatedAt` | string | ISO timestamp |
| `lsegWorldCheck.credentials.apiKeyConfigured` | boolean | `LSEG_WORLDCHECK_API_KEY` set |
| `lsegWorldCheck.credentials.apiSecretConfigured` | boolean | `LSEG_WORLDCHECK_API_SECRET` set |
| `lsegWorldCheck.credentials.fullyConfigured` | boolean | Both key and secret present |
| `lsegWorldCheck.liveApi.status` | string | Human-readable status |
| `lsegWorldCheck.cfsIndex.built` | boolean | CFS index has been imported |
| `lsegWorldCheck.cfsIndex.entitiesIndexed` | number | Entities in the CFS index |
| `lsegWorldCheck.cfsIndex.filesProcessed` | number | CFS files parsed |
| `lsegWorldCheck.cfsIndex.builtAt` | string | (optional) ISO timestamp of last import |

---

### `POST /api/admin/import-cfs`

Parse all LSEG CFS bulk files from the `hawkeye-lseg-cfs` Blob store and build a queryable entity index at `hawkeye-lseg-pep-index`. Admin-only (Bearer ADMIN_TOKEN). Idempotent — re-running rebuilds the index. Invalidates the candidate cache on completion. Up to 60 s.

**Request body:** Empty.

**Response body (200):** Parse statistics per file, total entities indexed, `builtAt` timestamp, and per-file breakdown of sanctions list IDs and adverse categories discovered.

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing/invalid admin token |
| `503` | Blob store unavailable or CFS store empty |

---

### `GET /api/env-check`

Environment variable presence check for all platform configuration items. Requires `enforce()`. Returns `207` when required variables are missing. **Never returns variable values.**

**Response body:**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` when all required vars are set |
| `ts` | string | ISO timestamp |
| `summary.requiredConfigured` | number | |
| `summary.requiredMissing` | number | |
| `summary.optionalConfigured` | number | |
| `summary.optionalMissing` | number | |
| `checks` | EnvCheck[] | One entry per variable group |
| `checks[].id` | string | |
| `checks[].label` | string | Variable name(s) |
| `checks[].group` | string | e.g. `"Core Required"`, `"goAML / FIU Reporting"` |
| `checks[].required` | boolean | |
| `checks[].present` | boolean | Whether at least one of the candidate var names is set |
| `checks[].hint` | string | Operational guidance |

**HTTP status codes:** `200` when all required vars present; `207` when any required var is missing.

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing/invalid token |

---

## 10. Regulatory Feed

### `GET /api/regulatory-feed`

Filtered regulatory intelligence from UAE and international sources. Requires `enforce()`. Response is cached module-level for 30 minutes.

**Sources polled:** UAE MoET, UAE IEC, CBUAE, FATF RSS, OFAC Sanctions Actions XML, UN Security Council press releases, Google News RSS (targeted), GDELT Project API. Each source is attempted independently; failures are silently dropped.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `sources` | comma-separated | Filter to specific sources (e.g. `FATF,OFAC`) |
| `category` | string | Filter by category (e.g. `AML/CFT`, `Sanctions`) |
| `tone` | `green \| amber \| red` | Filter by tone |
| `since` | ISO date | Return items published on or after this date |
| `q` | string | Keyword search across title and snippet |
| `limit` | number | Max items to return |

**Response body (200):**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` |
| `items` | RegulatoryItem[] | Filtered items |
| `totalCount` | number | Count of returned items |
| `sources` | string[] | Sources that contributed items |
| `fetchedAt` | string | ISO timestamp of cache population |
| `latencyMs` | number | |
| `errors` | string[] | Non-fatal source errors |
| `meta` | object | Filter statistics: `totalCached`, `returnedAfterFilter`, `rejectedWhitelist`, `rejectedKeyword`, `rejectedFreshness`, `filtersApplied` |

**RegulatoryItem fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique item ID |
| `title` | string | |
| `url` | string | Source URL |
| `pubDate` | string | Publication date (ISO-8601 or free-form) |
| `source` | string | e.g. `"FATF"`, `"OFAC"`, `"CBUAE"` |
| `category` | string | e.g. `"AML/CFT"`, `"Sanctions"`, `"PDPL"` |
| `tone` | `"green" \| "amber" \| "red"` | `red` = enforcement/alert; `amber` = guidance update; `green` = informational |
| `snippet` | string | (optional) Summary text |

**Error codes:**

| Code | Condition |
|---|---|
| `401` | Missing/invalid token |

---

## Appendix A — Rate Limits

Rate limits are enforced per API key by tier. The portal admin bypass (`ADMIN_TOKEN`) uses the enterprise tier. Limits are surfaced in response headers (specific header names depend on the Redis/Blobs rate-limit store configuration).

---

## Appendix B — Environment Variables (Core)

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_TOKEN` | Yes | Admin bearer token |
| `ANTHROPIC_API_KEY` | Yes | Claude API for AI enrichment features |
| `AUDIT_CHAIN_SECRET` | Yes | HMAC-SHA256 key for tamper-evident audit chain |
| `SESSION_SECRET` | Yes | Portal session signing |
| `JWT_SIGNING_SECRET` | Yes | JWT signing (≥32 bytes) |
| `ONGOING_RUN_TOKEN` | Yes | Token for `/api/ongoing/run` |
| `SANCTIONS_CRON_TOKEN` | Yes | Token for scheduled sanctions refresh |
| `NEXT_PUBLIC_APP_URL` | Yes | Deployment base URL |
| `HAWKEYE_ENTITIES` | Yes | Reporting entity JSON array for goAML/FIU filings |
| `REPORT_ED25519_PRIVATE_KEY` | No | Ed25519 key for regulator JWT signing and report signatures |
| `NETLIFY_SITE_ID` | No | Required for Netlify Blobs strong-consistency access |
| `NETLIFY_BLOBS_TOKEN` | No | Required for Netlify Blobs strong-consistency access |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis for durable rate limiting and GDELT cache |
| `ASANA_TOKEN` | No | Asana Personal Access Token for MLRO inbox delivery |
| `UAE_EOCN_SEED_PATH` | No | Local path to UAE EOCN seed JSON (regulatory risk if absent) |
| `UAE_LTL_SEED_PATH` | No | Local path to UAE LTL seed JSON (regulatory risk if absent) |
| `LSEG_WORLDCHECK_API_KEY` | No | LSEG World-Check live API (~5M PEP/sanctions records) |
| `LSEG_WORLDCHECK_API_SECRET` | No | Required alongside `LSEG_WORLDCHECK_API_KEY` |

---

## Appendix C — Blob Store Layout

| Store name | Key prefix | Contents |
|---|---|---|
| `hawkeye-audit-chain` | `chain.json` | Full FNV-1a audit chain |
| `hawkeye-audit-chain` | `tamper-detected.json` | Written by probe when tampering detected |
| `hawkeye-lists` | `<listId>/latest.json` | Live watchlist entity arrays |
| `hawkeye-list-reports` | `<listId>/latest.json` | Per-list ingestion reports with `fetchedAt` |
| `hawkeye-lseg-pep-index` | `manifest.json` | CFS index manifest |
| `hawkeye-brain-governance` | `catalogue-reviewed-at.json` | MLRO brain-catalogue review date |
| `hawkeye-lseg-cfs` | — | Raw CFS bulk files (polled every 6 h) |

---

## Appendix D — Sanctions List IDs

| ID | List |
|---|---|
| `un_consolidated` | UN Security Council Consolidated |
| `ofac_sdn` | US OFAC Specially Designated Nationals |
| `ofac_cons` | US OFAC Consolidated Non-SDN |
| `eu_fsf` | EU Financial Sanctions |
| `uk_ofsi` | UK HM Treasury OFSI |
| `ca_osfi` | Canada OSFI Consolidated |
| `ch_seco` | Switzerland SECO |
| `au_dfat` | Australia DFAT Consolidated |
| `jp_mof` | Japan MOF (requires `FEED_JP_MOF` env var) |
| `fatf` | FATF call-for-action / monitoring |
| `uae_eocn` | UAE Executive Office Sanctions List |
| `uae_ltl` | UAE Local Terrorist List |
| `lseg_*` | LSEG CFS supplement variants of the above |
