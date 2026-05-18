# Hawkeye-Sterling — Required Environment Variables

This document distils `.env.example` down to **only the env vars
required for production operation**. The full list of optional
intelligence adapters (231-source surface) is in `.env.example`
itself.

Every required var below is read via `process.env` at runtime;
production values live in Netlify dashboard → Site settings →
Environment variables.

Generated against `.env.example` at branch tip
`claude/fix-build-failures` 2026-05-18.

## 1. Hard-required — fail-closed if unset

### MoonDB (primary database)

| Var | Purpose | Source |
|---|---|---|
| `MOONDB_PROJECT_ID` | Project identifier | moondb-setup.mjs output |
| `MOONDB_ADMIN_KEY` | Admin key for writes | moondb-setup.mjs output |
| `MOONDB_PUBLIC_KEY` | Public key for reads | moondb-setup.mjs output |

### Anthropic + Asana

| Var | Purpose | Failure mode if unset |
|---|---|---|
| `ANTHROPIC_API_KEY` | LLM-backed faculties (super-brain, MLRO advisor) | Routes degrade to deterministic-only output |
| `ASANA_TOKEN` | Every Asana integration (STR, TM, escalations) | Asana mirror skipped; local audit still written |
| `ASANA_WORKSPACE_GID` | Asana workspace | Asana mirror skipped |
| `ASANA_PROJECT_GID` | MLRO triage queue | Tasks won't land in correct project |
| `ASANA_ASSIGNEE_GID` | MLRO user | Tasks unassigned |

### Session + JWT secrets (HMAC keys)

| Var | Purpose | Failure mode |
|---|---|---|
| `SESSION_SECRET` | HMAC-signs portal session cookies | All portal page requests redirect to /login in a loop |
| `JWT_SIGNING_SECRET` | JWT signing for API tokens | `/api/auth/token` returns 503 |
| `AUDIT_CHAIN_SECRET` | HMAC-signs audit chain entries (FDL Art.24) | `/api/audit/sign` returns 503 |
| `ADMIN_TOKEN` | Portal admin endpoints | Admin routes return 503 |

Generate every HMAC secret with `openssl rand -hex 32` (or `hex 64`
for `AUDIT_CHAIN_SECRET`).

### Cron auth tokens

| Var | Purpose | Failure mode |
|---|---|---|
| `ONGOING_RUN_TOKEN` | Protects `/api/ongoing/run` + transaction-monitor | Endpoints return 503 |
| `SANCTIONS_CRON_TOKEN` | Protects `/api/sanctions/watch` | Returns 503 |

### Initial passwords

| Var | Purpose |
|---|---|
| `LUISA_INITIAL_PASSWORD` | Initial password for the l.fernanda (MLRO/CO) portal account. Set BEFORE first deploy or a random one is generated and logged. |

### Public app URL

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Used for outbound webhook callback URLs. Must be the canonical deployment URL. |

### goAML FIU reporting

`HAWKEYE_ENTITIES` is the preferred path. Either of these patterns
must be set:

**Multi-entity (preferred):**
```
HAWKEYE_ENTITIES=[{"id":"entity-01","name":"...","goamlRentityId":"REPLACE_ME"},...]
HAWKEYE_DEFAULT_ENTITY_ID=entity-01
```

**Single-entity (legacy fallback):**
```
GOAML_RENTITY_ID=<assigned by UAE FIU>
GOAML_RENTITY_BRANCH=<optional branch code>
```

Plus shared MLRO identity:
```
GOAML_MLRO_FULL_NAME=
GOAML_MLRO_EMAIL=
GOAML_MLRO_PHONE=
```

## 2. Required for Netlify Blobs to work in production

| Var | Purpose | Note |
|---|---|---|
| `NETLIFY_API_TOKEN` | Full Netlify Personal Access Token | **Use this**, NOT `NETLIFY_BLOBS_TOKEN`. `web/lib/server/store.ts:55-70` checks `NETLIFY_API_TOKEN` first. A misconfigured `NETLIFY_BLOBS_TOKEN`-only setup silently 401s on every Blobs write — the documented cause of the watchlist corpus collapse observed in production 2026-05-18. |
| `NETLIFY_SITE_ID` (or `SITE_ID`) | Site identifier | Resolved automatically by `@netlify/blobs` on a Netlify Lambda; set explicitly only for dev/test |

## 3. Recommended for production

| Var | Purpose | If unset |
|---|---|---|
| `ASANA_SAR_PROJECT_GID` | STR/SAR Asana board | STRs land in default project |
| `ASANA_TM_PROJECT_GID` | Transaction-monitor alerts | Alerts land in default project |
| `ASANA_ESCALATIONS_PROJECT_GID` | Auto-escalations | Land in default project |
| `ASANA_WEBHOOK_SECRET` | Asana webhook HMAC fallback (Blobs is primary) | Webhook still works if Blobs has the registered secret |
| `ASANA_FOUR_EYES_PROJECT_GID` | Four-eyes decisions Asana board | Falls back to `ASANA_PROJECT_GID` |
| `LSEG_WORLDCHECK_API_KEY` | LSEG bulk supplements | `/api/admin/import-cfs` returns 503 |
| `LSEG_WORLDCHECK_API_SECRET` | LSEG bulk supplements | Same |
| `LSEG_APP_KEY` | LSEG application identity | Same |
| `ALERT_WEBHOOK_URL` | Cron alert fanout (degraded ingest, zero-entity lists) | Alerts not routed |

## 4. Recommended for observability

| Var | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Strict-mode rate limiting via atomic INCR. **Operator has opted out per `feedback_no_redis`** — in-memory fallback accepted. |
| `UPSTASH_REDIS_REST_TOKEN` | Paired with above |
| `HAWKEYE_CRON_TOKEN` | Authentication for cron-trigger endpoints (currently unset in prod per `hawkeye_sterling_netlify_env_state`) |

## 5. Optional intelligence adapters

The 231-source intelligence surface is gated by per-vendor env vars.
Every adapter is **fail-soft** — an unset key silently disables that
vendor without breaking other pipelines.

See the T1 / T2 / T3 sections of `.env.example` for the full list.

Categories:
- T1 — free with sign-up (news, corporate registries)
- T2 — free toggles (set `*_ENABLED=1`)
- T3 — commercial vendors (LSEG, Dow Jones, Sayari, ComplyAdvantage, etc.)

## 6. SECRETS_SCAN_OMIT_KEYS

In `netlify.toml` we set:

```toml
SECRETS_SCAN_OMIT_KEYS = "LSEG_USERNAME,LSEG_PASSWORD,LSEG_APP_KEY,LSEG_SQS_ENDPOINT"
```

This excludes those four LSEG vars from Netlify's automatic secrets
scan so an incidental appearance in build logs doesn't block the
deploy. Values themselves are never committed.

## 7. Verification

After setting env vars, before declaring readiness:

```bash
# Public liveness
curl -i https://hawkeye-sterling.netlify.app/api/health

# Auth-gated readiness (with admin token)
curl -i -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://hawkeye-sterling.netlify.app/api/screening/health

curl -i -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://hawkeye-sterling.netlify.app/api/sanctions/status
```

The `/api/screening/health` response must show
`sanctions_lists: { status: "healthy" }` and a `watchlist_corpus`
entry count in the thousands. A count of 65 means Blobs is empty —
go back to §2.
