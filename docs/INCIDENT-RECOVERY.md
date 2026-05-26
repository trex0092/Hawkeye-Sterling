# Hawkeye-Sterling — Incident Recovery Runbook

Last verified against deployment: commit `624f2db7` (origin/main) on 2026-05-18.

This document captures the **observed, reproducible** recovery procedure for
the incidents Hawkeye-Sterling has actually experienced in production.
It is not aspirational. Every section below has been triggered at least once.

---

## 1. Reference dashboards and probes

| Surface | URL / Command | Auth |
|---|---|---|
| Liveness | `GET https://hawkeye-sterling.netlify.app/api/health` | none (public) |
| Screening readiness | `GET https://hawkeye-sterling.netlify.app/api/screening/health` | none (public) |
| Per-list sanctions status | `GET https://hawkeye-sterling.netlify.app/api/sanctions/status` | `enforce()` — same-origin or API key |
| Status (full) | `GET https://hawkeye-sterling.netlify.app/api/status` | `enforce()` |
| Last ingest errors | `GET https://hawkeye-sterling.netlify.app/api/sanctions/last-errors` | `enforce()` |
| Netlify deploy log | https://app.netlify.com/sites/hawkeye-sterling/deploys | Netlify auth |

HTTP status mapping for `/api/health` and `/api/screening/health`:
- **200** — all components healthy
- **207** — at least one component `degraded` (still serving, reduced fidelity)
- **503** — at least one component `down` (refuse-traffic level)

---

## 2. Sanctions corpus empty (`CORPUS_MISSING`)

**Symptom.** `/api/screening/health` returns 207 with
`sanctions_lists.status: "degraded"` and `detail` referencing
`sanctions/meta.json not found` or `CORPUS_MISSING`. `/api/screening/health`
shows `watchlist_corpus` entries dropping to ~65 (the static seed corpus
in `web/lib/data/candidates.ts`).

**Root cause history.** Netlify Blobs `hawkeye-lists` store is empty.
Either (a) the scheduled ingest functions have not run since the last
deploy reset the blob store, (b) `NETLIFY_API_TOKEN` is misconfigured
so the writes 401 silently, or (c) every adapter parsed to zero
entities — but **commit `3fcde0e9` added the feed-integrity guard that
refuses empty overwrites**, so case (c) now manifests as `EMPTY-WRITE
REFUSED` in the Function logs with the prior snapshot preserved.

**Recovery.**

1. Verify `NETLIFY_API_TOKEN` is set to a **full Netlify Personal Access
   Token** (https://app.netlify.com/user/applications#personal-access-tokens).
   Do **not** use a Blobs-only token here — `web/lib/server/store.ts:55-70`
   checks `NETLIFY_API_TOKEN` first.
2. Trigger `netlify/functions/refresh-lists` from the Netlify dashboard
   (Functions → Scheduled → Run). This re-fetches every adapter in
   `SOURCE_ADAPTERS` and writes per-list `latest.json` to
   `hawkeye-lists` store.
3. Re-probe `/api/screening/health` — expect HTTP 200 within 60 s of the
   function completing. `watchlist_corpus.entries` should be back to
   thousands.
4. If `EMPTY-WRITE REFUSED` appears in the function log, the integrity
   guard saved you from a parser regression — read the per-adapter
   summary in the function response, identify which list parsed to
   zero, and fix the parser before retrying.

**Time to recover:** ~3 min for steps 1-3 once `NETLIFY_API_TOKEN` is
correct. Step 1 is the long pole if a fresh PAT must be minted.

**Forensic trail.** `<listId>/latest.rejected.json` in the
`hawkeye-list-reports` store captures every refused empty write with
its original errors array — review before clearing.

---

## 3. Live deploy broke a route

**Symptom.** One or more `/api/*` routes return 500 / `MODULE_NOT_FOUND` /
`TypeError`, or `/api/screening/run` returns malformed JSON.

**Recovery.**

1. Identify the failing route — `gh run list --workflow=ci.yml` shows
   the last build; Netlify deploy log shows the actual SHA.
2. **Roll back via Netlify dashboard.** Deploys → click the last green
   deploy → "Publish deploy." This is a hot rollback — no rebuild
   required, ~30 s to take effect.
3. After rollback, re-probe the broken route to confirm recovery.
4. Open a follow-up issue on `trex0092/Hawkeye-Sterling` referencing
   the broken SHA so the cause is fixed before the next deploy.

**Time to recover:** ~1 min for the Netlify rollback. Do not attempt to
diagnose-and-redeploy under pressure — rollback first, diagnose after.

**Note on git revert vs Netlify rollback.** Netlify rollback is faster
and reversible; `git revert` requires a fresh build (5–10 min) and a
push. Always rollback first.

---

## 4. GDELT brownout (adverse-media latency spike)

**Symptom.** Screening calls take 60+ s wall-clock; super-brain reports
include `serviceError: true` for the GDELT block. `/api/status`
`gdeltCache.breaker.state` is `closed` but `consecutiveFailures` is
climbing.

**Recovery.** Usually self-healing in 1–10 minutes once the breaker
trips:

1. Watch `/api/status` `gdeltCache.breaker`. When `consecutiveFailures`
   hits 5 the state transitions to `open` with `msUntilProbe` showing
   the cooldown. Live calls are now short-circuited (~0 ms) and
   results fall back to Redis-stale.
2. When `msUntilProbe` reaches 0, the next call probes upstream
   (`half_open`). Success → `closed`, GDELT back to normal. Failure →
   `open` with double the cooldown (cap 10 min).
3. **Force-reset if needed.** Cold-restart the relevant Lambda (any
   non-trivial code deploy will reset the per-Lambda breaker state).
4. **Hard-fail only when** `gdeltCache.breaker.consecutiveTrips > 6`
   AND GDELT itself is reported down on
   https://status.gdeltproject.org/ — at that point we accept a
   24-hour stale Redis window per FDL Art.19.

**Time to recover:** 1 min once the breaker trips; 10 min in worst-case
exponential backoff.

---

## 5. Login brute-force / lockout

**Symptom.** A legitimate user reports `Too many failed login
attempts. Try again later.` despite knowing their password.

**Recovery.**

1. Confirm from `/api/status` or Netlify logs that the user actually
   exhausted `MAX_FAILURES = 10` within the 15-min sliding window.
2. The `failureMap` is **per-Lambda warm instance** — the simplest
   reset is to deploy any code change, which cold-starts every
   Lambda. For an urgent reset without a deploy, the user must wait
   `WINDOW_MS` (15 min) for the lock to expire naturally.
3. If repeated lockouts occur on the same user, check the username
   isn't being typo'd by SSO; check `/api/auth/login` logs for the
   hashed username key and IP.

**Time to recover:** 15 min (passive) or ~1 min (deploy any commit to
cold-start Lambdas).

**Note.** Commit `52004ff3` bounded `failureMap` to 10 000 entries
with FIFO eviction + lazy sweep — sustained probing cannot exhaust
memory but a probe at exact eviction boundary may re-pass the
window. This is intentional; the alternative is OOM.

---

## 6. Audit chain corrupted / verify fails

**Symptom.** `/api/audit/verify` returns
`{ok: false, error: "chain_broken", index: N}`.

**Recovery.**

1. Treat as a **regulatory incident**. The audit chain is FDL 10/2025
   Art.24 evidence — break in the chain may invalidate the 10-year
   retention claim.
2. Identify break index from the verify response.
3. Pull the full chain export (`/api/audit/view`, MLRO-auth) and snapshot
   to forensic storage **before any remediation**.
4. Inspect entries `N-2` through `N+2` for tampering signature vs.
   storage drift. Storage drift is a Blobs-side issue; tampering
   triggers Section 9 (FIU notification).
5. Resume chain by appending a `chain_break_recovered` event with the
   break index and the auth context. Do NOT delete or rewrite
   prior entries — append-only is the contract.

**Time to recover:** Depends on root cause. Snapshot → 5 min.
Investigation → hours/days.

---

## 7. Cron stopped running

**Symptom.** `/api/sanctions/status` shows `ageHours` climbing past 36
on every adapter; `/api/sanctions/last-errors` has no recent entries
(the cron isn't even firing).

**Recovery.**

1. Netlify dashboard → Functions → check `refresh-lists`,
   `sanctions-watch-cron`, `sanctions-watch-1100`,
   `sanctions-watch-1330`, `sanctions-watch-15min` last invocation
   timestamps.
2. If "never" or stale > 24 h, the scheduled triggers are not firing.
   Most common cause: deploy removed/renamed the function file. Check
   the deploy log for `Scheduled function ... removed`.
3. Worst case: trigger `netlify/functions/refresh-lists` manually
   from the dashboard while diagnosing the schedule issue.

**Time to recover:** 1 min for a manual trigger; longer to fix the
schedule itself depending on cause.

---

## 8. Secret rotation (JWT_SIGNING_SECRET / AUDIT_CHAIN_SECRET)

**When to trigger:** Suspected credential compromise, scheduled rotation (recommended: 90-day cycle for JWT secrets), or pre-emptive rotation before a key escrow change.

**Procedure (zero-downtime dual-secret overlap — see `web/lib/server/jwt.ts`):**

1. **Rotate `JWT_SIGNING_SECRET`:**
   - Set `JWT_SIGNING_SECRET_PREV` = current `JWT_SIGNING_SECRET` value in Netlify/k8s.
   - Set `JWT_SIGNING_SECRET` = new random 64-byte hex string (`openssl rand -hex 64`).
   - Deploy. `verifyJwt()` now tries the primary key first, then falls back to `_PREV`.
   - Wait for JWT TTL to expire (default 600 s). Monitor logs for `jwt_signed_with_prev_key` — that counter reaching zero confirms all old tokens are expired.
   - Remove `JWT_SIGNING_SECRET_PREV` from env and redeploy.

2. **Rotate `AUDIT_CHAIN_SECRET`:**
   - Audit chain HMACs use the secret only for new entries (previous entries remain valid with their recorded HMAC). Rolling forward is safe.
   - Set `AUDIT_CHAIN_SECRET` = new value, deploy. All new chain entries use the new secret.
   - Verify with `/api/audit/verify` — old entries verify against their stored HMAC (which was computed with the old key at write time). Verify response `ok: true` confirms chain integrity.
   - Append a `chain.secret_rotated` audit event documenting the rotation.

3. **Rotate `SESSION_SECRET`:**
   - All active sessions are immediately invalidated on deploy (sessions are HMAC-signed with this key).
   - Schedule rotation during low-traffic window. Users will need to re-authenticate.

**Time to recover (planned):** ~15 min per secret including deploy time.  
**Reference:** `web/lib/server/jwt.ts` (dual-secret path), `docs/governance/AI_GOVERNANCE_POLICY.md`.

---

## 9. AI model incident (hallucination detected / model drift alert)

**Symptom.** One of:
- Dashboard shows `ai.hallucination_detected` event in audit trail (from `web/lib/server/hallucination-gate.ts`).
- `/api/ai-governance/risk-register` returns `attestationStatus: "overdue"` for a high/critical-tier model.
- Drift monitor fires: `computeDriftReport()` returns `driftDetected: true` in the bias/drift report.
- `hawkeye_bias_alert_total` counter spikes in Prometheus metrics.

**Immediate response:**

1. **Hallucination alert:** The `ai.hallucination_detected` audit chain entry identifies the route and response text. Retrieve via `/api/audit/view` (MLRO auth). Do NOT act on the AI output for the affected subject until a human review is completed. Log the hallucination as a `near-miss` in `docs/INCIDENTS.md`.

2. **Model drift alert:** Review the drift report (`GET /api/ai-governance/risk-register`). If `verdictDrift > 20%` vs. prior 30-day window: (a) suspend automated escalations pending MLRO review, (b) file an internal model-change incident, (c) schedule re-attestation via Asana (`attestation-status` endpoint drives this automatically when configured).

3. **Bias alert** (`ai.bias_detected` or `ai.nationality_bias_detected`): Suspend batch screening for the flagged script/nationality group until the bias source is diagnosed. Review `GET /api/bias-report` for the affected tenant. If `biasRatio > 1.5` for any group, treat as a FATF R.10 potential discriminatory screening incident and escalate to MLRO.

4. **Attestation overdue:** The `/api/ai-governance/attestation-status` endpoint returns 503. The Netlify scheduled function automatically creates an Asana task 30 days before due date. If overdue: freeze new AI-assisted screening decisions for the overdue model tier until re-attestation is completed per `docs/governance/AI_GOVERNANCE_POLICY.md`.

**Time to recover:** Hallucination/drift investigation: 2–24 h depending on scope. Attestation: scheduled review cycle.  
**Reference:** `web/lib/server/hallucination-gate.ts`, `web/lib/server/drift-monitor.ts`, `web/lib/server/bias-monitor.ts`, `docs/governance/AI_GOVERNANCE_POLICY.md`.

---

## 10. Attestation overdue — quarterly model governance cycle

**Symptom.** `GET /api/ai-governance/attestation-status` returns HTTP 503 with `hasCriticalOverdue: true`. An Asana task was created 30 days before the due date and was not actioned.

**Recovery:**

1. Retrieve the overdue model IDs from the 503 response `overdueModelIds` array.
2. For each overdue high/critical-tier model:
   - Convene the model attestation panel (MLRO + CTO minimum, per `AI_GOVERNANCE_POLICY.md`).
   - Review the model card in `docs/model-cards/<model-id>.md`.
   - Run or review the most recent adversarial red-team results (`dist/adversarial-results/latest.json`).
   - Review the drift and bias reports for the past 90 days.
   - Sign the attestation: update `approval.nextAttestationDue` and `approval.approvedAt` in `web/lib/server/ai-governance.ts` MODEL_REGISTRY, commit, and deploy.
3. After deploy, verify `GET /api/ai-governance/attestation-status` returns 200 with `attestationStatus: "current"` for all models.
4. Record the attestation in `docs/INCIDENTS.md` with the panel participants, date, and any model changes since the prior attestation.

**Regulatory note:** UAE FDL 10/2025 Art.18 requires demonstrable human oversight of AI compliance tools. An overdue attestation is a regulatory control failure. If overdue by > 30 days without remediation, the MLRO must assess whether the AI-assisted decisions made during the overdue period require retrospective human review.

**Time to recover:** Same-day if panel is available; up to 5 business days for a full attestation cycle.  
**Reference:** `web/app/api/ai-governance/attestation-status/route.ts`, `web/lib/server/ai-governance.ts`, `docs/governance/AI_GOVERNANCE_POLICY.md`.

---

## 11. Escalation paths

For incidents in §2, §3, §6 that persist > 30 minutes:

1. **MLRO** — owner of regulatory exposure (`GOAML_MLRO_*` env vars
   identify who, manually set in Netlify).
2. **trex0092 GitHub repo admin** — code-level rollback and merge
   privileges on `main`.
3. **Netlify site owner** — env var changes, scheduled-function
   management, deploy publishing.

If the audit chain is implicated (§6) the MLRO is the FIRST contact
and a `chain_break_recovered` event MUST be appended within the same
business day.

---

## 9. After every incident

1. Append the incident to `docs/INCIDENTS.md` (date, symptom,
   resolution, time-to-recover) — the next on-call should find your
   handover, not have to reconstruct it.
2. If a code change is needed to prevent recurrence, open a PR
   referencing this runbook section.
3. Update this file when the runbook changes — a stale runbook is
   worse than no runbook.
