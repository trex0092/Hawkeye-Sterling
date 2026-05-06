# Data Lineage and Data Governance

**Document ID:** HS-DG-001  
**Version:** 2.0.0  
**Effective Date:** 2026-05-06  
**Review Cycle:** Quarterly; updated on any data source change  
**Owner:** Engineering Lead  
**Classification:** Restricted — Internal Compliance and Operations Use Only

---

## Table of Contents

1. [Purpose and Regulatory Basis](#1-purpose-and-regulatory-basis)
2. [Data Source Registry](#2-data-source-registry)
3. [Data Quality Gates](#3-data-quality-gates)
4. [Data Flow Architecture](#4-data-flow-architecture)
5. [Retention Policy](#5-retention-policy)
6. [Data Subject Rights (PDPL Compliance)](#6-data-subject-rights-pdpl-compliance)
7. [Known Data Quality Limitations](#7-known-data-quality-limitations)
8. [Change Log](#8-change-log)
9. [Document Control](#9-document-control)

---

## 1. Purpose and Regulatory Basis

This document establishes the authoritative record of all data sources that feed into the Hawkeye Sterling AML/CFT AI platform, the quality gates applied to each source, and the governance obligations associated with data ingestion, processing, and retention.

**Why data lineage is a compliance obligation:** Every screening output issued by Hawkeye Sterling must be traceable to the specific data sources, list versions, and ingestion timestamps used at the time of the screen. This is required by:

- **Charter P7** — every "no match" output must declare which lists were checked, the version date of those lists, and which identifiers were matched on
- **Charter P8** — stale data is inadmissible; the age of every data source must be declared and within tolerance
- **FDL 10/2025 Art. 24** — audit records must be sufficient to support regulatory inspection

Undisclosed data gaps, unvalidated ingestion, or untraceable source provenance are not acceptable in this regulatory context.

### Regulatory Basis

| Instrument | Relevance |
|---|---|
| **UAE Federal Decree-Law No. 10 of 2025 (FDL 10/2025), Art. 24** | Audit trail and record-retention requirements — minimum 5 years statutory; 10 years internal policy |
| **UAE Federal Decree-Law No. 45 of 2021 (PDPL)** | Personal data protection; lawful basis for processing; data subject rights; cross-border transfer controls |
| **FATF Recommendation R.11** | Record-keeping — must retain identification data, account files, and business correspondence |
| **FATF Recommendation R.1** | Risk-based approach — data quality directly determines screening efficacy |
| **UN Security Council Resolution 2462 (2019)** | Requires effective implementation of sanctions; stale data defeats that obligation |
| **Cabinet Decision No. 74 of 2020** | Targeted Financial Sanctions — sanctions list freshness is a legal obligation, not a preference |

---

## 2. Data Source Registry

### 2.1 Sanctions Lists

#### DS-001: UN Security Council Consolidated List

| Field | Value |
|---|---|
| Source ID | DS-001 |
| Display Name | UN Security Council Consolidated List (1267/1989 Committee and others) |
| Authority | UN Security Council |
| Publisher | UN Sanctions Monitoring Teams |
| Official URL | `https://scsanctions.un.org/consolidated/` |
| Environment Key | `UN_CONSOLIDATED_URL` |
| List IDs Produced | `un_1267` |
| Refresh Cadence | Daily |
| Format | XML |
| Adapter | `UN_CONSOLIDATED_ADAPTER` (`src/brain/watchlist-adapters.ts`) |
| Phase 2 Status | XML parser implementation pending |

**Validation Checks:**

| Check | Method | Failure Action |
|---|---|---|
| PGP Signature Verification | Verify against UN Security Council public key | Quarantine; block ingestion; CRITICAL incident |
| XSD Schema Validation | Validate against official UN XML schema | Quarantine; block ingestion; HIGH incident |
| MD5 Checksum | Compare to reference hash | Quarantine; investigate; HIGH incident |
| Record Count Sanity | Compare to previous count ± tolerance | Alert if > 5% change; MLRO review |
| Designation Continuity | Verify that previously designated entities are not silently removed | Alert on any removal; MLRO review |

**Quality SLAs:**

| Metric | Target | Breach Action |
|---|---|---|
| Freshness (age of list at time of screening) | ≤ 24 hours | Suspend screening; HIGH incident |
| Parse success rate | 100% | Block until resolved |
| Schema validation pass rate | 100% | Block until resolved |

**Known Limitations:**
- UN list covers entities designated under UNSCR 1267 and successor resolutions (Al-Qaida/Taliban/ISIL committees); other UN sanctions regimes require separate lists
- Delays of 24–48 hours between UNSC resolution adoption and list publication are documented and expected
- Transliteration variants in the XML may not cover all local-script versions; supplementary Arabic/Cyrillic fuzzy matching is applied at the engine layer

---

#### DS-002: OFAC Specially Designated Nationals (SDN) List

| Field | Value |
|---|---|
| Source ID | DS-002 |
| Display Name | OFAC Specially Designated Nationals and Blocked Persons List |
| Authority | US Department of the Treasury, Office of Foreign Assets Control |
| Publisher | OFAC |
| Official URL | `https://sanctionssearch.ofac.treas.gov/` |
| Environment Key | `OFAC_SDN_URL` |
| List IDs Produced | `ofac_sdn` |
| Refresh Cadence | Daily |
| Format | XML (primary); CSV (secondary) |
| Adapter | `OFAC_SDN_ADAPTER` (`src/brain/watchlist-adapters.ts`) |

**Validation Checks:** PGP verification, XSD schema validation, MD5 checksum, record count sanity, program-code continuity. Same failure actions as DS-001.

**Quality SLAs:** Same as DS-001.

**Known Limitations:**
- SDN list covers US primary sanctions; secondary sanctions exposure requires separate analysis at the screening stage
- Entity type classification (individual / organisation / vessel / aircraft) in the SDN XML may differ from the UN format; normalisation applied at adapter layer

---

#### DS-003: OFAC Consolidated Sanctions List

| Field | Value |
|---|---|
| Source ID | DS-003 |
| Display Name | OFAC Consolidated Sanctions List |
| Authority | US Department of the Treasury, OFAC |
| Environment Key | `OFAC_CONS_URL` |
| List IDs Produced | `ofac_cons` |
| Refresh Cadence | Daily |
| Format | XML |
| Adapter | `OFAC_CONS_ADAPTER` (`src/brain/watchlist-adapters.ts`) |

**Validation Checks and SLAs:** Same as DS-001.

---

#### DS-004: EU Consolidated Financial Sanctions List

| Field | Value |
|---|---|
| Source ID | DS-004 |
| Display Name | EU Consolidated List of Persons, Groups, and Entities Subject to EU Financial Sanctions |
| Authority | European Union, Official Journal of the European Union |
| Publisher | EU Financial Sanctions Files (FSF) — DG FISMA |
| Official URL | `https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions` |
| Environment Key | `EU_FSF_URL` |
| List IDs Produced | `eu_consolidated` |
| Refresh Cadence | Daily |
| Format | XML |
| Adapter | `EU_FSF_ADAPTER` (`src/brain/watchlist-adapters.ts`) |

**Validation Checks and SLAs:** Same as DS-001.

**Known Limitations:**
- EU list covers all EU restrictive measures; individual regulation-specific lists are consolidated into the single FSF file
- Amendments may lag the EU Official Journal by 4–8 hours; intra-day updates must be monitored for CRITICAL targets
- Transliteration of Cyrillic names (Russia/Belarus-related designations) follows EU transcription standards, which may differ from other lists; cross-list fuzzy matching applied

---

#### DS-005: UK OFSI Consolidated Sanctions List

| Field | Value |
|---|---|
| Source ID | DS-005 |
| Display Name | UK HM Treasury OFSI Consolidated Sanctions List |
| Authority | UK Office of Financial Sanctions Implementation (OFSI), HM Treasury |
| Official URL | `https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets` |
| Environment Key | `UK_OFSI_URL` |
| List IDs Produced | `uk_ofsi` |
| Refresh Cadence | Daily |
| Format | XML |
| Adapter | `UK_OFSI_ADAPTER` (`src/brain/watchlist-adapters.ts`) |

**Validation Checks and SLAs:** Same as DS-001.

**Known Limitations:**
- UK OFSI list diverged from EU list post-Brexit; some entities designated under EU law may not appear on the UK list and vice versa; both lists must be screened independently
- UK list includes Financial Sanctions Notices that may temporarily freeze additional entities pending formal consolidation; monitoring of OFSI notices is recommended for high-risk counterparties

---

#### DS-006: UAE EOCN / UAE Local Terrorist List

| Field | Value |
|---|---|
| Source ID | DS-006 |
| Display Name | UAE List of Terrorists and Terrorist Organisations (EOCN) and UAE Local Terrorist List |
| Authority | UAE National Security Council (via Executive Office for Control and Non-Proliferation — EOCN) |
| Environment Key | `UAE_EOCN_URL`; `UAE_LOCAL_TERRORIST_URL` |
| List IDs Produced | `uae_eocn`; `uae_local_terrorist` |
| Refresh Cadence | Weekly (minimum); ad-hoc updates monitored |
| Format | PDF |
| Adapter | `UAE_EOCN_ADAPTER`; `UAE_LOCAL_TERRORIST_ADAPTER` (`src/brain/watchlist-adapters.ts`) |
| Phase 2 Status | PDF parser implementation pending; current ingestion requires manual extraction |

**Validation Checks:**

| Check | Method | Failure Action |
|---|---|---|
| Document authenticity | Verify against official EOCN digital signature or manual download from official portal | Block ingestion if unable to verify source |
| Record count | Compare to prior version | Alert on any change; MLRO review mandatory |
| MD5 checksum | Hash of PDF file | Quarantine on mismatch |

**Quality SLAs:**

| Metric | Target | Breach Action |
|---|---|---|
| Freshness | ≤ 7 days | HIGH incident; manual monitoring of official portal |
| Ingestion success | 100% | CRITICAL if PDF parser fails in Phase 2 |

**Known Limitations:**
- **PDF format** is the current official publication format; automated PDF parsing is a Phase 2 deliverable
- Interim process: manual extraction and data entry with dual-review by Compliance Officer and Engineering Lead
- Transliteration of Arabic names requires manual review for Arabic-script entities
- **CRITICAL regulatory note:** UAE EOCN designations carry an immediate legal obligation to freeze without prior judicial order. The 24-hour freeze window (Cabinet Decision 74/2020 Art. 4) applies from the moment of identification. Freshness of this list is therefore non-negotiable.

---

### 2.2 PEP Database

#### DS-007: OpenSanctions PEP Database

| Field | Value |
|---|---|
| Source ID | DS-007 |
| Display Name | OpenSanctions Politically Exposed Persons (PEP) Database |
| Authority | Wikidata, national government gazettes, parliamentary records, company registries |
| Publisher | OpenSanctions (open-source project) |
| Official URL | `https://www.opensanctions.org/datasets/peps/` |
| Refresh Cadence | Daily |
| Format | JSON / CSV (FollowTheMoney data model) |
| Coverage | 240+ jurisdictions; individuals and organisations |

**Validation Checks:**

| Check | Method | Failure Action |
|---|---|---|
| Schema validation | Validate against FtM (FollowTheMoney) schema | Block; HIGH incident |
| Record count sanity | Compare to prior count ± tolerance | Alert if > 10% change |
| Source attribution | Each record carries source references | Log records with missing source attribution |

**Quality SLAs:**

| Metric | Target | Breach Action |
|---|---|---|
| Freshness | ≤ 24 hours | HIGH incident |
| PEP classification accuracy | Manually sampled quarterly at ≥ 95% | Governance committee review if below |

**Known Limitations:**
- Sub-national PEP categories (e.g., senior local government officials in smaller jurisdictions) may be underrepresented
- RCA (Related and Close Associate) relationships are included where publicly documented but may be incomplete; manual supplementation required for high-risk cases
- PEP declassification (post-office cooling-off periods: 1–5 years depending on prominence) requires MLRO review for formal declassification (D17)
- Historical PEP records may lag by 24–72 hours for newly appointed officials

---

### 2.3 Adverse Media Sources

#### DS-008: NewsAPI

| Field | Value |
|---|---|
| Source ID | DS-008 |
| Display Name | NewsAPI Commercial News Aggregator |
| Authority | Commercial aggregator (NewsAPI.org) |
| Access Method | REST API with API key (`NEWSAPI_KEY` environment variable) |
| Refresh Cadence | Real-time (on-demand query) |
| Coverage | 150,000+ news sources; 54 countries; multiple languages |
| Query Method | Boolean query string (`ADVERSE_MEDIA_QUERY` from `src/brain/adverse-media.ts`) |

**Validation Checks:**

| Check | Method | Failure Action |
|---|---|---|
| API response status | HTTP 200 required | Alert; retry with exponential backoff; MEDIUM incident if persistent |
| Response schema | Validate JSON structure | Alert; log malformed responses |
| Duplicate detection | `rawHash` of article URL + title | Deduplicate before classification |

**Known Limitations:**
- Free-tier NewsAPI has a 30-day historical limit; older adverse media must be obtained via manual research or archive subscriptions
- Paywalled articles return only titles and descriptions; full-text analysis requires subscription or manual review
- Coverage of local-language regional media in the Gulf, South Asia, and Central Asia is limited

---

#### DS-009: GDELT (Global Database of Events, Language, and Tone)

| Field | Value |
|---|---|
| Source ID | DS-009 |
| Display Name | GDELT Global Knowledge Graph |
| Authority | Academic / open source (Kalev Leetaru, Georgetown University) |
| Access Method | REST API / BigQuery |
| Refresh Cadence | Every 15 minutes |
| Coverage | 100+ languages; global event monitoring since 1979; 65+ billion events |

**Validation Checks:**

| Check | Method | Failure Action |
|---|---|---|
| Ingestion job success | Monitor for failed batch jobs | MEDIUM incident if > 1 batch missed |
| Entity resolution quality | Sample-based MLRO review quarterly | Flag anomalies |

**Known Limitations:**
- GDELT's automated event coding may produce noise; high false-positive rate for geopolitical events vs. financial crime
- Not a primary source; corroboration with DS-008 or DS-010 required before actioning any GDELT-only finding

---

#### DS-010: Google Custom Search Engine (CSE)

| Field | Value |
|---|---|
| Source ID | DS-010 |
| Display Name | Google Custom Search Engine |
| Authority | Commercial (Alphabet Inc.) |
| Access Method | REST API (`GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX` environment variables) |
| Refresh Cadence | Real-time (on-demand query) |
| Coverage | Targeted to compliance-relevant domains; configurable via CSE configuration |

**Validation Checks:**

| Check | Method | Failure Action |
|---|---|---|
| API response status | HTTP 200 required | Alert; retry; MEDIUM incident |
| Result relevance | Keyword match in snippet or title | Filter on `ADVERSE_MEDIA_QUERY` terms |

**Known Limitations:**
- CSE searches are limited to the domains configured in the Google CSE console; configuration must be reviewed quarterly for coverage completeness
- Rate limits apply; high-volume screening may require quota management

---

#### DS-011: RSS Feeds

| Field | Value |
|---|---|
| Source ID | DS-011 |
| Display Name | Configurable RSS Media Feed Set |
| Authority | Various media outlets (configurable) |
| Access Method | HTTP feed parser |
| Refresh Cadence | 30-minute polling |
| Coverage | Operator-configured feed list; targets AML/CFT-relevant publications, regulatory news, and regional media |

**Validation Checks:**

| Check | Method | Failure Action |
|---|---|---|
| Feed availability | HTTP 200 on poll | Alert; MEDIUM incident if > 3 consecutive failures |
| Feed schema | Valid RSS/Atom XML | Log and skip malformed feeds |
| Duplicate detection | `rawHash` of article URL + title | Deduplicate |

**Known Limitations:**
- RSS coverage is bounded by the configured feed list; curation is manual and requires quarterly review
- 30-minute polling creates a maximum 30-minute lag for breaking news

---

## 3. Data Quality Gates

### 3.1 Gate Pipeline

Every data source ingestion passes through the following gates before data is admitted into the screening pipeline:

```
Raw Data Received
      │
      ▼
Gate 1: Transport Integrity
  └── PGP signature verification (where applicable)
  └── TLS certificate validation
      │
      ▼
Gate 2: Format Integrity
  └── XSD schema validation (XML sources)
  └── JSON schema validation (JSON sources)
  └── CSV column count and header validation (CSV sources)
      │
      ▼
Gate 3: Checksum Verification
  └── MD5 checksum comparison to reference
  └── SHA-256 hash stored for tamper-evidence
      │
      ▼
Gate 4: Semantic Validation
  └── Record count sanity (± tolerance from prior)
  └── Mandatory field presence (listId, sourceRef, primaryName, entityType, ingestedAt, rawHash)
  └── Designation continuity (prior designations not silently dropped)
      │
      ▼
Gate 5: Deduplication
  └── rawHash comparison against existing records
  └── Duplicate records merged or discarded per dq-rules
      │
      ▼
Admitted to Screening Pipeline
```

### 3.2 Gate Failure Actions

| Gate | Failure | Immediate Action | Incident Severity |
|---|---|---|---|
| Gate 1 (PGP) | Signature mismatch | Quarantine; block ingestion; notify MLRO | CRITICAL |
| Gate 1 (TLS) | Certificate error | Retry; if persistent, block ingestion | HIGH |
| Gate 2 (Schema) | Schema validation failure | Quarantine; block ingestion; alert Engineering | HIGH |
| Gate 3 (Checksum) | Checksum mismatch | Quarantine; investigate; alert Engineering | HIGH (CRITICAL if sanctions list) |
| Gate 4 (Count sanity) | Count deviation > tolerance | Alert; MLRO review before proceeding | MEDIUM |
| Gate 4 (Designation continuity) | Unexpected removal of designation | Alert; MLRO review; do not remove until confirmed | HIGH |
| Gate 5 (Deduplication) | Deduplication error | Log and proceed with deduplicated data | LOW |

### 3.3 Quality Metrics

The following metrics are monitored continuously and reported at the weekly governance committee meeting:

| Metric | Target | Source |
|---|---|---|
| Overall data quality score | ≥ 95% | `src/brain/dq-rules.ts` |
| Sanctions list freshness (UN, OFAC, EU, UK) | ≤ 24 hours | Ingestion timestamp |
| Sanctions list freshness (UAE EOCN) | ≤ 7 days | Ingestion timestamp |
| PEP database freshness | ≤ 24 hours | Ingestion timestamp |
| Adverse media freshness (NewsAPI/CSE) | ≤ 5 minutes | Query timestamp |
| Adverse media freshness (GDELT) | ≤ 15 minutes | Ingestion timestamp |
| Adverse media freshness (RSS) | ≤ 30 minutes | Polling timestamp |
| Gate pass rate (all sources) | ≥ 99.9% | Ingestion pipeline telemetry |
| Deduplication rate | Monitored; investigate if > 20% duplicate rate | `rawHash` dedup log |

---

## 4. Data Flow Architecture

### 4.1 Ingestion to Screening

```
External Data Sources
│
├── Sanctions Lists (DS-001 to DS-006)
│   └── Daily/weekly batch ingestion → Quality Gates → NormalisedListEntry[]
│   └── Stored in watchlist store with ingestedAt, rawHash, listVersionDate
│
├── PEP Database (DS-007)
│   └── Daily batch ingestion → Quality Gates → NormalisedListEntry[]
│
└── Adverse Media (DS-008 to DS-011)
    └── Continuous / polled ingestion → classifyAdverseMedia() → hit records
          │
          ▼
    Screening Engine (HS-001)
          │
          ├── Identifier-Exact Match (Tier 1)
          ├── Name-Exact Match (Tier 2)
          └── Fuzzy + Matrix Match (Tier 3)
                │
                ▼
          Structured Finding (with scope declaration, list version date, ingestion timestamp)
                │
                ▼
          MLRO Review → Disposition → goAML Submission (where applicable)
```

### 4.2 Audit Trail

Every data ingestion event, screening run, and disposition is recorded in the audit chain (`src/brain/audit-chain.ts`) with a tamper-evident hash. The chain anchor is included in every goAML submission receipt. The audit chain is immutable: records may not be deleted or modified after creation.

### 4.3 Scope Declaration Requirement

Per charter P7, every screening output must include:
- Which lists were checked (by `listId`)
- The `listVersionDate` for each list (ISO date of the list snapshot used)
- Which identifiers were matched on
- Which identifiers were absent from the input
- The `ingestedAt` timestamp for each list used

This information is sourced directly from the `NormalisedListEntry.ingestedAt` and `WatchlistAdapter.listId` fields.

---

## 5. Retention Policy

### 5.1 Statutory and Internal Policy Requirements

Per FDL 10/2025 Art. 24, records must be retained for a minimum of 5 years from the end of the customer relationship or transaction date. Internal Hawkeye Sterling policy sets a higher standard of **10 years** for all record classes listed below.

The retention calculator (`src/brain/retention-policy.ts`) enforces these rules programmatically.

### 5.2 Retention Schedule

| Record Class | Anchor | Statutory (years) | Internal Policy (years) | Permanent Hold Triggers | Regulatory Anchor |
|---|---|---|---|---|---|
| `cdd_customer_file` | End of relationship | 5 | 10 | Regulator investigation; litigation hold | FDL 10/2025 Art. 24 |
| `transaction_log` | Creation date | 5 | 10 | Regulator investigation; litigation hold | FDL 10/2025 Art. 24 |
| `screening_evidence` | Creation date | 5 | 10 | Regulator investigation | FDL 10/2025 Art. 24 |
| `str_filing` | Filing date | 5 | 10 | Regulator investigation | FATF R.11; FDL 10/2025 Art. 24 |
| `sar_filing` | Filing date | 5 | 10 | Regulator investigation | FATF R.11; FDL 10/2025 Art. 24 |
| `ffr_filing` | Filing date | 10 | 10 | Sanctions still in force | Cabinet Resolution 74/2020 |
| `pnmr_filing` | Filing date | 5 | 10 | — | Cabinet Resolution 74/2020 |
| `mlro_decision` | Creation date | 5 | 10 | Regulator investigation | FDL 10/2025 |
| `training_record` | Creation date | 3 | 5 | — | FATF R.18 |
| `audit_report` | Creation date | 5 | 10 | Regulator investigation | Three Lines Model |
| `regulator_correspondence` | Creation date | 5 | 10 | Regulator investigation | FDL 10/2025 |
| `adverse_media_evidence` | Creation date | 5 | 10 | — | FDL 10/2025 |
| `lbma_oecd_provenance` | Creation date | 5 | 10 | — | LBMA RGG; OECD DDG |
| `incident_report` | Incident date | 5 | 10 | Regulator investigation | FDL 10/2025 |

### 5.3 Permanent Hold

A permanent hold suspends the retention clock and prohibits destruction of a record. Permanent holds are triggered by:
- Active regulator investigation referencing or potentially implicating the record
- Active litigation hold (D26) where the record is within scope
- FFR filings where the underlying sanctions designation remains in force

Permanent holds must be documented with: hold reference number, scope description, invoking authority, date invoked, and expected duration. Holds are reviewed quarterly for continued applicability.

### 5.4 Destruction Protocol

Records reaching the end of their retention period without a permanent hold trigger must be destroyed securely:
- Destruction must be documented with a destruction certificate (record class, record identifiers, destruction date, method, authorising officer)
- Destruction must be approved by the MLRO
- Cryptographic shredding is the approved method for records in encrypted storage
- Destruction certificates are themselves retained for 5 years

---

## 6. Data Subject Rights (PDPL Compliance)

### 6.1 Regulatory Basis

The UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021, PDPL) grants data subjects rights over their personal data. Processing of personal data in the AML/CFT context must have a lawful basis and must comply with data minimisation, purpose limitation, and accuracy principles.

### 6.2 Lawful Basis for Processing

| Processing Activity | Lawful Basis | Legal Reference |
|---|---|---|
| Sanctions screening | Legal obligation | FDL 20/2018; Cabinet Decision 74/2020 |
| PEP screening | Legal obligation | FATF R.12; FDL 20/2018 |
| Adverse media screening | Legitimate interest (AML/CFT compliance) | FDL 20/2018; FATF R.10 |
| CDD/EDD data collection | Legal obligation; contract performance | FDL 20/2018 Art. 14 |
| STR/SAR filing | Legal obligation | FDL 20/2018 Art. 15 |
| Audit trail retention | Legal obligation | FDL 10/2025 Art. 24 |

### 6.3 Data Subject Rights and AML/CFT Limitations

| Right | PDPL Provision | Mechanism | SLA | AML/CFT Limitation |
|---|---|---|---|---|
| Right to access | Art. 15 | `POST /api/compliance/subject-access-request` | 30 days | May be restricted to prevent tipping-off a subject under investigation |
| Right to rectification | Art. 16 | Manual MLRO review + audit trail | 30 days | Factual corrections actioned; findings based on authoritative list data cannot be "corrected" by subject request |
| Right to erasure | Art. 17 | `POST /api/compliance/gdpr-erasure` | 30 days | Suspended for the duration of the statutory retention period; erasure before end of retention period is prohibited |
| Right to restriction | Art. 18 | Manual MLRO review | 30 days | AML/CFT legal obligation overrides where a legal obligation applies |
| Right to portability | Art. 22 | JSON export via AuditTrailViewer | On demand | Applies to data provided by the subject; not to derived screening findings |
| Right to object | Art. 21 | Manual MLRO review | 30 days | AML/CFT legal obligation overrides right to object |

**Note:** AML/CFT retention obligations override erasure rights during the 10-year retention period. All erasure requests are logged and deferred until retention expiry, or actioned where the record falls outside the AML/CFT retention scope.

### 6.4 Data Subject Request Procedure

Data subject requests (DSRs) relating to AML/CFT data must be referred to the MLRO and Legal Counsel immediately. No response is issued without MLRO sign-off. All DSRs and responses are logged in the DSR register and retained for 10 years.

**Critical note:** Any DSR from a subject who is also the subject of a pending investigation, STR, SAR, or regulatory inquiry must be reviewed by Legal Counsel for tipping-off risk before any response is prepared.

### 6.5 Cross-Border Data Transfer

| Transfer | From | To | Legal Basis | Safeguards |
|---|---|---|---|---|
| goAML STR/SAR/FFR submission | UAE | UAE FIU | FDL 10/2025 Art. 26–27 | TLS 1.3 + HMAC-sealed audit chain |
| OpenSanctions PEP data | EU/Global | UAE | Legitimate interest (AML compliance) | Data processing agreement |
| NewsAPI adverse media | US | UAE | Legitimate interest | Data processing agreement |
| GDELT data | Academic (US) | UAE | Legitimate interest | Public data; no PII transmitted to GDELT |

Engineering Lead maintains a cross-border transfer register documenting transfer mechanisms for each data source. Register is reviewed at each quarterly data lineage review.

### 6.6 Privacy by Design

- **Data minimisation** — only personal data fields required for screening are ingested and retained
- **Purpose limitation** — AML/CFT screening data is not used for other purposes without separate legal basis
- **Accuracy** — ingestion quality gates enforce schema-validated, integrity-checked data only
- **Storage limitation** — retention calculator enforces earliest possible destruction at end of retention period
- **Security** — mutual-TLS on all API connections; encrypted storage at rest; RBAC controls on all case data

---

## 7. Known Data Quality Limitations

| Limitation | Affected Sources | Impact | Mitigation |
|---|---|---|---|
| UAE EOCN PDF format | DS-006 | Manual extraction required; risk of transcription error | Dual-review by Compliance Officer and Engineering Lead; Phase 2 PDF parser delivery prioritised |
| Local-language media gap | DS-008, DS-011 | Adverse media in non-indexed local outlets missed | Extended RSS feed list; MLRO manual monitoring for high-risk jurisdictions |
| Paywalled content | DS-008, DS-010 | Full article text unavailable | Subscriptions maintained where material; gap declared in scope section of screening output |
| Sub-national PEP gaps | DS-007 | Some sub-national PEPs not in OpenSanctions | Manual supplementation for high-risk cases; quarterly coverage audit |
| Transliteration variants | DS-001 to DS-006 | Name variants across scripts may not match | Fuzzy matching at engine layer; POSSIBLE confidence maximum for transliterated matches without native-script corroboration |
| GDELT noise | DS-009 | High false-positive rate for geopolitical events | Corroboration required from DS-008 or DS-010 before actioning GDELT-only findings |
| NewsAPI historical limit | DS-008 | Articles older than 30 days not accessible via API | Manual research or archive subscriptions for historical adverse media |
| RSS polling lag | DS-011 | Up to 30-minute delay on breaking news | NewsAPI real-time queries used for high-priority subjects |
| UN/OFAC publication lag | DS-001, DS-002 | 24–48-hour gap between UNSC resolution and list update | Supplementary manual monitoring of official UN/OFAC announcement channels |

---

## 8. Change Log

| Date | Version | Change | Author | Approved By |
|---|---|---|---|---|
| 2026-05-10 | 1.0.0 | Initial document created | Data Science Lead | MLRO |
| 2026-05-06 | 2.0.0 | Major revision: aligned to AI Governance Policy v1.0.0; added full gate pipeline, PDPL rights mechanism table, cross-border transfer register, destruction protocol, Phase 2 status fields | Engineering Lead | MLRO |

---

## 9. Document Control

| Field | Value |
|---|---|
| Document ID | HS-DG-001 |
| Version | 2.0.0 |
| Created | 2026-05-10 |
| Last Revised | 2026-05-06 |
| Next mandatory review | 2026-08-06 (quarterly) |
| Approver (Engineering Lead) | [Signature required] |
| Approver (MLRO) | [Signature required] |
| Related documents | `docs/governance/AI_GOVERNANCE_POLICY.md`, `docs/governance/AI_INVENTORY.md`, `docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md` |
| Regulatory references | UAE FDL 10/2025 Art. 24; UAE PDPL (FDL 45/2021); FATF R.11; Cabinet Decision 74/2020 |
| Retention | 10 years from creation date (FDL 10/2025 Art. 24; record class: `audit_report`) |
