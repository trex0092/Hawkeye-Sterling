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

---

## Tier 1 — Core Platform (Missing = core functionality broken)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | REQUIRED | Powers all Claude AI features (MLRO advisor, narrative reports, adverse-media analysis, screening verdicts). | `sk-ant-...` |
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
| `HAWKEYE_ENTITIES` | REQUIRED | JSON array of reporting entities for STR/SAR goAML submissions. Each must have a valid `goamlRentityId`. | See `.env.example` |
| `HAWKEYE_DEFAULT_ENTITY_ID` | OPTIONAL | Default entity selected on STR/SAR form. Defaults to first entity in `HAWKEYE_ENTITIES`. | `entity-01` |
| `GOAML_RENTITY_ID` | OPTIONAL | Single-entity legacy fallback. Only used when `HAWKEYE_ENTITIES` is unset. | From UAE FIU |
| `GOAML_RENTITY_BRANCH` | OPTIONAL | Branch code for single-entity fallback. | From UAE FIU |
| `GOAML_MLRO_FULL_NAME` | REQUIRED | MLRO full name for goAML XML submissions. | `Luisa Fernanda` |
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
