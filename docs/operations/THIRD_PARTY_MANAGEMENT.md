# Third-Party Management — Data Source Vendor Register

**Document ID:** HS-OPS-003  
**Version:** 1.0.0  
**Effective Date:** 2026-06-09  
**Review Cycle:** Annual; updated on any data source addition, removal, or SLA change  
**Owner:** Engineering Lead (primary); MLRO (compliance gate)  
**Classification:** Restricted — Internal Compliance and Operations Use Only  
**ISO 42001 Reference:** Annex A.6.2.3 (AI system inventory — third-party dependencies); Clause 8.4 (supply chain risk)

---

## Purpose

This document is the authoritative register of all third-party data sources and service providers that feed into or support the Hawkeye Sterling AML/CFT AI platform. It ensures that vendor relationships are assessed, monitored, and managed in accordance with ISO/IEC 42001:2023 requirements and UAE FDL 10/2025 obligations.

**Regulatory Basis:**

| Instrument | Relevance |
|---|---|
| UAE FDL 10/2025, Art. 24 | Data source provenance must be traceable and auditable |
| UAE FDL 20/2018, Art. 18 | Third-party data used in CDD/screening must meet reliability standards |
| FATF R.1 | Risk-based approach — data quality directly determines screening efficacy |
| Cabinet Decision No. 74 of 2020 | Sanctions list freshness is a legal obligation |
| ISO/IEC 42001:2023 Clause 8.4 | Supply chain risk management for AI systems |

---

## Vendor Risk Classification

| Risk Class | Description | Controls Required |
|---|---|---|
| **CRITICAL** | Data source failure directly prevents sanctions screening; breach would constitute regulatory non-compliance | Freshness monitoring; automated alerts; MLRO notification within 1 hour of failure; seed corpus fallback |
| **HIGH** | Data source failure degrades screening quality or adverse-media coverage; breach increases risk of missed hits | Freshness monitoring; automated alerts; MLRO notification within 4 hours |
| **MEDIUM** | Data source enhances screening but is not the sole source for a category; failure reduces coverage | Health monitoring; Engineering Lead notification; 24-hour remediation target |
| **LOW** | Supplementary or infrastructure service; failure has limited immediate compliance impact | Standard availability monitoring |

---

## Vendor Register

### V-001: OpenSanctions (PEP and Sanctions Data)

| Field | Value |
|---|---|
| Vendor | OpenSanctions (openSanctions.org) |
| Data Source ID | DS-007 (PEP), contributes to DS-001 through DS-006 |
| Risk Class | CRITICAL |
| Service | Open-source PEP database + sanctions data aggregator covering 240+ jurisdictions |
| Access Method | REST API + CSV/JSON download |
| Refresh Cadence | Daily |
| SLA Target | Data ≤ 24 hours old at time of screening |
| SLA Breach Action | Stale alert fires; MLRO notification within 1 hour; seed corpus fallback activates |
| Contingency | Seed corpus of last-known-good snapshot retained in Netlify Blobs; `candidates-loader.ts` auto-fallback |
| Data Processing Agreement | Reviewed 2026-05-06 — public data; no PII transmitted to OpenSanctions |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

### V-002: UN Security Council (Consolidated List)

| Field | Value |
|---|---|
| Vendor | United Nations Security Council |
| Data Source ID | DS-001 |
| Risk Class | CRITICAL |
| Service | UN Security Council Consolidated List (UNSCR 1267/1989 Committee and others) |
| Access Method | XML download from `scsanctions.un.org` |
| Refresh Cadence | Daily |
| SLA Target | Data ≤ 24 hours old; PGP signature verified; XSD schema validated |
| SLA Breach Action | CRITICAL incident; block screening until resolved; MLRO notification within 1 hour |
| Contingency | Last validated snapshot retained; seed corpus fallback; manual MLRO review for high-risk cases |
| Validation | PGP signature verification; XSD schema validation; MD5 checksum; record count sanity |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

### V-003: OFAC (SDN and Consolidated Lists)

| Field | Value |
|---|---|
| Vendor | US Department of the Treasury — Office of Foreign Assets Control |
| Data Source IDs | DS-002 (SDN), DS-003 (Consolidated) |
| Risk Class | CRITICAL |
| Service | OFAC Specially Designated Nationals (SDN) List; OFAC Consolidated List |
| Access Method | XML download from `ofac.treas.gov` |
| Refresh Cadence | Daily |
| SLA Target | Data ≤ 24 hours old; XML validated |
| SLA Breach Action | CRITICAL incident; block screening until resolved; MLRO notification within 1 hour |
| Contingency | Last validated snapshot retained; seed corpus fallback |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

### V-004: European Union (EU Consolidated Financial Sanctions List)

| Field | Value |
|---|---|
| Vendor | European Union — Official Journal |
| Data Source ID | DS-004 |
| Risk Class | CRITICAL |
| Service | EU Consolidated Financial Sanctions List |
| Access Method | XML download from EU Official Journal |
| Refresh Cadence | Daily |
| SLA Target | Data ≤ 24 hours old |
| SLA Breach Action | HIGH incident; MLRO notification within 4 hours |
| Contingency | Last validated snapshot retained |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

### V-005: UK OFSI (UK Consolidated Sanctions List)

| Field | Value |
|---|---|
| Vendor | UK Office of Financial Sanctions Implementation (OFSI) |
| Data Source ID | DS-005 |
| Risk Class | HIGH |
| Service | UK OFSI Consolidated List |
| Access Method | XML download |
| Refresh Cadence | Daily |
| SLA Target | Data ≤ 24 hours old |
| SLA Breach Action | HIGH incident; MLRO notification within 4 hours |
| Contingency | Last validated snapshot retained |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

### V-006: UAE National Security Council (EOCN and Local Terrorist List)

| Field | Value |
|---|---|
| Vendor | UAE National Security Council |
| Data Source ID | DS-006 |
| Risk Class | CRITICAL |
| Service | UAE EOCN List; UAE Local Terrorist List |
| Access Method | PDF download (Phase 2 XML parser pending) |
| Refresh Cadence | Weekly |
| SLA Target | Data ≤ 7 days old; dual-review on PDF extraction |
| SLA Breach Action | CRITICAL incident; MLRO notification within 1 hour |
| Known Gap | PDF format requires manual extraction; risk of transcription error — DQR-001 in Data Quality Risk Register |
| Contingency | Last validated snapshot; MLRO manual monitoring of official NSSA channel |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

### V-007: NewsAPI (Adverse Media)

| Field | Value |
|---|---|
| Vendor | NewsAPI.org |
| Data Source ID | DS-008 |
| Risk Class | HIGH |
| Service | Commercial news aggregator — real-time adverse media search |
| Access Method | REST API (`NEWSAPI_KEY` env) |
| Refresh Cadence | Real-time (on-demand query) |
| SLA Target | Response ≤ 5 minutes |
| SLA Breach Action | HIGH incident; Engineering Lead notification within 4 hours; fallback to GDELT + RSS |
| Data Processing Agreement | Reviewed 2026-05-06 — article metadata only; no bulk PII storage |
| Known Gap | Articles older than 30 days not accessible via free/standard API tier (DQR-007) |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

### V-008: GDELT (Global Database of Events, Language, and Tone)

| Field | Value |
|---|---|
| Vendor | GDELT Project (academic open-source) |
| Data Source ID | DS-009 |
| Risk Class | MEDIUM |
| Service | Global event database — adverse media signals |
| Access Method | REST query (public API) |
| Refresh Cadence | Every 15 minutes |
| SLA Target | Response ≤ 15 minutes; circuit breaker protects against brownouts |
| SLA Breach Action | MEDIUM incident; circuit breaker engages automatically; Engineering Lead notification within 24 hours |
| Circuit Breaker | `web/lib/server/circuitBreaker.ts` — trips at 5 failures; exponential cooldown; stale-Redis fallback |
| Known Gap | High false-positive rate for geopolitical events (DQR-006); corroboration from DS-008/DS-010 required |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

### V-009: Google Custom Search Engine (CSE)

| Field | Value |
|---|---|
| Vendor | Google LLC |
| Data Source ID | DS-010 |
| Risk Class | MEDIUM |
| Service | Commercial web search — adverse media discovery |
| Access Method | REST API (`GOOGLE_CSE_KEY` env) |
| Refresh Cadence | Real-time (on-demand) |
| SLA Target | Response ≤ 5 minutes |
| SLA Breach Action | MEDIUM incident; fallback to NewsAPI + GDELT; Engineering Lead notification within 24 hours |
| Data Processing | Read-only query; no bulk data stored with Google |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

### V-010: Netlify (Hosting, Blob Storage, Scheduled Functions)

| Field | Value |
|---|---|
| Vendor | Netlify, Inc. |
| Risk Class | CRITICAL |
| Service | Serverless hosting; Netlify Blobs (audit chain + sanctions snapshots storage); scheduled functions (cron jobs) |
| Access Method | Platform SDK (`@netlify/blobs`) |
| SLA Target | 99.99% uptime (Enterprise tier); Blobs ≤ 5-min recovery with seed corpus fallback |
| SLA Breach Action | CRITICAL incident if Blobs unavailable > 36 hours (stale threshold); seed corpus fallback activates automatically |
| Data Residency | Customer-selected region; Enterprise deployments can specify UAE/ME-Central |
| Data Processing Agreement | Netlify DPA accepted — governs PII processing for hosting |
| Backup | Nightly S3-compatible backup via `netlify/functions/audit-chain-s3-backup.mts` |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

### V-011: Anthropic (LLM Provider)

| Field | Value |
|---|---|
| Vendor | Anthropic, PBC |
| Risk Class | HIGH |
| Service | Claude LLM — primary AI reasoning and narrative generation |
| Access Method | REST API (`ANTHROPIC_API_KEY` env); `src/integrations/model-router.ts` |
| SLA Target | API availability ≥ 99.9%; response ≤ 30s per request |
| SLA Breach Action | HIGH incident; degrade to deterministic rule-based output; Groq fallback if configured; MLRO notification if unavailable > 30 min |
| Model Version Control | All models registered in `MODEL_REGISTRY` with `riskTier`, `approval`, `cardRef`; version changes = Major change |
| Data Processing | Prompts include operational data (not subject PII beyond necessary for screening); reviewed under UAE PDPL |
| Last Reviewed | 2026-06-09 |
| Next Review | 2027-06-09 |

---

## Vendor Review Process

1. **Annual Review:** Engineering Lead reviews all vendor entries for SLA compliance, data quality incidents, and DPA status. Any material changes are submitted as governance committee agenda items.
2. **Incident Review:** Any vendor SLA breach that results in a HIGH or CRITICAL incident triggers an expedited vendor review within 10 business days of incident closure.
3. **New Vendor Onboarding:** Adding a new data source is treated as a Major change requiring MLRO approval and an entry in this register before integration.
4. **Vendor Removal:** Removing a data source is treated as a Major change requiring MLRO approval and an update to this register and `docs/data-governance/DATA_LINEAGE.md`.

---

## Document Control

| Field | Value |
|---|---|
| Document ID | HS-OPS-003 |
| Version | 1.0.0 |
| Created | 2026-06-09 |
| Next mandatory review | 2027-06-09 |
| Approver (Engineering Lead) | [Signature required] |
| Approver (MLRO) | [Signature required] |
| Related documents | `docs/data-governance/DATA_LINEAGE.md`, `docs/governance/AI_INVENTORY.md`, `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md` |
| Regulatory references | UAE FDL 10/2025 Art. 24; FATF R.1; ISO/IEC 42001:2023 Clause 8.4 |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
