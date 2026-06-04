# Hawkeye Sterling — Required Environment Variables
**Date:** 2026-05-08  
Set all variables in **Netlify: Site settings → Environment variables**.  
Never commit real values to the repository. `.env` is in `.gitignore`.

---

## Legend

| Column | Meaning |
|--------|---------|
| Required | REQUIRED = deploy fails or is non-functional without it; OPTIONAL = feature degrades gracefully |
| Context | production / preview / all |

---

## Tier 0 — Security (Missing = security vulnerability or portal lockout)

| Variable | Required | Description | Generate with |
|----------|----------|-------------|---------------|
| `SESSION_SECRET` | REQUIRED | HMAC-SHA256 key for all browser session tokens. If unset, the portal redirects every request to `/login`. | `openssl rand -hex 32` |
| `ADMIN_TOKEN` | REQUIRED | Bearer token for portal-to-API internal calls and admin endpoints (`/api/keys`, `/api/gdpr/*`). If unset, these endpoints return 503. | `openssl rand -hex 32` |
| `AUDIT_CHAIN_SECRET` | REQUIRED | HMAC-SHA256 key sealing the tamper-evident audit chain. Required for FDL 10/2025 Art. 24 10-year retention. If unset, `/api/audit/sign` returns 503. | `openssl rand -hex 64` |
| `ONGOING_RUN_TOKEN` | REQUIRED | Bearer token protecting `/api/ongoing/run` from public invocation. If unset, returns 503 (fail-closed). | `openssl rand -hex 32` |
| `SANCTIONS_CRON_TOKEN` | REQUIRED | Bearer token protecting `/api/sanctions/watch` scheduled ingestion. If unset, returns 503. | `openssl rand -hex 32` |
| `JWT_SIGNING_SECRET` | REQUIRED | HMAC-SHA256 key for short-lived bearer JWTs issued by `/api/auth/token`. If unset or shorter than 32 bytes, the server throws at request time — all JWT-authenticated API calls fail with an unhandled exception. | `openssl rand -hex 32` |
| `RATE_LIMIT_STRICT` | **REQUIRED (production)** | When `true`, refuses requests if Upstash Redis is unavailable rather than falling back to blob-based soft enforcement (which is race-prone under concurrent Lambda invocations). Setting this to `false` or leaving it unset in production silently degrades rate limiting to a non-atomic path. | `true` |
| `EGRESS_GATE_ENABLED` | **REQUIRED (production)** | When `true`, the egress tipping-off gate (`web/lib/server/egress-check.ts`) runs before every SAR/goAML filing. Setting to `false` in production bypasses the FDL 10/2025 Art.29 pre-check. | `true` |

---

## Tier 1 — Core Platform (Missing = core functionality broken)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | REQUIRED | Powers all Claude AI features (MLRO advisor, narrative reports, adverse-media analysis, screening verdicts). | `sk-ant-...` |
| `MOONDB_PROJECT_ID` | REQUIRED | MoonDB project ID. All persistent data storage (cases, entities, audit records). If unset, all database operations fail silently and data is lost. | From MoonDB dashboard |
| `MOONDB_ADMIN_KEY` | REQUIRED | MoonDB admin key for server-side database mutations. Treat as a root credential — restrict to server-side use only. | From MoonDB dashboard |
| `MOONDB_PUBLIC_KEY` | REQUIRED | MoonDB public key for read operations. | From MoonDB dashboard |
| `ASANA_TOKEN` | REQUIRED | Asana Personal Access Token. All task creation, triage, and STR filing flows. | From Asana: Settings → Apps → Developer → New Token |
| `ASANA_WORKSPACE_GID` | REQUIRED | Asana workspace GID. All workspace-scoped API calls. | `1213645083721316` |
| `ASANA_PROJECT_GID` | REQUIRED | Project 00 — Master Inbox GID. **All** screening submissions land here first. Do not change without MLRO approval. | `1214148630166524` |
| `ASANA_ASSIGNEE_GID` | REQUIRED | GID of the MLRO (Luisa Fernanda). Every Asana task is assigned to this user. | `1213645083721304` |
| `NEXT_PUBLIC_APP_URL` | REQUIRED (prod) | Public base URL. Used in webhook callback URLs. Falls back to `http://localhost:3000` in development. | `https://hawkeye-sterling-v2.netlify.app` |

---

## Tier 2 — Compliance Workflow (Missing = specific compliance features unavailable)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ASANA_SAR_PROJECT_GID` | REQUIRED | Project GID for STR/SAR filings (Project 01). | `1214148631336502` |
| `ASANA_TM_PROJECT_GID` | REQUIRED | Project GID for transaction monitor alerts (Project 02). | `1214148661083263` |
| `ASANA_ESCALATIONS_PROJECT_GID` | REQUIRED | Project GID for auto-escalations (Project 03). | `1214148643568798` |
| `ASANA_CF_SUBJECT_GID` | OPTIONAL | Asana custom field GID for subject name. Leave blank to skip. | From Asana API |
| `ASANA_CF_ENTITY_TYPE_GID` | OPTIONAL | Asana custom field GID for entity type. | From Asana API |
| `ASANA_CF_MODE_GID` | OPTIONAL | Asana custom field GID for screening mode. | From Asana API |
| `ASANA_CF_TOTAL_MATCHES_GID` | OPTIONAL | Asana custom field GID for match count. | From Asana API |
| `HAWKEYE_ENTITIES` | REQUIRED | JSON array of **7 reporting entities** for STR/SAR goAML submissions. Each object must have `id`, `name`, and a valid `goamlRentityId`. **`goamlRentityId` is assigned by the UAE FIU on goAML registration — it cannot be auto-generated.** Contact the FIU at goaml.uaefiu.gov.ae for each entity. Do not file live STRs while any entry reads `FIU_PENDING_*`. See `.env.example` for the full 7-slot scaffold with field documentation. | See `.env.example` |
| `HAWKEYE_DEFAULT_ENTITY_ID` | OPTIONAL | Default entity preselected on the STR/SAR form. Must match an `id` from `HAWKEYE_ENTITIES`. Defaults to first entity (`entity-01`) when unset. | `entity-01` |
| `GOAML_RENTITY_ID` | OPTIONAL | Single-entity legacy fallback. Only used when `HAWKEYE_ENTITIES` is unset. | From UAE FIU |
| `GOAML_RENTITY_BRANCH` | OPTIONAL | Branch code for single-entity fallback. | From UAE FIU |
| `GOAML_MLRO_FULL_NAME` | REQUIRED | MLRO full name embedded in every goAML XML submission. Single MLRO shared across all 7 entities. | `Luisa Fernanda` |
| `GOAML_MLRO_EMAIL` | REQUIRED | MLRO email for goAML XML submissions. | — |
| `GOAML_MLRO_PHONE` | REQUIRED | MLRO phone for goAML XML submissions. | — |

---

## Tier 3 — Sanctions List Ingestion (Missing = live list refresh unavailable; seed corpus still active)

| Variable | Required | Description |
|----------|----------|-------------|
| `UN_CONSOLIDATED_URL` | OPTIONAL | Override URL for UN SC Consolidated List XML. Defaults to official UNSC URL in code. |
| `OFAC_SDN_URL` | OPTIONAL | Override URL for OFAC SDN XML. |
| `OFAC_CONS_URL` | OPTIONAL | Override URL for OFAC Consolidated XML. |
| `EU_FSF_URL` | OPTIONAL | Override URL for EU Financial Sanctions File XML. |
| `UK_OFSI_URL` | OPTIONAL | Override URL for UK HM Treasury ConList XML. |
| `UAE_EOCN_URL` | OPTIONAL | URL for UAE EOCN Local Terrorist List. Set when MoE publishes a machine-readable endpoint. |
| `OPENSANCTIONS_API_KEY` | OPTIONAL | OpenSanctions API key for live augmentation on low-hit results. |

---

## Tier 4 — Country-Level Toggles (No key required; set =1 to activate)

These default to enabled where shown. Setting to blank disables.

| Variable | Default | List |
|----------|---------|------|
| `HMT_OFSI_ENABLED` | `1` | UK HM Treasury OFSI |
| `OFAC_SDN_ENABLED` | `1` | US OFAC SDN |
| `EU_EBA_ENABLED` | `1` | EU consolidated sanctions |
| `UN_SC_ENABLED` | `1` | UN Security Council |
| `AU_DFAT_ENABLED` | `1` | Australia DFAT |
| `CH_SECO_ENABLED` | `1` | Switzerland SECO |
| `CA_SEMA_ENABLED` | `1` | Canada SEMA |
| `NZ_DPMC_ENABLED` | `1` | New Zealand DPMC |
| `AE_EOCN_ENABLED` | `1` | UAE EOCN |
| `JP_METI_ENABLED` | `1` | Japan METI End-User List |
| `WIKIDATA_ENABLED` | `1` | Wikidata SPARQL |
| `WORLDBANK_DEBAR_ENABLED` | `1` | World Bank debarred firms |
| `FATF_ENABLED` | `1` | FATF grey/black list |
| `SEC_EDGAR_ENABLED` | `1` | US SEC EDGAR |
| `ICIJ_OFFSHORE_LEAKS_ENABLED` | `1` | ICIJ Offshore Leaks |
| `GOOGLE_NEWS_RSS_ENABLED` | `1` | Google News RSS |
| `NEWS_HTTP_PROXY` | _(unset)_ | Outbound proxy for news/feed egress only (defeats datacenter-IP 403s) |
| `NEWS_PROXY_CA` | _(unset)_ | PEM CA bundle for a TLS-intercepting news proxy |
| `NEWS_PROXY_TLS_REJECT_UNAUTHORIZED` | `true` | Set `false` to accept a trusted internal proxy's self-signed cert |
| `NEWS_RELAY_ENABLED` | _(unset)_ | `1` enables the free public-relay fallback for the keyless GDELT query (no API key / no paid proxy) |
| `NEWS_FETCH_RELAY` | _(unset)_ | Custom relay template containing `{url}` (overrides the built-in default) |

> **Datacenter-IP note (`GOOGLE_NEWS_RSS_ENABLED`):** Google News RSS frequently
> returns HTTP 403 to cloud/datacenter IPs (Netlify) regardless of User-Agent.
> If `/api/news-search/health` reports the `google_news_rss` source as
> `unreachable` in production, set `GOOGLE_NEWS_RSS_ENABLED=false` to skip the
> locale fan-out cleanly — adverse-media retrieval then leans on GDELT (keyless),
> the investigative/regional feed banks, and any keyed news-API adapters. This
> does **not** disable adverse media; it only removes a source that is 403-ing.
> Probe live reachability any time via `GET /api/news-search/health`.

> **News egress proxy (`NEWS_HTTP_PROXY`):** A cleaner fix than disabling a
> source — when the runtime egresses from a datacenter IP and feeds 403
> regardless of User-Agent, point `NEWS_HTTP_PROXY` at an outbound HTTP/HTTPS
> proxy whose egress IP is not 403'd. **Only** news/feed fetches route through
> it; the sanctions/PEP path, Netlify Blobs, Upstash Redis, Anthropic and MoonDB
> egress directly. Falls back to `HTTPS_PROXY` / `HTTP_PROXY` when unset.
> `NEWS_PROXY_CA` / `NEWS_PROXY_TLS_REJECT_UNAUTHORIZED` tune TLS for an internal
> intercepting proxy. Verify with `GET /api/news-search/health?verbose=1`: each
> source reports `via:"proxy"` and the top-level `proxy` block names the env var
> that supplied it (never the URL/credentials). If live feeds remain
> unreachable, `/api/news-search` now degrades to the most recent cached dossier
> (`fetchMode:"cached"`, `retrieval:"degraded"`) instead of a bare outage, while
> a true outage with nothing cached still surfaces as `unavailable` (FATF R.10).

> **Free relay fallback (`NEWS_RELAY_ENABLED`) — no API key, no paid proxy:**
> When you have neither a proxy nor vendor API keys, set `NEWS_RELAY_ENABLED=1`.
> If the keyless **GDELT** worldwide query is refused (403/429/451/503) from the
> deployment's IP, the request is retried once through a free public "reader"
> relay that fetches from its own clean IP and returns the raw feed — often
> defeating the datacenter-IP block at zero cost. This is **best-effort**:
> public relays are rate-limited and intermittently down, so it is no substitute
> for a residential proxy or a clean-IP host. It is applied **only** to GDELT
> (one keyless call returning up to 75 worldwide articles) — never to the
> API-key vendor adapters, which would leak credentials to a third party.
> **Governance:** with the relay on, the subject *name* transits a third-party
> service — enable only where that fits your data-handling policy. Override the
> relay with `NEWS_FETCH_RELAY=https://your-relay/?url={url}` to use a relay you
> control. Confirm status in `GET /api/news-search/health` → `relay.enabled`.

---

## Tier 5 — Optional Intelligence Vendors (Missing = that vendor's data unavailable)

See `.env.example` for the complete list (~80 keys). Priority keys for UAE DPMS compliance:

| Variable | Vendor | Purpose |
|----------|--------|---------|
| `COMPLYADVANTAGE_API_KEY` | ComplyAdvantage | PEP + sanctions enhanced screening |
| `LSEG_WC1_MCP_URL` | LSEG World-Check One MCP | MCP HTTP endpoint for local WC1 server (takes priority over REST key) |
| `LSEG_WORLDCHECK_API_KEY` / `LSEG_WORLDCHECK_API_SECRET` | LSEG World-Check | Commercial PEP/sanctions (direct REST — use MCP server when available) |
| `ALEPH_API_KEY` | OCCRP Aleph | Investigative journalism / leaks |
| `OPENSANCTIONS_PRO_API_KEY` | OpenSanctions Pro | Commercial grade list access |
| `CHAINALYSIS_API_KEY` | Chainalysis | Crypto on-chain risk |
| `ONFIDO_API_KEY` | Onfido | Document + biometric KYC |
| `UAE_DED_API_KEY` | UAE DED Dubai | UAE corporate registry |

---

## Tier 6 — Infrastructure (Missing = feature degrades, not compliance failure)

| Variable | Required | Description |
|----------|----------|-------------|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | OPTIONAL | Atomic rate limiting. Without it, rate limiting falls back to Netlify Blobs (soft-enforced). |
| `HAWKEYE_WEBHOOK_URL` / `HAWKEYE_WEBHOOK_SECRET` | OPTIONAL | Outbound delta-alert webhooks to customer systems. |
| `COMPLIANCE_RAG_URL` | OPTIONAL | AML-MultiAgent-RAG instance URL for regulatory Q&A. Falls back to MLRO Advisor pipeline. |

---

## Tier 7 — Compliance / Retention (Missing = 10-year audit chain durability gap — CG-6)

These variables are required by `netlify/functions/audit-chain-s3-backup.mts` to mirror the
tamper-evident audit chain to an S3-compatible WORM store for FDL 10/2025 Art. 24 compliance.
Without them, audit records are retained only in Netlify Blobs (no guaranteed 10-year durability).

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `S3_BACKUP_ENDPOINT` | REQUIRED (CG-6) | S3-compatible endpoint URL. AWS S3, Cloudflare R2, MinIO, or any S3-API-compatible store. | `https://s3.me-south-1.amazonaws.com` |
| `S3_BACKUP_BUCKET` | REQUIRED (CG-6) | Bucket name. Must have object-lock / WORM mode enabled with a ≥10-year retention policy. | `hawkeye-audit-chain-worm` |
| `S3_BACKUP_REGION` | REQUIRED (CG-6) | AWS region for SigV4 signing. Default: `me-south-1` (UAE/Bahrain — recommended for data residency). | `me-south-1` |
| `S3_BACKUP_ACCESS_KEY_ID` | REQUIRED (CG-6) | IAM access key ID. Use a least-privilege IAM role with `s3:PutObject` only on the backup bucket. | From AWS IAM |
| `S3_BACKUP_SECRET_KEY` | REQUIRED (CG-6) | IAM secret access key. Rotate annually per SOC2 CC6.1. | From AWS IAM |

---

## Netlify Context Mapping

| Context | NODE_ENV | Notes |
|---------|----------|-------|
| production | `production` | All REQUIRED vars must be set |
| deploy-preview | `production` | Use test/sandbox API keys |
| branch-deploy | `development` | Full stack available but not for compliance decisions |

---

## Quick-Start Minimum (local development)

```bash
# Minimum set to run the portal locally with no external calls:
SESSION_SECRET=dev-only-change-in-prod-$(openssl rand -hex 8)
ADMIN_TOKEN=dev-only-$(openssl rand -hex 8)
AUDIT_CHAIN_SECRET=dev-only-$(openssl rand -hex 16)
ANTHROPIC_API_KEY=sk-ant-...
ASANA_TOKEN=...
ASANA_WORKSPACE_GID=1213645083721316
ASANA_PROJECT_GID=1214148630166524
ASANA_ASSIGNEE_GID=1213645083721304
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
