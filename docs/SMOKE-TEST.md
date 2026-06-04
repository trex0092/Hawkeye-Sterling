# Hawkeye Sterling — Production Smoke Test Runbook

**Purpose:** Verify the **live deployed app** actually works end-to-end after a release —
not just that tests pass, but that a real user flow behaves correctly.

**Who runs this:** The operator (you), on a machine with the real logins. It **cannot** be
run from the Claude Code sandbox — that environment is firewalled from production and blocks
the creation of auth secrets, so only `/api/health` (the unauthenticated liveness probe) is
reachable from there.

**When to run:** After every production deploy, and after changing any of: auth secrets,
`HAWKEYE_ENTITIES`, `ASANA_TOKEN`, `ANTHROPIC_API_KEY`, sanctions-list config, or the ongoing
-monitoring schedule.

**Base URL:** `https://hawkeye-sterling.netlify.app` (replace if on a custom domain).

---

## 0. Prerequisites

Have these to hand (from Netlify → Site settings → Environment variables):

- `ADMIN_TOKEN` — for authenticated API calls
- `ONGOING_RUN_TOKEN` — for triggering the ongoing-monitoring run
- A browser logged into the operator portal
- Access to the Asana workspace/board the app writes to

> ⚠️ Never paste these secrets into a shared terminal, screenshot, or commit. Use a private
> shell. Clear your history afterwards if needed.

---

## 1. Liveness — `/api/health` (no auth)

```bash
curl -s https://hawkeye-sterling.netlify.app/api/health | jq
```

**✅ Expect:** HTTP 200 and a body like:

```json
{
  "ok": true,
  "status": "operational",
  "mandatoryListsHealthy": true,
  "brain": { "ok": true },
  "hallucinationGate": { "loaded": true },
  "s3AuditBackup": { "configured": <true once CG-6 done> }
}
```

**❌ Investigate if:** `ok:false`, `mandatoryListsHealthy:false` (sanctions lists stale/missing —
screening would be unreliable), or `brain.ok:false`.

---

## 2. Fail-closed auth — `/api/quick-screen` WITHOUT a key

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://hawkeye-sterling.netlify.app/api/quick-screen \
  -H 'content-type: application/json' \
  -d '{"subject":{"name":"Test Person"}}'
```

**✅ Expect:** `401` (anonymous callers are rejected — the core fail-closed invariant).
**❌ Investigate if:** `200` — auth is NOT enforced; stop and fix before going live.

---

## 3. Authenticated screening — `/api/quick-screen` WITH a key

Use a **known sanctioned name** so you expect a hit (e.g. a current OFAC/UN listee).

```bash
curl -s -X POST https://hawkeye-sterling.netlify.app/api/quick-screen \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -d '{"subject":{"name":"<known sanctioned name>"}}' | jq
```

**✅ Expect:** HTTP 200, with a top score and at least one hit against a sanctions list
(`hits[]` non-empty, a `topScore`, a severity band).
**❌ Investigate if:** 401/403 (token wrong/role missing), 503 (`screening_corpus_unavailable`
— sanctions lists not loaded), or a clear result for an obviously-sanctioned name.

Then screen a **clearly clean name** (e.g. a random non-listed person) → **expect** a low/clear
score with no hits. This confirms you're not getting false positives on everything.

---

## 4. Asana report lands — ongoing monitoring

This proves the 3×/day mandate (CG-3) and the Asana integration both work.

**4a. Enrol a test subject** (if you don't already have one) via the portal's screening/onboard
flow, assigning any risk tier.

**4b. Trigger an ongoing-monitoring run manually:**

```bash
curl -s -X POST https://hawkeye-sterling.netlify.app/api/ongoing/run \
  -H "authorization: Bearer $ONGOING_RUN_TOKEN" | jq '{ok, total, rescreened, withNewHits, escalations}'
```

> Note: in production this route also requires Netlify's `x-netlify-scheduled-function` header
> for the cron path. A manual call with a valid `ONGOING_RUN_TOKEN` may return `401` by design
> if `NODE_ENV=production` and the scheduled-function header is absent. If so, instead **wait for
> the next scheduled slot** (08:30 / 15:00 / 17:30 Dubai) and verify via the board in 4c.

**4c. Open Asana** → **✅ Expect:** a new screening-report task for the test subject (one per
due tick — three per day once the floor is active). Adverse-media hits create a separate
`🟥 [ADVERSE-MEDIA …]` task; score jumps create a `🚨 Score jumped …` escalation task.

**❌ Investigate if:** no task appears — check `ASANA_TOKEN` is set and the project GIDs in
`asanaConfig` are correct; check the run response for `asanaSkipReason`.

---

## 5. 3×/day floor is firing (CG-3)

After the app has been live for a day, confirm each enrolled subject was screened **three
times**:

- In the portal, open a test subject's **screening history / re-screen timeline**.
- **✅ Expect:** three entries per day, around the 08:30 / 15:00 / 17:30 Dubai slots.
- Or check the audit chain for `ongoing.monitor_tick` / `new_hits_alert` events at those times.

**❌ Investigate if:** only one entry per day for a low-risk subject — the global floor isn't
being applied (check `nextScreenAtWithFloor` is wired in `/api/ongoing/run`).

> ⚠️ Scale note: 3×/day screens **all** enrolled subjects. For large portfolios watch the
> `/api/ongoing/run` duration (30s function limit) and Asana rate limits.

---

## 6. goAML entity + filing (CG-4)

Confirm the reporting entity IDs resolve and a filing carries a valid Rentity ID.

**6a.** In the portal, start a **test STR/goAML** draft for a screened subject and select a
reporting entity. **✅ Expect:** the entity picker shows the 6 entities (`HS1`…`HS6`).

**6b.** Generate the goAML XML (test mode — **do not** submit a real filing to the FIU unless
this is a sanctioned test). **✅ Expect:** the XML's reporting-entity element carries the
configured Rentity ID (`001`…`006`), **not** a `REPLACE_ME` / `FIU_PENDING_*` placeholder.

**❌ Investigate / CRITICAL if:** the FIU rejects the filing for an invalid reporting entity ID
→ the configured IDs don't match real goAML registrations; update `HAWKEYE_ENTITIES` in Netlify
with the correct FIU-assigned values.

---

## 7. Egress / tipping-off gate (CG-7)

For any narrative-generating route (SAR / goAML narrative), confirm the egress gate is live:
if `ANTHROPIC_API_KEY` is missing or the LLM check fails, the response must be **`held_review`**,
never `allowed`. A normal narrative request with a healthy key should return a generated
narrative. **❌ Investigate if:** a narrative is released when the gate should have held it.

---

## Pass/fail summary

| # | Check | Pass = |
|---|-------|--------|
| 1 | Health | 200, operational, lists healthy |
| 2 | No-auth screen | **401** |
| 3 | Auth screen | 200, hit on sanctioned name, clear on clean name |
| 4 | Asana report | task appears on the board |
| 5 | 3×/day floor | 3 timeline entries/day per subject |
| 6 | goAML entity | XML carries real Rentity ID, FIU accepts |
| 7 | Egress gate | holds for review on failure, releases when healthy |

**All seven green = production verified.** Any red = do not rely on the deploy for live
compliance work until resolved.

---

## Why this can't be automated from the Claude Code sandbox

- The sandbox is **firewalled** from `*.netlify.app` (every request → `403 host_not_allowed`).
- It **blocks creation of auth secrets** (commands setting `SESSION_SECRET`, `ADMIN_TOKEN`,
  etc. are killed), so the app's auth layer can't be booted there.
- Only step 1 (`/api/health`, unauthenticated) is reachable; steps 2–7 require a real
  environment with secrets — i.e. **you**, on the live site or a local dev env with real env vars.
