# Hawkeye Sterling — Netlify Deployment Guide

Hawkeye Sterling is a regulator-grade AML/CFT screening platform built on Next.js 14 and deployed on Netlify. This guide covers all deployment requirements, environment configuration, troubleshooting, and rollback procedures.

---

## Prerequisites

| Tool | Required version |
|------|-----------------|
| Node.js | ≥ 22.x |
| npm | ≥ 10.x |
| Netlify CLI | ≥ 17.x (optional — for local simulation) |

---

## Quick Deploy

```bash
# 1. Clone the repository
git clone https://github.com/trex0092/hawkeye-sterling.git
cd hawkeye-sterling

# 2. Install root dependencies and compile brain
npm ci --include=dev
npm run build

# 3. Generate weaponized brain manifest
node scripts/gen-weaponized-brain.cjs

# 4. Install web dependencies and build Next.js
cd web && npm ci --include=dev && npm run build

# 5. Deploy via Netlify CLI (or push to linked branch)
cd .. && netlify deploy --prod
```

The netlify.toml `[build]` command handles all 6 steps automatically on Netlify.

---

## Required Environment Variables

Set these in **Netlify → Site settings → Environment variables** before the first deploy. Without these, critical endpoints return 503.

### Core Platform (mandatory)

| Variable | Description | How to generate |
|----------|-------------|-----------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | [console.anthropic.com](https://console.anthropic.com) |
| `AUDIT_CHAIN_SECRET` | HMAC-SHA256 key for tamper-evident audit chain | `openssl rand -hex 64` |
| `ADMIN_TOKEN` | Admin portal bearer token (never exposed to browser) | `openssl rand -hex 32` |
| `ONGOING_RUN_TOKEN` | Bearer token for `/api/ongoing/run` | `openssl rand -hex 32` |
| `SANCTIONS_CRON_TOKEN` | Bearer token for scheduled sanctions refresh | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Public URL of this deployment | e.g. `https://hawkeye-sterling.netlify.app` |

### goAML / FIU Reporting (required for STR filing)

| Variable | Description |
|----------|-------------|
| `HAWKEYE_ENTITIES` | JSON array of reporting entities (see `.env.example`) |
| `GOAML_MLRO_FULL_NAME` | MLRO full legal name |
| `GOAML_MLRO_EMAIL` | MLRO email address |
| `GOAML_MLRO_PHONE` | MLRO phone number (optional) |

### UAE-Specific Sanctions (optional but recommended)

| Variable | Description |
|----------|-------------|
| `UAE_EOCN_SEED_PATH` | Path to local UAE EOCN JSON seed file |
| `UAE_LTL_SEED_PATH` | Path to local UAE Local Terrorist List JSON seed |

> **Note:** UN, OFAC SDN, OFAC Consolidated, EU FSF, UK OFSI, and FATF lists require no API keys — they are ingested directly from official URLs.

---

## Optional Environment Variables

### Commercial Screening Vendors (higher accuracy)

| Variable | Provider |
|----------|----------|
| `LSEG_WORLDCHECK_API_KEY` | LSEG World-Check One |
| `DOWJONES_RC_API_KEY` | Dow Jones Risk & Compliance |
| `COMPLYADVANTAGE_API_KEY` | ComplyAdvantage |
| `SAYARI_API_KEY` | Sayari Graph |
| `OPENSANCTIONS_API_KEY` | OpenSanctions (free tier available without key) |

### News & Adverse Media

| Variable | Provider |
|----------|----------|
| `NEWSAPI_KEY` | NewsAPI.org |
| `GNEWS_API_KEY` | GNews |
| `GUARDIAN_API_KEY` | The Guardian |
| `NYT_API_KEY` | New York Times |
| `ALEPH_API_KEY` | OCCRP Aleph |

### Corporate Registries

| Variable | Provider |
|----------|----------|
| `OPENCORPORATES_API_KEY` | OpenCorporates |
| `COMPANIES_HOUSE_API_KEY` | UK Companies House |

### Crypto On-Chain Intelligence

| Variable | Provider |
|----------|----------|
| `CHAINALYSIS_API_KEY` | Chainalysis KYT |
| `TRM_API_KEY` | TRM Labs |
| `ELLIPTIC_API_KEY` | Elliptic |

### KYC / Identity Verification

| Variable | Provider |
|----------|----------|
| `ONFIDO_API_KEY` | Onfido |
| `JUMIO_API_TOKEN` | Jumio |
| `TRULIOO_API_KEY` | Trulioo |

### Rate Limiting (production recommended)

| Variable | Description |
|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint (atomic rate limits) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |

> Without Redis, the system falls back to Netlify Blobs-based soft counters. Blobs counters are non-atomic and not suitable for high-traffic production deployments.

### Asana Case Inbox

| Variable | Description |
|----------|-------------|
| `ASANA_TOKEN` | Asana Personal Access Token |
| `ASANA_WORKSPACE_GID` | Asana workspace GID |
| `ASANA_PROJECT_GID` | Master inbox project GID |
| `ASANA_SAR_PROJECT_GID` | STR/SAR filings project GID |
| `ASANA_TM_PROJECT_GID` | Transaction monitor alerts project GID |
| `ASANA_ESCALATIONS_PROJECT_GID` | Auto-escalations project GID |
| `ASANA_ASSIGNEE_GID` | Default MLRO assignee GID |

---

## Build Commands

All build logic is encoded in `netlify.toml`. The build steps are:

```
>>> HS-STEP-1   npm ci --include=dev             (root dependencies)
>>> HS-STEP-2   npm run build                    (TypeScript → dist/)
>>> HS-STEP-3   node scripts/gen-weaponized-brain.cjs  (signed brain manifest)
>>> HS-STEP-4   cd web && npm ci --include=dev   (web dependencies)
>>> HS-STEP-5   rm -rf .next                     (clean build cache)
>>> HS-STEP-6   npm run build                    (Next.js build)
```

**Debugging build failures:** The last `>>> HS-STEP-N` marker printed before exit is the failing step.

---

## Post-Deploy Verification

After deployment, verify these endpoints:

```bash
BASE_URL=https://hawkeye-sterling.netlify.app

# 1. Basic liveness
curl $BASE_URL/api/health

# 2. Screening subsystem health
curl $BASE_URL/api/screening/health

# 3. Integrations status (requires admin token)
curl -H "Authorization: Bearer $ADMIN_TOKEN" $BASE_URL/api/integrations/status

# 4. Sanctions list freshness
curl -H "Authorization: Bearer $ADMIN_TOKEN" $BASE_URL/api/sanctions/status

# 5. Environment variable check
curl -H "Authorization: Bearer $ADMIN_TOKEN" $BASE_URL/api/env-check

# 6. Test quick screen
curl -X POST $BASE_URL/api/quick-screen \
  -H "Content-Type: application/json" \
  -d '{"subject":{"name":"Test Entity"}}'
```

Expected: `/api/health` returns `{"ok":true,"status":"healthy"}`.

---

## Sanctions List Ingestion

After first deploy, ingest the sanctions lists:

```bash
# Trigger manual ingest (requires SANCTIONS_CRON_TOKEN)
curl -X POST $BASE_URL/api/sanctions/refresh \
  -H "Authorization: Bearer $SANCTIONS_CRON_TOKEN"
```

The scheduled functions will then keep the lists fresh automatically:
- `sanctions-watch-15min.mts` — every 15 minutes (high-priority alerts)
- `sanctions-watch-1100.mts` — daily at 11:00 UTC
- `sanctions-watch-1330.mts` — daily at 13:30 UTC
- `sanctions-ingest.mts` — full ingest (scheduled)

---

## Audit Chain Initialisation

The audit chain requires `AUDIT_CHAIN_SECRET` to be set. Verify it works:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" $BASE_URL/api/audit/verify
# Expected: {"ok":true,"totalScanned":0,"headConsistent":true}
```

---

## Troubleshooting

### Build fails at HS-STEP-2 (TypeScript compilation)

```bash
# Check for TypeScript errors locally
npm run typecheck

# Common cause: missing @types/node
npm ci --include=dev
```

### Build fails at HS-STEP-6 (Next.js build)

```bash
# Check for web TypeScript errors
cd web && npm run typecheck

# Common cause: dist/ not compiled before web build
# The web typecheck needs dist/src/brain/*.js to exist
# Ensure HS-STEP-2 completed successfully
```

### `/api/health` returns 503

Indicates the brain module failed to load. Check Netlify function logs for:
- `dist/src/brain/quick-screen.js not found` → HS-STEP-2 failed
- `Cannot find module` → dist/ files not included in bundle (check `netlify.toml [functions] included_files`)

### `/api/screening/health` returns `corpus_unavailable`

Watchlist corpus not ingested. Run:
```bash
curl -X POST $BASE_URL/api/sanctions/refresh \
  -H "Authorization: Bearer $SANCTIONS_CRON_TOKEN"
```

### Audit chain errors

```bash
# Verify AUDIT_CHAIN_SECRET is set
curl -H "Authorization: Bearer $ADMIN_TOKEN" $BASE_URL/api/env-check | jq '.checks[] | select(.id == "audit_chain_secret")'
```

If `present: false`, set the environment variable and redeploy.

### Rate limiting not working (all requests pass)

Redis not configured. For production:
1. Create an Upstash Redis instance at [upstash.com](https://upstash.com)
2. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
3. Redeploy

Without Redis, the system uses Blobs-based soft counters (non-atomic, may allow burst traffic).

### goAML XML generation fails

Check `HAWKEYE_ENTITIES` is valid JSON:
```bash
echo $HAWKEYE_ENTITIES | jq .
# Must be an array of objects with id, name, goamlRentityId fields
# Replace any "REPLACE_ME" values with actual UAE FIU-assigned IDs
```

---

## Rollback

```bash
# List recent deploys
netlify api listSiteDeploys --data '{"site_id":"YOUR_SITE_ID"}'

# Rollback to a specific deploy
netlify api restoreSiteDeploy --data '{"site_id":"YOUR_SITE_ID","deploy_id":"DEPLOY_ID"}'
```

Or via Netlify UI: **Deploys → select previous deploy → Publish deploy**.

**Note:** Rolling back does NOT roll back Netlify Blobs data (audit chain, sanctions cache). If a bad deploy corrupted stored data, restore from the last known-good Blobs backup.

---

## CI/CD

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

1. **build** — TypeScript typecheck + vitest tests + brain audit
2. **security-audit** — dependency audit + PII guard + secret leak check
3. **lint-web** — web typecheck + ESLint
4. **nextjs-build** — full Next.js build + critical route verification (depends on build + security-audit)

All jobs must pass before merging to `main`. Netlify auto-deploys from `main` on merge.

---

## Security Notes

- `ADMIN_TOKEN` is injected by `web/middleware.ts` for same-origin portal requests. It is **never** exposed in the browser bundle.
- All API routes requiring auth use `enforce()` which validates API keys, JWTs, and the admin token.
- CSP is set per-request with a fresh nonce via `web/middleware.ts`.
- The audit chain uses HMAC-SHA256 (keyed by `AUDIT_CHAIN_SECRET`) for tamper-evidence.
- No SQL — uses Netlify Blobs for persistence (no injection risk).
- Input sanitisation: all API routes validate inputs with typed schemas before processing.

---

## Data Retention

Audit chain entries and screening records are stored in Netlify Blobs. The `retention-scheduler.mts` function enforces the configured retention policy (default: 10 years for audit chain entries, per FDL 10/2025 Art.24).

---

## Contact & Support

Report issues at: [github.com/trex0092/hawkeye-sterling/issues](https://github.com/trex0092/hawkeye-sterling/issues)
