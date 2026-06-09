# Hawkeye-Sterling — Reliability Report

State of the platform's reliability controls as of branch
`claude/fix-build-failures` (last commit `9d515ae0` on 2026-05-18).

Reliability is measured by **how the system behaves when its
dependencies fail**, not by how fast it runs on a happy path.

## 1. Failure modes — observed

These are the failure modes that have actually occurred. Recovery
behaviour for each is documented in
[INCIDENT-RECOVERY.md](INCIDENT-RECOVERY.md).

| Failure mode | Frequency | Current handling |
|---|---|---|
| Netlify Blobs misconfigured / not bound | Occurred 2026-05-18 (current) | `/api/screening/health` reports degraded; `candidates-loader.ts` falls back to seed corpus |
| Audit-v9-style merge ships regression | Once | Hot rollback via Netlify dashboard documented in runbook |
| GDELT brownout (502s, timeouts) | Multiple-times-per-week | Circuit breaker trips at 5 failures, exponential cooldown, stale-Redis fallback |
| Netlify scheduled function retries | Per Netlify SLA | 23 h / 12 min cron locks block within-window retries |
| Login brute-force probing | Continuous low-volume | 10-failures-per-15-min lockout, bounded `failureMap` |
| Adapter parses to zero entities | Theoretical (not yet observed) | Feed-integrity guard refuses overwrite of healthy snapshot |
| Asana webhook spoofing | Continuous (any internet host can POST) | HMAC-SHA256 `X-Hook-Signature` verification with timing-safe-equal |

## 2. Failure modes — defended-by-design

| Failure mode | Defence |
|---|---|
| Anonymous traffic on a paid route | `enforce()` default `requireAuth: true` + CI auth-coverage gate |
| Authenticated traffic exceeds quota | Per-key fixed-window rate limiter + tier-defined caps |
| Sanctions list parser regression | Feed-integrity guard refuses empty-overwrite |
| Cron job duplicate-fires from a Netlify retry | Cron min-interval lock |
| Cron job duplicate-fires from a sibling cron | Cron min-interval lock |
| Cron job stops firing | `/api/sanctions/status` reports `stale` / `missing` after 24h; manual trigger documented |
| Upstream GDELT brownout | Circuit breaker short-circuits live calls |
| Lambda warm-instance memory exhaustion | Bounded `failureMap`, bounded `_mem` (gdelt-cache), bounded breakers |
| Fire-and-forget promise rejection | Global async safety net + `fireAndForget()` wrapper |
| Tampered audit log entry | hash-linked + HMAC chain; `/api/audit/verify` |
| Session cookie tampering | HMAC-signed sessions; Edge verifies expiry, Node.js verifies HMAC |

## 3. Service-level commitments

### 3.1 Sanctions list freshness

- Daily refresh at 03:00 UTC (`refresh-lists`).
- Three additional sweeps daily (04:30, 11:00, 13:30 UTC).
- Fast cadence every 15 min (`sanctions-watch-15min`).
- `STALE_AT_HOURS = 36` — a list older than 36 h is reported as
  `stale` on `/api/sanctions/status`.
- `CRITICAL_LISTS = [ofac_sdn, un_consolidated, eu_fsf]` get an
  additional 24-h stale alert from `sanctions-watch-cron`.

### 3.2 Audit chain durability

- Every disposition / freeze / STR / four-eyes decision appends
  an HMAC-signed entry.
- Append-only — entries are never edited or deleted.
- `/api/audit/verify` can validate the entire chain on demand.
- Tamper-evidence is mathematical: an attacker must recompute
  every downstream HMAC, which requires `AUDIT_CHAIN_SECRET`.

### 3.3 GDELT latency

- Healthy state: ~1-3 s per call (network-bound).
- Brownout state: ~0 ms (breaker short-circuits).
- Recovery: half-open probe one per cooldown window; success →
  CLOSED, failure → OPEN with doubled cooldown (max 10 min).

### 3.4 Login lockout

- Threshold: 10 failures per 15-min sliding window per username.
- Memory ceiling: 10 000 entries (FIFO evict).
- Timing-side-channel mitigation: uniform 400 ms delay on failure.

## 4. Single points of failure

### 4.1 Recovery Procedures

The following procedures define recovery actions for each SPOF, along with RTO/RPO targets and the quarterly DR test schedule.

| System | RTO | RPO | Recovery Steps |
|---|---|---|---|
| **Netlify Blobs** | < 5 min (degraded mode) | 36 h (sanctions stale threshold) | (1) `candidates-loader.ts` auto-detects Blobs unavailable and falls back to seed corpus. (2) Engineering Lead verifies Netlify Blobs health via Netlify dashboard. (3) Manually trigger `POST /api/sanctions/ingest` to refresh lists once Blobs are healthy. (4) Alert MLRO if fallback exceeds 36 hours. |
| **Anthropic API** | < 15 min (graceful degrade) | N/A — stateless LLM | (1) All LLM call sites catch errors and degrade to deterministic rule-based output. (2) Engineering Lead verifies API status at `status.anthropic.com`. (3) `llm-fallback.ts` routes to Groq cost-fallback if configured. (4) MLRO is notified if AI advisory is unavailable for > 30 min. |
| **Netlify Scheduled Functions** | < 1 h | < 24 h (next scheduled run) | (1) `fireAlert()` webhook fires on any cron failure. (2) Engineering Lead triggers manual execution: `POST /api/sanctions/ingest` (sanctions), `POST /api/ongoing/run` (monitoring). (3) Verify via `/api/sanctions/status` that lists are fresh. |
| **Audit Chain** | < 24 h | < 24 h (last nightly backup) | (1) Restore from S3 backup (`netlify/functions/audit-chain-s3-backup.mts`). (2) Run `/api/audit/verify` to validate HMAC chain integrity. (3) Document any gap in audit chain in incident log. |
| **AUDIT_CHAIN_SECRET rotation** | Planned maintenance only | N/A | (1) New secret written alongside old (dual-key window). (2) `keyId` field on new entries identifies the active key. (3) Verifier reads both secrets until all pre-rotation entries are past their retention period. |

**Escalation on SPOF event:** MLRO notified within 1 hour of any CRITICAL SPOF. Board Risk Committee notified within 24 hours if SPOF results in screening being unavailable for > 4 hours or audit chain integrity being uncertain.

**DR Test Schedule:** Recovery procedures are tested quarterly (January, April, July, October). Test results are recorded in the governance committee minutes and any gaps are tracked in `COMPLIANCE_GAPS.md`.

The following are SPOFs by design (their failure is operationally
recoverable, not technically prevented):

- **Netlify Blobs** — entire ingestion + audit storage layer.
  Mitigation: `candidates-loader.ts` falls back to static seed
  corpus; in-memory `inMemoryStore()` fallback for dev/test.
  Production outage of Netlify Blobs degrades us to seed-only
  screening; we do not lose data.
- **Anthropic API** — LLM-backed faculties (super-brain, MLRO
  advisor, four-eyes AI summary). Mitigation: every call site
  catches and degrades to deterministic-only output. The brain's
  rule-based classifier still runs.
- **Netlify scheduled functions** — sanctions ingestion. Mitigation:
  five separate cron triggers; manual trigger documented in
  runbook.
- **AUDIT_CHAIN_SECRET** rotation — if rotated, the verifier
  cannot validate prior entries. Mitigation: an explicit key
  rotation flow exists (`/api/audit/sign` carries `keyId`), but
  the verifier currently uses a single secret. This is a known
  gap.

## 5. Reliability metrics not yet measured

- p95 / p99 latency per route (no APM today).
- Error-rate dashboards (would require Grafana / Datadog).
- Sanctions list freshness as a time series (only point-in-time
  status on `/api/sanctions/status`).
- Cron lock hit rate (held vs. acquired) — not exposed.
- Circuit breaker trip frequency over time — only current state
  exposed.

## 6. Reliability gaps closed on this branch

- Empty-overwrite of healthy sanctions snapshot — was undefended;
  now refused with forensic evidence persisted.
- GDELT brownouts — was 60+ s per call; now ~0 ms once breaker
  trips.
- Login `failureMap` memory leak — was unbounded; now bounded.
- Cron retry duplicate-fires — was undefended; now blocked by
  min-interval lock.
- Fire-and-forget promise rejections — was opaque stack traces in
  Netlify logs; now structured `[safe-async]` entries.
- HTTP semantics on `/api/health` — was always 200; now 207
  when degraded.
- 429 missing `Retry-After` on `/api/auth/token` — was bare 429;
  now carries 24h retry hint.

## 7. Reliability gaps still open

- D8 — `requestId` propagation incomplete.
- D9 — structured JSON logging not uniform.
- D13 — zod validation not uniform.
- D17 — API schema drift not audited.
- Observability — no APM / metrics / time-series telemetry.
- AUDIT_CHAIN_SECRET rotation — no `keyId`-aware verifier.
- Forensic export with chain-of-custody hash — not built.
