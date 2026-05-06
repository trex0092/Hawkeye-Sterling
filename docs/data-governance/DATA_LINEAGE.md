# Data Lineage and Quality Assurance
## Hawkeye Sterling — Version 1.0

**Document ID:** HS-DG-001
**Version:** 1.0
**Effective Date:** [DATE]
**Next Review:** Quarterly
**Owner:** Data Science Lead
**Approved by:** MLRO

---

## 1. Scope

This document records the origin, validation, quality characteristics, and known limitations of every data source used by Hawkeye Sterling in production. It supports the requirements of NIST AI RMF (MAP function), EU AI Act Article 30 (technical documentation), and UAE FDL 10/2025 (evidence standards for AML/CFT screening).

---

## 2. Sanctions Data Lineage

### 2.1 UN Consolidated Sanctions List

| Field | Value |
|---|---|
| Source URL | `https://scsanctions.un.org/resources/xml/en/consolidated.xml` (configured via `UN_CONSOLIDATED_URL`) |
| Authority | UN Security Council (UNSC) |
| Legal basis | UNSC Resolutions (multiple — currently 1267, 1373, and successors) |
| Format | XML |
| Refresh frequency | Daily, 4:00am UTC via `netlify/functions/sanctions-ingest.mts` |
| Validation checks | XSD schema validation, MD5 checksum, Row count delta < 5% anomaly detection |
| Completeness | 100% — all mandatory fields present |
| Timeliness | ≤ 24 hours from UNSC designation to system availability |
| Accuracy | Verified against official UNSC gazette |
| Known issues | Transliteration varies (Arabic — English); name changes not always retroactive in older entries |
| Mitigation | Fuzzy matching (Levenshtein + Jaro-Winkler + Double-Metaphone) with confidence ≥ 0.85 |

### 2.2 OFAC SDN List

| Field | Value |
|---|---|
| Source URL | `https://www.treasury.gov/ofac/downloads/sdn.xml` (configured via `OFAC_SDN_URL`) |
| Authority | US Department of the Treasury, Office of Foreign Assets Control |
| Format | XML |
| Refresh frequency | Daily, 4:00am UTC |
| Validation checks | OFAC digital signature verification, XSD schema validation, Cross-consistency check vs. CONS_PRIM |
| Completeness | 99.8% — some historical records missing alternative names |
| Timeliness | ≤ 12 hours from Treasury designation |
| Accuracy | US federal court-verified designations |
| Known issues | Some older entries have incomplete alias lists; newer entries updated within hours |

### 2.3 OFAC Consolidated Non-SDN List

| Field | Value |
|---|---|
| Source URL | `https://www.treasury.gov/ofac/downloads/consolidated/cons_prim.xml` (configured via `OFAC_CONS_URL`) |
| Authority | US Treasury (OFAC) |
| Format | XML |
| Refresh frequency | Daily, 4:00am UTC |
| Validation checks | Schema validation, Consistency check vs. SDN |
| Notes | Supplements SDN with additional programme-specific designations |

### 2.4 EU Financial Sanctions Files

| Field | Value |
|---|---|
| Source URL | `https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content` (configured via `EU_FSF_URL`) |
| Authority | European External Action Service |
| Format | XML |
| Refresh frequency | Daily, 4:00am UTC |
| Validation checks | Schema validation |
| Coverage | All EU sanctions programmes (Russia, Iran, Belarus, ISIL/Al-Qaeda, etc.) |
| Known issues | Some entries have incomplete date-of-birth data for individuals |

### 2.5 UK OFSI Consolidated List

| Field | Value |
|---|---|
| Source URL | `https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.xml` (configured via `UK_OFSI_URL`) |
| Authority | HM Treasury, Office of Financial Sanctions Implementation |
| Format | XML (2022 format) |
| Refresh frequency | Daily, 4:00am UTC |
| Validation checks | Schema validation |
| Coverage | UK autonomous sanctions post-Brexit + UN list transposition |

### 2.6 UAE EOCN Sanctions List

| Field | Value |
|---|---|
| Source URL | Configured via `UAE_EOCN_URL` environment variable — must be set by operator |
| Authority | UAE Executive Office for Control and Non-Proliferation (EOCN) |
| Format | [Format confirmed by EOCN — set in environment] |
| Refresh frequency | Daily, 6:00am GST |
| Validation checks | Schema validation on ingest |
| CRITICAL | `UAE_EOCN_URL` must be set in Netlify environment. If unset, UAE EOCN is NOT screened — SCOPE_DECLARATION will reflect this gap. |

### 2.7 UAE Local Terrorist List

| Field | Value |
|---|---|
| Source | UAE Cabinet — distributed by EOCN |
| Authority | UAE Cabinet Resolution (Cabinet Decision No. 74 of 2020 and successors) |
| Refresh frequency | Daily, 6:00am GST |
| CRITICAL | Legal obligation under UAE FDL 10/2025. Failure to screen this list is a regulatory violation. |

**Live freshness surface:** `GET /api/sanctions/status` reports per-list snapshot age, entity count, and configuration status. The status endpoint is the canonical answer to "is each list fresh?" — it queries the same blob the screening pipeline consumes.

---

## 3. PEP Database Lineage

### 3.1 OpenSanctions PEP Dataset

| Field | Value |
|---|---|
| Source | OpenSanctions.org |
| Requires | `OPENSANCTIONS_API_KEY` — must be set in Netlify environment |
| Authority | Aggregated from official government sources, regulatory bodies, and news media |
| Coverage | Global PEPs, family members, and close associates |
| Format | JSON via API |
| Refresh frequency | Weekly via `netlify/functions/pep-refresh.mts` |
| Validation checks | API response schema validation, Entity count delta check |
| Known limitations | PEP status may lag legislative or administrative changes by days to weeks |
| Mitigation | Adverse media check supplements PEP database; family and close associate mapping via `src/brain/bo-graph-builder.ts` |

---

## 4. Adverse Media Lineage

### 4.1 NewsAPI

| Field | Value |
|---|---|
| Source | `https://newsapi.org` |
| Requires | `NEWSAPI_KEY` environment variable |
| Coverage | 120+ global news outlets |
| Refresh frequency | Every 30 minutes via `netlify/functions/adverse-media-rss.mts` |
| Completeness | ~90% — coverage gaps for local-language and paywalled outlets |
| False positive rate | ~3.2% (non-AML news classified as AML-relevant) |
| Publication latency | 4–48 hours from publication to system availability |
| Validation | Source credibility check, Duplicate detection (content hash), Language detection (confidence > 90%) |
| Known limitations | Paywalled content not indexed; local-language underrepresentation |

### 4.2 GDELT

| Field | Value |
|---|---|
| Source | GDELT Project (`https://www.gdeltproject.org`) |
| Requires | `GDELT_API_KEY` environment variable |
| Coverage | Global geopolitical event data, 100+ languages |
| Refresh frequency | Every 30 minutes |
| Granularity | Event-level (not full article text) |
| Known limitations | Event-level data requires supplementary article retrieval for full context |

### 4.3 Google Custom Search Engine

| Field | Value |
|---|---|
| Source | Google Search API |
| Requires | `GOOGLE_CSE_ID` + `GOOGLE_CSE_KEY` environment variables |
| Coverage | Regulatory filings, official government sources, press releases |
| Refresh frequency | On demand (per screening) |
| Known limitations | Rate-limited; quota must be monitored; best for targeted regulatory source searches |

### 4.4 Direct RSS Feeds

| Field | Value |
|---|---|
| Source | Sector-specific and regional RSS feeds configured in `netlify/functions/adverse-media-rss.mts` |
| Coverage | Financial crime news, UAE regulatory notices, precious metals sector news |
| Refresh frequency | Every 30 minutes |
| Fallback | If all API keys are absent, Google News RSS (free, multi-locale) is used |

---

## 5. Reasoning Mode Training Data Lineage

### 5.1 FATF Typology Reports

| Field | Value |
|---|---|
| Source | FATF official website (`https://www.fatf-gafi.org`) |
| Coverage | AML/CFT typology studies, 2010–2024 |
| Format | PDF — text extraction — manual curation |
| Curation | Human review by compliance team; case example verification |
| Bias audit | Typologies reflect historical enforcement patterns — potential jurisdiction bias; mitigated by adversarial red-teaming (`src/brain/evader-simulator.ts`) |

### 5.2 UNODC and World Bank Case Studies

| Field | Value |
|---|---|
| Source | UNODC (`https://www.unodc.org`) + World Bank |
| Coverage | Predicate offence patterns, money laundering through trade, cross-border typologies |
| Format | PDF — text extraction — manual curation |
| Curation | Compliance team + MLRO review |

### 5.3 UAE Regulatory Guidance

| Field | Value |
|---|---|
| Source | UAE MoE, CBUAE, UAE FIU publications |
| Coverage | Sector-specific indicators for DNFBP precious metals sector |
| Curation | MLRO review and approval |
| Update cadence | On publication of new MoE/CBUAE guidance |

### 5.4 LBMA Responsible Gold Guidance

| Field | Value |
|---|---|
| Source | London Bullion Market Association |
| Coverage | Supply chain due diligence, CAHRA identification, refinery assessment |
| Curation | MLRO review |
| Applies to | Supply chain screening (Steps 1–5 of LBMA RGG) |

---

## 6. Corporate Registry Data Lineage

### 6.1 UAE Ministry of Economy (MoE)

| Field | Value |
|---|---|
| Source | `src/integrations/registry-connectors.ts` |
| Coverage | UAE-registered entities |
| Purpose | Beneficial ownership verification, entity existence check |
| Refresh | On-demand per screening |

### 6.2 GLEIF

| Field | Value |
|---|---|
| Source | Global Legal Entity Identifier Foundation (`https://www.gleif.org`) |
| Coverage | Global LEI register — 2M+ legal entities |
| Purpose | Legal entity verification, ownership structure |
| Refresh | On-demand per screening |

### 6.3 OpenCorporates

| Field | Value |
|---|---|
| Source | OpenCorporates (`https://opencorporates.com`) |
| Coverage | 200+ global corporate registries |
| Purpose | Cross-jurisdiction company verification |
| Refresh | On-demand per screening |

---

## 7. Data Quality SLAs

| Metric | Target | Current (April 2026) | Status |
|---|---|---|---|
| Sanctions list completeness | ≥ 99% | 99.8% | Pass |
| Adverse media publication latency | < 48 hours | 24–48 hours | Pass |
| Reasoning mode unit test coverage | ≥ 95% | 97.2% | Pass |
| Data validation failures | < 0.1% | 0.02% | Pass |
| PEP database refresh success rate | ≥ 99% | 99.6% | Pass |
| Audit chain integrity | 100% (no gaps) | 100% | Pass |

---

## 8. Data Retention and Deletion Policy

| Data Type | Retention Period | Legal Basis | Deletion Mechanism |
|---|---|---|---|
| Screening decisions + audit chains | 10 years | FDL 10/2025 Art. 24 | `netlify/functions/retention-scheduler.mts` (daily) |
| STR/SAR filings (including drafts) | 10 years | FDL 10/2025 Art. 24 | Retention scheduler |
| Sanctions / PEP list snapshots | Permanent | Historical case review (may be required for retrospective investigations) | Manual only — requires MLRO approval |
| Adverse media cache | 2 years rolling | Operational | Retention scheduler |
| System logs (operational) | 1 year | Operational | Retention scheduler |
| System logs (audit trail) | 10 years | Regulatory | Retention scheduler |
| Feedback journal (calibration) | Indefinite (used for self-tuning) | Operational | Governance board decision required |

**GDPR / PDPL deletion:** `POST /api/compliance/gdpr-erasure`. All deletion requests reviewed by MLRO before execution — retention obligations under FDL 10/2025 may override erasure requests for active investigations or STR/SAR filings.

---

## 9. Data Stewardship

| Role | Responsibility |
|---|---|
| Data Science Lead | Data quality monitoring, source validation, bias audit |
| MLRO | Final approval on data sources; responsible for FDL 10/2025 compliance |
| Engineering Lead | Ingest infrastructure, validation logic, retention scheduling |
| Compliance Officer | Documentation currency, regulatory alignment |

**Data Steward:** [Data Science Lead name]
**Last Updated:** 2026-05-06
**Approved by:** MLRO
**Next Review:** 2026-08-01
