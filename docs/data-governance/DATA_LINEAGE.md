# Hawkeye Sterling — Data Lineage Document

**Document ID:** DG-001  
**Version:** 1.0.0  
**Effective Date:** 2026-05-10  
**Owner:** Data Science Lead  
**Reviewer:** MLRO  
**Classification:** Internal — Compliance Sensitive  
**Next Review:** 2027-05-10

---

## 1. Purpose

This document maps all data sources ingested by Hawkeye Sterling for AML/CFT/sanctions/PEP/adverse-media screening. It records authority, refresh frequency, format, validation checks (PGP, XSD, MD5), quality SLAs, retention policy, and known limitations for each source. Required under UAE FDL 10/2025 Art.24 (10-year tamper-evident record-keeping) and UAE PDPL (Federal Decree-Law No. 45/2021).

---

## 2. Data Source Inventory

### 2.1 Sanctions Lists

| Source | Authority | Refresh Frequency | Format | Validation | SLA | Known Limitations |
|--------|-----------|-------------------|--------|------------|-----|-------------------|
| **UN Consolidated List** | UN Security Council (UNSC 1267/1988/2253) | Daily (0400 UTC) | XML | PGP signature, XSD schema, SHA-256 checksum | 99.5% uptime; alert if not refreshed within 6h | Delays between UNSC resolution and list publication (typically 24–48h) |
| **OFAC SDN + Consolidated** | US Treasury / OFAC | Daily (0500 UTC) | XML + CSV | PGP, MD5, field-count validation | Alert if stale >24h; SANCTIONS_CRON_TOKEN guards cron | US nexus only; no automatic cross-border freeze |
| **EU Consolidated Financial Sanctions** | EU Council / EEAS | Daily (0600 UTC) | XML | XSD, PGP | Alert if stale >24h | Amendments sometimes lag EU Official Journal by 4–8h |
| **UK OFSI Consolidated List** | HM Treasury / OFSI | Daily (0700 UTC) | CSV + XML | MD5, field-count | Alert if stale >24h | Post-Brexit divergence from EU list — separate verification required |
| **UAE EOCN Local Terrorist List** | UAE National Security Council (EOCN) | Weekly (Monday 0800 GST) | XML/JSON (via EOCN API) | HMAC, XSD | Alert if stale >7d | No public diff feed — full-list refresh only |
| **UAE DPMS High-Risk Sectors** | UAE Ministry of Economy | Monthly | PDF → parsed CSV | Manual review, MD5 | Monthly refresh | PDF parsing errors possible; manual spot-check required |

### 2.2 PEP Lists

| Source | Authority | Refresh Frequency | Format | Validation | SLA | Known Limitations |
|--------|-----------|-------------------|--------|------------|-----|-------------------|
| **OpenSanctions PEP** | OpenSanctions (Wikidata + government sources) | Daily (0300 UTC) | JSON (FtM schema) | SHA-256, FtM schema validation | Alert if stale >24h | Coverage gaps for lower-level officials; Wikidata lag 24–72h |
| **GDELT PEP Signals** | GDELT Project (academic/open) | 15-minute intervals | CSV/JSON | Checksum, deduplication | 95% freshness SLA | High noise; adversarial media not filtered; requires ML triage |
| **Commercial PEP Feed** | Thomson Reuters WorldCheck (optional) | Real-time API | JSON | TLS, API authentication | Per-SLA contract | Requires commercial licence; API quota limits |

### 2.3 Adverse Media Sources

| Source | Authority | Refresh Frequency | Format | Validation | SLA | Known Limitations |
|--------|-----------|-------------------|--------|------------|-----|-------------------|
| **NewsAPI** | Commercial (newsapi.org) | Real-time (on-demand query) | JSON | HTTPS, API key authentication | 99.9% per contract | Paywalled articles not retrieved; English/French/Arabic coverage only |
| **GDELT News** | GDELT Project (academic) | 15-minute ingest | CSV/JSON | Checksum, deduplication | 95% freshness | High noise; requires adverseMediaML triage layer |
| **Google Custom Search Engine (CSE)** | Google LLC | Real-time (on-demand query) | JSON | HTTPS, API key | 99.9% per contract | Rate-limited (100 queries/day free tier); geographic bias |
| **RSS Feed Aggregator** | Various media outlets | 30-minute polling | Atom/RSS XML | XML validation, deduplication | 95% uptime | Local-language outlets under-represented; duplicate detection imperfect |
| **Netlify Blobs Adverse Media Cache** | Internal | Per-ingest | JSON | HMAC signature per entry | N/A | Cache not a source of truth — augments live queries |

### 2.4 Corporate Registry Sources

| Source | Authority | Refresh Frequency | Format | Validation | SLA | Known Limitations |
|--------|-----------|-------------------|--------|------------|-----|-------------------|
| **Companies House (UK)** | UK Government / HMRC | On-demand API | JSON | HTTPS, API key | 99% uptime | Free API rate-limited; bulk downloads available monthly |
| **SEC EDGAR (US)** | US Securities & Exchange Commission | Daily + on-demand | SGML/JSON | HTTPS | 99.5% uptime | US public companies only |
| **GLEIF (LEI)** | Global LEI Foundation | Daily | JSON | Checksum, JSON schema | Alert if stale >24h | Voluntary system; not all entities have LEI |
| **UAE Ministry of Economy** | UAE MoE | Weekly | API/CSV | HMAC | Monthly full refresh | Limited API coverage; manual review for complex structures |
| **Abu Dhabi / Dubai Trade Licences** | ADCCI / DED | On-demand | PDF → parsed | Manual + regex | N/A | PDF parsing unreliable; cross-emirate inconsistency |

---

## 3. Data Quality Gates

All ingested data passes through a validation pipeline before being used in screening decisions:

### 3.1 Validation Sequence

```
Ingest → Format Validation → Checksum Verification → Schema Validation → 
Deduplication → Timestamp Check → Quality Score → Approved for Screening
```

### 3.2 Validation Checks by Type

| Check | Method | Failure Action |
|-------|--------|----------------|
| **PGP Signature** | Verify against source public key | Reject batch; alert MLRO; use previous valid batch |
| **XSD Schema** | XML Schema Document validation | Reject malformed records; log to audit chain |
| **SHA-256 / MD5 Checksum** | Compare against source-published hash | Reject batch; trigger manual review |
| **Field Count** | Minimum required fields present | Filter incomplete records; flag for manual review |
| **Timestamp Freshness** | Ingest timestamp within SLA window | Alert via webhook; dashboard shows stale indicator |
| **Deduplication** | Entity matching across sources | Merge with canonical record; retain all source references |
| **JSON Schema** | FtM schema validation for OpenSanctions | Reject non-conforming records |

### 3.3 Quality Metrics (Target SLAs)

| Metric | Target | Alert Threshold | Owner |
|--------|--------|-----------------|-------|
| Sanctions list freshness | <24h stale | >6h for UN/OFAC | Engineering |
| PEP list freshness | <24h stale | >48h | Data Science |
| Adverse media freshness | <30 min (RSS) / real-time (APIs) | >2h gap | Engineering |
| Ingest success rate | >99% | <95% | Engineering |
| Schema validation pass rate | >99.5% | <98% | Data Science |
| Deduplication accuracy | >97% | <95% | Data Science |

---

## 4. Data Retention Policy

Per UAE FDL 10/2025 Art.24 and FATF Recommendation 11:

| Data Category | Retention Period | Storage | Deletion Method |
|---------------|-----------------|---------|-----------------|
| Screening decisions (audit chain) | **10 years** | Netlify Blobs (HMAC-sealed) | Cryptographic shredding |
| Subject records | **10 years** | Netlify Blobs | Secure deletion per PDPL |
| Adverse media snapshots | **10 years** | Netlify Blobs | Cryptographic shredding |
| Raw sanctions list snapshots | **10 years** | Netlify Blobs | Cryptographic shredding |
| STR/goAML submissions | **10 years** | Netlify Blobs + goAML archive | Per UAE FIU retention rules |
| System logs | **5 years** | Netlify log drain | Automated purge |
| API access logs | **3 years** | SIEM | Automated purge |

---

## 5. Data Subjects Rights (UAE PDPL / GDPR)

Per UAE Federal Decree-Law 45/2021 (PDPL):

| Right | Mechanism | SLA |
|-------|-----------|-----|
| Right of Access | `POST /api/compliance/subject-access-request` | 30 days |
| Right to Erasure | `POST /api/compliance/gdpr-erasure` | 30 days (subject to AML retention obligations) |
| Right to Rectification | Manual MLRO review + audit trail | 30 days |
| Data Portability | JSON export via AuditTrailViewer | On demand |

**Note:** AML retention obligations override erasure rights during the 10-year retention period. Erasure requests are logged and deferred until retention expiry.

---

## 6. Cross-Border Data Transfers

| Transfer | From | To | Legal Basis | Safeguards |
|----------|------|----|-------------|------------|
| goAML STR submission | UAE | UAE FIU | FDL 10/2025 Art.26-27 | TLS 1.3 + HMAC seal |
| OpenSanctions PEP data | EU/Global | UAE | Legitimate interest (AML compliance) | Data processing agreement |
| NewsAPI adverse media | US | UAE | Legitimate interest | Data processing agreement |

---

## 7. Data Lineage Diagram (Conceptual)

```
External Sources                Internal Processing              Output
─────────────────               ───────────────────              ──────
UN / OFAC / EU / UK  ──────────► Sanctions Ingest ──────────►  Screening Decision
UAE EOCN             ──────────► Deduplication   ──────────►  (MATCH/POSSIBLE/
OpenSanctions PEP    ──────────► Quality Gates   ──────────►   NO MATCH/ESCALATE)
NewsAPI / GDELT      ──────────► Brain Engine    ──────────►  
Google CSE / RSS     ──────────► Audit Chain     ──────────►  AuditTrailViewer
Corporate Registries ──────────► (HMAC-sealed)   ──────────►  goAML STR
GLEIF / LEI          ──────────►                              
```

---

## 8. Change Log

| Date | Change | Author | Approved By |
|------|--------|--------|-------------|
| 2026-05-10 | Initial document created | Data Science Lead | MLRO |

---

*This document is reviewed annually and whenever a new data source is added. All changes require MLRO approval and are recorded in the Change Control Log (docs/operations/CHANGE_CONTROL_LOG.md).*
