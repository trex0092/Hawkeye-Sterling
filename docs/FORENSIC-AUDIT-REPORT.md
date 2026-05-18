# Hawkeye-Sterling — Forensic Audit Report

Forensic readiness: what evidence Hawkeye-Sterling produces, where
it's stored, how an external auditor can request and verify it.

Branch tip `09a2cb83` on `claude/fix-build-failures` (2026-05-18).

## 1. Audit chain (FDL 10/2025 Art.24 / 10-year retention)

### 1.1 What is recorded

Every regulator-relevant action appends a chain entry:
- MLRO disposition (approve / decline / escalate)
- STR / SAR filing (draft, submitted, accepted, rejected)
- Freeze (initiated, approved via four-eyes, executed)
- Sanctions screening run + decision
- Four-eyes approval decisions (approve + reject)
- Onboarding decisions (accept / decline / EDD-uplift)

### 1.2 How tamper-evidence is enforced

Three mathematical invariants per entry:

1. **`id = sha256(canonical(action, target, actor, body, at))`**
   — modifying any field changes the id.
2. **`signature = HMAC-SHA256(previousHash || id || at,
   AUDIT_CHAIN_SECRET)`** — modifying any field changes the
   signature, which an attacker cannot recompute without the
   HMAC key.
3. **`previousHash = prior_entry.id`** — modifying any entry's
   previousHash breaks chain linkage from that point onward.

Plus `sequence = prior + 1` — modifying / inserting / deleting an
entry produces a detectable sequence gap.

### 1.3 How to verify

```bash
# Verify the full chain
curl -i -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://hawkeye-sterling.netlify.app/api/audit/verify

# Verify a single case
curl -i -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://hawkeye-sterling.netlify.app/api/audit/verify?screening_id=case-12345"

# Verify a time window
curl -i -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://hawkeye-sterling.netlify.app/api/audit/verify?since=2026-01-01T00:00:00Z&until=2026-06-01T00:00:00Z"
```

Response shape:

```json
{
  "ok": true | false,
  "totalScanned": 12345,
  "totalVerified": 12345,
  "brokenLinks": [],
  "invalidIds": [],
  "invalidSignatures": [],
  "sequenceGaps": [],
  "headConsistent": true,
  "head": { "sequence": 12345, "hash": "..." }
}
```

`ok: false` with non-empty `brokenLinks`/`invalidIds`/
`invalidSignatures`/`sequenceGaps` is a regulatory incident — see
[INCIDENT-RECOVERY.md §6](INCIDENT-RECOVERY.md).

### 1.4 Verifier test coverage

`web/lib/server/__tests__/audit-chain.test.ts` — 10 vitest cases:
- accept clean chain (any length)
- accept empty chain (genesis)
- detect tampered body
- detect tampered actor
- detect broken chain link
- detect forged signature
- detect sequence gap
- reject with wrong HMAC secret
- `computeId` deterministic
- `computeSignature` changes with secret

All currently passing.

## 2. Sanctions ingestion forensic trail

### 2.1 What is recorded per refresh

For every adapter run in `src/ingestion/run-all.ts`:

```ts
interface IngestionReport {
  listId: string;          // e.g. "ofac_sdn"
  sourceUrl: string;       // upstream URL
  recordCount: number;     // entities parsed
  checksum: string;        // sha256 of raw upstream payload
  fetchedAt: number;       // ms epoch
  durationMs: number;
  errors: string[];        // empty on success
  sourceVersion?: string;  // upstream version tag if available
}
```

### 2.2 Where stored

- Successful run: `hawkeye-lists/<listId>/latest.json` (the entities)
  + `hawkeye-list-reports/<listId>/latest.json` (the report)
- Refused empty overwrite: `hawkeye-list-reports/<listId>/latest.rejected.json`
- Per-error structured entry: `hawkeye-ingest-errors/entry/<ISO-rand>`

### 2.3 How to retrieve

```bash
# Per-list status snapshot
curl -i -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://hawkeye-sterling.netlify.app/api/sanctions/status

# Most-recent 20 structured error entries
curl -i -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://hawkeye-sterling.netlify.app/api/sanctions/last-errors
```

## 3. Authentication forensic trail

### 3.1 Login attempts

Successful + failed login attempts log:
```
[auth/login] failed attempt { key: <sha256(username)>, ip, userFound }
[auth/login] rate-limited { key, ip, retryAfterSec }
```

Username is SHA-hashed for PII hygiene before logging. IP is
extracted from `x-forwarded-for` (first hop only).

### 3.2 Lockout state

`failureMap` is per-Lambda warm instance; not persisted. Lockout
events are visible in Netlify function logs but not currently
in a searchable structured store. Open gap (D9).

### 3.3 Four-eyes decisions

Every four-eyes PATCH (approve or reject) creates:
1. A Blob `four-eyes/<id>` with `approvedBy` / `rejectedBy` +
   timestamp + reason.
2. An Asana task (project: `ASANA_FOUR_EYES_PROJECT_GID`) with
   the full decision record (subject, action, decision, signer,
   reason, legal basis).
3. An audit chain entry (via `/api/audit/sign`) for the
   downstream action (STR / freeze / decline / etc.).

The Asana mirror is best-effort — if Asana POST fails, the local
audit + Blob record still land.

## 4. Screening forensic trail

### 4.1 Per-screening evidence

`quickScreen()` (and the deep-screen pipeline) produce:

```ts
interface QuickScreenResult {
  topScore: number;
  severity: string;
  hits: Array<{
    listId: string;
    listRef: string;
    candidateName: string;
    score: number;
    method: string;  // matching algorithm used
  }>;
  matchedKeywords?: string[];
  // ...
}
```

For ongoing-monitoring runs, the result snapshot is persisted to:

- `ongoing/last/<subjectId>` — the latest snapshot
- `profile/<subjectId>` — the rolling history (last 200 snapshots
  + `hitsEverSeen` set of last 500 list-ref/name pairs)

### 4.2 How to replay a screening

`GET /api/profile/<subjectId>` (auth-gated) returns the full
rolling profile so an auditor can reconstruct the decision
trajectory.

## 5. Configuration forensic trail

### 5.1 Build identity

`GET /api/health` (public) returns:
```json
{
  "buildId": "...",       // Netlify build ID or git SHA
  "commitRef": "abc1234"  // 7-char git SHA at build time
}
```

`GET /api/status` (auth-gated) returns the full
`configHealth.requiredTotal` / `requiredConfigured` count so an
auditor sees coverage without learning the missing var name
(non-admin) or with the var name (admin-only field gating).

### 5.2 Deployment history

External: Netlify dashboard → Deploys list (last 100 deploys
with publishing user + git SHA + build time).

## 6. Forensic gaps (open)

- **D20** — There is no signed case-bundle export today. An
  auditor must currently aggregate evidence by querying
  individual endpoints. A `GET /api/forensic/case/<id>/bundle`
  endpoint that produces a sealed, hash-signed zip would close
  this.
- **AUDIT_CHAIN_SECRET rotation** — no `keyId`-aware verifier
  means a secret rotation invalidates verification of entries
  signed under the prior secret until those entries are
  re-signed.
- **Lockout history** is not persisted (`failureMap` is
  per-Lambda only).
- **Cron lock history** is not persisted beyond the current
  acquisition record.

## 7. Forensic readiness assertion

The platform CAN produce, on demand and without operator
intervention beyond an admin token:

1. ✅ Full audit chain export with cryptographic verification.
2. ✅ Per-list sanctions freshness with last-modified timestamps.
3. ✅ Per-subject screening history (last 200 snapshots).
4. ✅ Most-recent ingestion error entries.
5. ✅ Build SHA + commit ref for every deploy.

The platform CANNOT yet produce without code work:

1. ❌ Signed case-bundle zip (D20).
2. ❌ Lockout event time series.
3. ❌ Cron-lock history time series.
4. ❌ APM-grade request latency distributions.

## 8. External auditor checklist

For an FDL 10/2025 / FATF mutual-evaluation reviewer:

1. ☑ Verify audit chain: `GET /api/audit/verify` → expect
   `ok: true`.
2. ☑ Sample entries: pull 10 random sequences from
   `audit/entry/<key>`, recompute id + signature locally, compare.
3. ☑ Verify chain head matches `audit/head.json`.
4. ☑ Test tamper-detection by modifying one byte of one entry
   in a non-production environment and re-running verify
   — expect specific invalid-id or invalid-signature fault.
5. ☑ Verify sanctions ingestion: `GET /api/sanctions/status` →
   confirm `summary.healthy` matches expected list count.
6. ☑ Verify rate limiting: send `rateLimitPerSecond + 1`
   requests within one second → expect HTTP 429 with
   `Retry-After` + `x-ratelimit-*` headers.
7. ☑ Verify four-eyes server-side enforcement: as user A, POST
   a `four-eyes` item; as user A again, PATCH with `approve` →
   expect HTTP 403 "second approver must be different from
   initiator".
8. ☑ Verify integrity guard: in a non-prod environment, force
   an adapter to return zero entities → expect
   `EMPTY-WRITE REFUSED` in logs and prior snapshot preserved.
