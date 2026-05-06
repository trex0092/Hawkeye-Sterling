# AI System Inventory
## Hawkeye Sterling — Version 1.0

**Document ID:** HS-GOV-002
**Version:** 1.0
**Effective Date:** [DATE OF ADOPTION]
**Next Review:** Quarterly (1st of each quarter) + on every new system deployment
**Owner:** Compliance Officer
**Approved by:** MLRO

---

## 1. Inventory Scope

This document registers every AI system deployed within or integrated into Hawkeye Sterling as of May 6, 2026. It is a living document. Any deployment of a new AI system, or material change to an existing one, requires an update to this inventory and governance board approval before go-live.

**Total registered systems:** 5
**Production:** 4
**Pilot:** 1
**Development/Deprecated:** 0

---

## 2. System Registry

| System ID | System Name | Type | Version | Stage | Deployed | Last Updated | Lifecycle |
|---|---|---|---|---|---|---|---|
| HS-001 | Subject Screening Engine | Cognitive multi-modal | 2.3.1 | Production | 2026-01-15 | 2026-05-01 | Monitor |
| HS-002 | Reasoning Mode Executor | Logic orchestrator | 2.3.1 | Production | 2026-01-15 | 2026-05-01 | Monitor |
| HS-003 | Adverse Media Detector | Classification + retrieval | 2.3.1 | Production | 2026-02-01 | 2026-05-01 | Monitor |
| HS-004 | MLRO Auto-Dispositioner | Advisory (LLM-backed) | 1.0.0 | Pilot | 2026-03-15 | 2026-03-15 | Evaluate |
| HS-005 | STR/SAR Narrative Generator | Text generation (LLM-backed) | 1.2.1 | Production | 2026-02-15 | 2026-04-20 | Monitor |

---

## 3. System Detail Records

### HS-001 — Subject Screening Engine

| Field | Value |
|---|---|
| System ID | HS-001 |
| Full Name | Subject Screening Engine |
| Version | 2.3.1 |
| Stage | Production |
| Risk Level | High (financial/regulatory decisions) |
| Regulatory Classification | High-risk (EU AI Act Art. 6) |
| Model Card | `docs/model-cards/HS-001-screening.md` |

**Purpose:** Orchestrates the full screening pipeline for a named subject (person, entity, vessel, aircraft). Takes subject identifiers as input, runs multi-source evidence collection (sanctions lists, PEP database, adverse media), routes through the Reasoning Mode Executor (HS-002), and produces a structured verdict with full reasoning chain and audit trail.

**Approved use cases:**
- First-screening on customer onboarding
- Daily monitoring on existing customer portfolios
- Escalation screening from transaction monitoring alerts
- Batch screening via `POST /api/agent/batch-screen`

**Out-of-scope use cases (never permitted):**
- Automated customer rejection without MLRO review
- Automated asset freeze without MLRO approval
- Real-time KYC at point-of-sale without human oversight
- Credit scoring or insurance underwriting
- Use outside UAE jurisdiction without additional legal review

**Primary users:** MLRO, Compliance Officers, Front Office (read-only access)

**Key source files:**
- `web/app/api/agent/screen/route.ts` — primary endpoint (`POST /api/agent/screen`)
- `web/app/api/agent/stream-screen/route.ts` — SSE streaming (`GET /api/agent/stream-screen`)
- `web/app/api/agent/batch-screen/route.ts` — batch processing
- `src/brain/engine.ts` — cognitive orchestrator
- `src/brain/weaponized.ts` — system prompt composer (charter + faculties + modes)

**Data inputs:**
- Subject name, aliases, nationality, DOB, passport, entity identifiers
- Sanctions lists (6 sources, refreshed daily)
- PEP database (OpenSanctions, refreshed weekly)
- Adverse media (NewsAPI + GDELT + Google CSE + RSS, refreshed 30 min)

**Data outputs:**
- Structured `BrainVerdict` JSON: findings[], chain[], recommendedActions[], CognitiveDepth
- HMAC-sealed audit trail entry (Netlify Blobs)
- Asana task (project 00 · Master Inbox, assigned to MLRO)
- Optional: STR draft preview

**Monitoring:**
- Uptime: Netlify platform monitoring + `netlify/functions/warm-pool.mts` (every 4 min)
- Calibration: `GET /api/mlro/brier` (hourly Brier score)
- Drift: `GET /api/mlro/drift-alerts` + `src/brain/drift-alerts.ts`
- Mode performance: `GET /api/mlro/mode-performance`
- Sanctions list freshness: `GET /api/sanctions/status`
- Audit chain integrity: `GET /api/audit/verify` + `netlify/functions/audit-chain-probe.mts` (hourly)

---

### HS-002 — Reasoning Mode Executor

| Field | Value |
|---|---|
| System ID | HS-002 |
| Full Name | Reasoning Mode Executor |
| Version | 2.3.1 |
| Stage | Production |
| Risk Level | High (feeds directly into HS-001 verdicts) |
| Regulatory Classification | High-risk (component of HS-001) |
| Model Card | `docs/model-cards/HS-002-reasoning.md` |

**Purpose:** Executes the registered reasoning modes against the evidence context assembled by HS-001. Each mode is a named, versioned, hashable function with a declared faculty, category, and callable `apply(ctx)` method. The executor manages mode selection, parallel execution, result aggregation, and the introspection meta-reasoning pass.

**Reasoning mode inventory:**

| Wave | Modes | Status |
|---|---|---|
| Wave 1+2 (core registry) | 273 modes across 18 categories | Production |
| Wave 3 (intelligence expansion) | 100+ modes across 10 typology clusters | Production, wired into MODE_OVERRIDES |

**Category breakdown (Wave 1+2):**
Logic (21), Cognitive Science (22), Decision Theory (15), Forensic (37), Compliance Framework (30), Legal Reasoning (10), Strategic (10), Causal (5), Statistical (18), Graph Analysis (10), Threat Modeling (14), Behavioral Signals (5), Data Quality (10), Governance (16), Crypto/DeFi (16), Sectoral Typology (24), OSINT (6), ESG (4)

**Wave 3 typology clusters:**
Sanctions/Proliferation (10 modes), TBML (9), Crypto (17), Trade/Cargo (3), DPMS/Sectoral (10), Network/Professional (3), Banking (2), UBO/Structures (8), PEP/Corruption (7), Predicate Offences (8), TF/NPO (1), KYC/Identity (9), Behavioral (10), Securities/Insurance (6)

**Introspection meta-pass:** After all modes run, the executor performs a self-audit producing meta-findings for: cross-category contradiction, under-triangulation (< 3 faculties engaged), over-confidence on zero-score, and calibration collapse (σ < 0.05).

**Key source files:**
- `src/brain/reasoning-modes.ts` — 273-mode registry
- `src/brain/engine.ts` — orchestrator and CognitiveDepth metrics
- `src/brain/faculties.ts` — 10 faculties with synonym clusters
- `src/brain/types.ts` — domain model (BrainVerdict, Finding, ChainEntry)

**Mode version pinning:** Every mode carries version (semver), deployedDate (ISO 8601), contentHash (SHA-256), author, and approvedBy. Changes require governance approval before merge.

---

### HS-003 — Adverse Media Detector

| Field | Value |
|---|---|
| System ID | HS-003 |
| Full Name | Adverse Media Detector |
| Version | 2.3.1 |
| Stage | Production |
| Risk Level | High (informs MLRO risk decisions) |
| Regulatory Classification | High-risk (component of HS-001) |
| Model Card | `docs/model-cards/HS-003-adverse-media.md` |

**Purpose:** Searches multiple real-time news and media sources for adverse information about a subject across five risk categories. Returns structured findings with source citations for inclusion in the screening verdict.

**Five-category taxonomy:**
1. Money Laundering & Financial Crime
2. Terrorist Financing
3. Proliferation Financing
4. Corruption, Bribery & Organised Crime
5. Legal, Criminal & Regulatory Proceedings

**Data sources:**

| Source | Coverage | Refresh | Key endpoint |
|---|---|---|---|
| NewsAPI | 120+ global news outlets | Every 30 min | `GET /api/news-search` |
| GDELT | Geopolitical event database | Every 30 min | `netlify/functions/adverse-media-rss.mts` |
| Google Custom Search | Regulatory filings, official sources | On demand | Via GOOGLE_CSE_ID + GOOGLE_CSE_KEY |
| Direct RSS | Sector-specific and regional feeds | Every 30 min | `netlify/functions/adverse-media-rss.mts` |

**Known limitations:**
- Paywalled content is not indexed
- Local-language outlets underrepresented (mitigation: Arabic/CJK normalisation in Phase 3)
- False positive rate approximately 3.2% (non-AML news tagged as AML) — all results presented to MLRO as indicators, not findings

**Key source files:**
- `src/brain/adverse-media.ts` — taxonomy, keywords, compiled boolean query
- `netlify/functions/adverse-media-rss.mts` — scheduled ingestion

---

### HS-004 — MLRO Auto-Dispositioner

| Field | Value |
|---|---|
| System ID | HS-004 |
| Full Name | MLRO Auto-Dispositioner |
| Version | 1.0.0 |
| Stage | **PILOT — enhanced human oversight required** |
| Risk Level | Very High (advisory on regulatory filing decisions) |
| Regulatory Classification | High-risk (EU AI Act Art. 6) — human oversight mandatory |
| Model Card | `docs/model-cards/HS-004-mlro-dispositioner.md` |

**Purpose:** Advisory system that suggests a disposition (escalate to STR / dismiss / request more information) based on the full screening verdict from HS-001. This is a suggestion only — the MLRO must review and approve every disposition before any action is taken.

**CRITICAL governance constraints:**
- This system is in PILOT status. No production decisions are made without MLRO human sign-off.
- Confidence ≤ 65% — system always outputs "ESCALATE — human review required" regardless of suggested disposition.
- The system cannot and does not submit STRs, file with goAML, or freeze assets autonomously.
- Every suggestion from this system is logged to the audit chain before MLRO review.

**Powered by:** Anthropic Claude (model configured via `EXECUTOR_MODEL` / `ADVISOR_MODEL` env vars, currently `claude-sonnet-4-6` / `claude-opus-4-7`)

**Graduation criteria to Production:**
- Minimum 500 MLRO-reviewed cases with tracked outcomes
- Precision ≥ 95% on escalation recommendations
- False negative rate (missed STR cases) ≤ 0.5%
- External audit of decision quality
- Governance board vote

---

### HS-005 — STR/SAR Narrative Generator

| Field | Value |
|---|---|
| System ID | HS-005 |
| Full Name | STR/SAR Narrative Generator |
| Version | 1.2.1 |
| Stage | Production |
| Risk Level | High (outputs used in regulatory filings) |
| Regulatory Classification | High-risk (EU AI Act Art. 6) |
| Model Card | `docs/model-cards/HS-005-narrative.md` |

**Purpose:** Generates structured STR/SAR narrative text from the screening verdict and MLRO's case notes. The narrative follows the UAE FIU goAML XML schema. MLRO reviews and approves the draft before submission. After MLRO approval, the system submits via `POST /api/goaml/auto-submit`.

**Compliance charter enforcement:** All outputs are generated under the P1–P10 absolute prohibitions from `src/policy/systemPrompt.ts`. The compliance charter is prepended to every API call and cannot be bypassed.

**goAML integration:**
- Multi-entity support via `HAWKEYE_ENTITIES` JSON array (up to 7 UAE entities)
- Each entity has a `goamlRentityId` assigned by the UAE FIU on registration
- MLRO identity (`GOAML_MLRO_FULL_NAME`, `GOAML_MLRO_EMAIL`, `GOAML_MLRO_PHONE`) shared across all entities
- Auto-submit endpoint: `POST /api/goaml/auto-submit`

**Human oversight requirement:** No STR is submitted without explicit MLRO sign-off via the STR draft preview UI (`web/components/screening/StrDraftPreview.tsx`).

---

## 4. Data Sources Registry

| Source | Type | Authority | Refresh | Endpoint / Function | Status |
|---|---|---|---|---|---|
| UN Consolidated Sanctions List | Sanctions | UN Security Council | Daily 4am UTC | `netlify/functions/sanctions-ingest.mts` | Active |
| OFAC SDN | Sanctions | US Treasury (OFAC) | Daily 4am UTC | `netlify/functions/sanctions-ingest.mts` | Active |
| OFAC Consolidated Non-SDN | Sanctions | US Treasury (OFAC) | Daily 4am UTC | `netlify/functions/sanctions-ingest.mts` | Active |
| EU Financial Sanctions Files | Sanctions | EU External Action Service | Daily 4am UTC | `netlify/functions/sanctions-ingest.mts` | Active |
| UK OFSI Consolidated List | Sanctions | HM Treasury OFSI | Daily 4am UTC | `netlify/functions/sanctions-ingest.mts` | Active |
| UAE EOCN Sanctions List | Sanctions | UAE EOCN | Daily 4am UTC | `netlify/functions/sanctions-ingest.mts` | Active — URL via `UAE_EOCN_URL` env var |
| UAE Local Terrorist List | Sanctions | UAE Cabinet | Daily 4am UTC | `netlify/functions/sanctions-ingest.mts` | Active |
| OpenSanctions PEP | PEP | OpenSanctions.org | Weekly | `netlify/functions/pep-refresh.mts` | Active — requires `OPENSANCTIONS_API_KEY` |
| NewsAPI | Adverse media | NewsAPI | Every 30 min | `netlify/functions/adverse-media-rss.mts` | Active — requires `NEWSAPI_KEY` |
| GDELT | Adverse media | GDELT Project | Every 30 min | `netlify/functions/adverse-media-rss.mts` | Active — requires `GDELT_API_KEY` |
| Google Custom Search | Adverse media | Google | On demand | `GOOGLE_CSE_ID` + `GOOGLE_CSE_KEY` | Active — optional upgrade |
| Goods Control List | Trade controls | [Authority TBC] | Every 6h | `netlify/functions/goods-control-ingest.mts` | Active |

Health surface: `GET /api/sanctions/status` returns per-list snapshot freshness + configuration status (booleans only — no secrets).

---

## 5. Integration Registry

| Integration | Purpose | Authentication | Status |
|---|---|---|---|
| Asana (HAWKEYE STERLING V2 team) | Task delivery (screening inbox, STR/SAR, TM alerts, escalations) | `ASANA_TOKEN` (PAT) | Active |
| Anthropic Claude API | LLM reasoning (HS-004, HS-005, narrative, MLRO advisor) | `ANTHROPIC_API_KEY` | Active |
| Netlify Blobs | Audit chain persistence, sanctions cache, feedback journal | Platform-native | Active |
| goAML (UAE FIU) | STR/SAR auto-submission | `GOAML_RENTITY_ID` per entity | Active — FIU IDs required |
| Moov Watchman | OFAC cross-validation (optional) | `WATCHMAN_URL` | Optional |
| Checkmarble Marble | AML decision engine (optional) | `MARBLE_API_URL` + `MARBLE_API_KEY` | Optional |
| Jube AML | ML-based risk scoring (optional) | `JUBE_API_URL` | Optional |
| Upstash Redis | Atomic rate limiting (optional, upgrades from Netlify Blobs soft-limit) | `UPSTASH_REDIS_REST_URL` + token | Optional |

---

## 6. Lifecycle Management

### 6.1 Lifecycle Stages

| Stage | Definition | Governance Requirement |
|---|---|---|
| Plan | Design and specification | Governance board approval to proceed |
| Develop | Implementation and testing | Data Science review + MLRO compliance review |
| Evaluate | Pilot deployment with enhanced oversight | Board-approved success criteria defined |
| Deploy | Full production | Board vote + external review recommended |
| Monitor | Ongoing production | Weekly governance committee + drift alerts |
| Decommission | End of life | Board vote + data retention plan + migration plan |

### 6.2 HS-004 Graduation Plan

HS-004 (MLRO Auto-Dispositioner) will be evaluated for graduation from Pilot to Production after:

- 500 MLRO-reviewed cases with outcome tracking (target: Q3 2026)
- Precision ≥ 95% sustained over 90 days
- External review of decision quality
- Governance board vote

---

## 7. Inventory Maintenance

This inventory is updated:
- On every new AI system deployment (before go-live)
- On every version bump to an existing system
- Quarterly as part of the governance review
- Annually as part of the certification

**Last updated:** 2026-05-06
**Updated by:** Compliance Officer
**Approved by:** MLRO

**Next scheduled review:** 2026-08-01 (quarterly)
