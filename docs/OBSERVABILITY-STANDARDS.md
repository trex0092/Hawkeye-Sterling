# Hawkeye-Sterling — Observability Standards

Working standards for how Hawkeye-Sterling emits operational
telemetry. This document is **descriptive** — it captures what is
currently emitted — and **prescriptive** — it defines what new code
should emit. Drift from the prescriptive section is a bug.

## 1. Log levels

| Level | When |
|---|---|
| `error` | Operation failed; data may be lost or stale; on-call should investigate |
| `warn` | Operation degraded but completed; user-visible impact possible |
| `log` / `info` | State transition, successful operation, configuration |
| `debug` | Per-request detail (NOT used in production today) |

## 2. Structured fields (prescriptive)

Every new log line MUST carry at minimum:

```ts
{
  level: 'error' | 'warn' | 'log',
  module: string,        // file or subsystem identifier
  operation: string,     // human-readable action (e.g. "putDataset")
  outcome: 'ok' | 'fail' | 'skip' | 'refused',
  at: string,            // ISO-8601 timestamp
  // requestId: string,  // propagated from middleware (D8 pending)
}
```

Existing legacy `console.warn("[module] message:", err)` lines are
acceptable but not preferred. Migration to the structured form is
tracked under D9.

## 3. Structured-error log entries

The audit + ingestion path persists structured errors to Blobs for
the operator dashboard:

- File: `src/ingestion/error-log.ts`
- Store: `hawkeye-ingest-errors`
- Schema:
  ```ts
  interface IngestErrorEntry {
    at: string;
    source: string;              // e.g. "refresh-lists"
    adapterId: string;           // e.g. "ofac_sdn"
    phase: 'fetch' | 'parse' | 'write' | 'verify' | 'integrity-guard';
    message: string;
    httpStatus?: number;
  }
  ```
- Read path: `GET /api/sanctions/last-errors` (auth-gated).
- Truncation: messages > 1000 chars are truncated with `…`.

## 4. Reserved log prefixes (descriptive)

These prefixes appear in current logs; greppable on the Netlify
function log page:

| Prefix | Meaning |
|---|---|
| `[refresh-lists]` | Daily sanctions ingest |
| `[sanctions-watch-cron]` / `-1100` / `-1330` / `-15min` | Per-cadence sanctions watcher |
| `[gdelt-cache]` | GDELT cache + breaker state transitions |
| `[safe-async]` | Caught unhandled rejection / uncaught exception |
| `[hawkeye] four-eyes` | Four-eyes queue operations |
| `[asana-hook]` | Asana webhook receiver |
| `[auth/login]` | Login attempts (success + failure) |
| `[ingest-error]` | Persisted error entry |
| `[ongoing]` | Ongoing-monitoring runs |
| `[candidates-loader]` | Sanctions candidate-list load |

## 5. Health endpoint contracts

| Endpoint | Healthy | Degraded | Critical |
|---|---|---|---|
| `/api/health` | 200 | 207 | n/a |
| `/api/screening/health` | 200 | 207 | 503 |
| `/api/sanctions/status` | per-list status field |
| `/api/status` | full snapshot |

The HTTP status code is authoritative — external probes that don't
parse the body MUST get a correct signal. A 200 with `status:
"degraded"` in the body is a contract violation.

## 6. Observability surfaces exposed today

### 6.1 `/api/status` (auth-gated)

The richest single endpoint. Includes:
- per-list sanctions freshness
- GDELT cache stats + breaker state (since `0f74e1f8`)
- internal-check pass/fail per subsystem
- external-vendor reachability
- configHealth (required-env-var coverage; admin-only)
- audit-chain head + last verify timestamp

### 6.2 `/api/sanctions/status` (auth-gated)

Per-list inventory: `listId, displayName, present, entityCount,
lastModified, ageHours, status: 'healthy' | 'stale' | 'missing' |
'unconfigured'` plus summary `{healthy, stale, missing,
unconfigured}` rollup.

### 6.3 `/api/sanctions/last-errors` (auth-gated)

Most-recent N (default 20) `IngestErrorEntry` records from the
`hawkeye-ingest-errors` Blobs store.

### 6.4 `/api/screening/health` (no-auth — liveness)

Three checks: `brain_engine`, `watchlist_corpus`, `sanctions_lists`.
HTTP semantics: 200 / 207 / 503.

### 6.5 `/api/audit/verify` (auth-gated)

On-demand audit-chain verification. Returns structured fault
inventory: `brokenLinks`, `invalidIds`, `invalidSignatures`,
`sequenceGaps`, `headConsistent`.

## 7. Observability gaps (open)

- **No APM** — no Datadog / New Relic / OpenTelemetry trace
  propagation today. p95 latency is not measured.
- **No metrics endpoint** — no Prometheus-compatible scrape target.
- **No log aggregation** — operators currently grep the Netlify
  function log page by hand.
- **No alert routing** — `ALERT_WEBHOOK_URL` exists and the
  ingestion path fires on degraded state, but there is no
  routing UI for who-gets-paged-for-what.
- **No time-series sanctions freshness** — only point-in-time
  status on `/api/sanctions/status`.

## 8. New-code requirements

Before merging any new route or scheduled function:

1. Health-affecting operations MUST surface their state on a
   health endpoint (one of §6.1-§6.4).
2. Every fail-path MUST emit a structured log (§2 fields).
3. Fire-and-forget promises MUST be wrapped in `fireAndForget()`
   from `src/ingestion/safe-async.ts` OR be in a module that
   calls `installGlobalAsyncSafetyNet()`.
4. Every external-vendor call SHOULD route through a circuit
   breaker (`web/lib/server/circuitBreaker.ts` or a
   purpose-built one like `gdelt-cache.ts`).
5. Every cron-triggered function MUST use `acquireCronLock(label,
   ttlMs)` with a window slightly less than its schedule cadence.
